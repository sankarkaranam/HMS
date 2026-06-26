import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import { addMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { db } from '../../db/client';
import {
  appointments, patients, doctors, clinics, clinicGroups,
  payments, appointmentReminders, doctorAvailability,
} from '../../db/schema';
import { validate, validateQuery } from '../../middleware/validate';
import { authMiddleware, requireRole, AuthenticatedRequest } from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import { emailQueue } from '../../queues';
import { auditLog } from '../../lib/audit';

const router: Router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const bookAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  appointmentDatetime: z.string().datetime(),
  consultationType: z.enum(['in_person', 'teleconsult']).default('in_person'),
  notes: z.string().max(1000).optional(),
  paymentMode: z.enum(['online', 'offline']).default('online').optional(),
  // Patient details (upsert by phone within clinic group)
  patient: z.object({
    name: z.string().min(2).max(255),
    phone: z.string().regex(/^\+?[0-9]{10,15}/),
    email: z.string().email().optional(),
    age: z.coerce.number().min(0).max(150).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  }),
});

const cancelAppointmentSchema = z.object({
  reason: z.string().min(3).max(500),
});

const listAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doctorId: z.string().uuid().optional(),
  status: z.enum(['pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ─── GET /clinics/:clinicId/appointments ─────────────────────────────────────

router.get('/clinics/:clinicId/appointments', authMiddleware,
  validateQuery(listAppointmentsQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string as string;
      const { date, doctorId, status, page, limit } = req.query as any;

      const conditions = [eq(appointments.clinicId, clinicId)];

      if (doctorId) conditions.push(eq(appointments.doctorId, doctorId));
      if (status) conditions.push(eq(appointments.status, status));
      if (date) {
        const start = new Date(`${date}T00:00:00.000Z`);
        const end = new Date(`${date}T23:59:59.999Z`);
        conditions.push(gte(appointments.appointmentDatetime, start));
        conditions.push(lte(appointments.appointmentDatetime, end));
      }

      const offset = (page - 1) * limit;

      const [rows, countResult] = await Promise.all([
        db.query.appointments.findMany({
          where: and(...conditions),
          with: { patient: true, doctor: true, payment: true },
          orderBy: desc(appointments.appointmentDatetime),
          limit,
          offset,
        }),
        db.select({ count: sql<number>`count(*)::int` })
          .from(appointments)
          .where(and(...conditions)),
      ]);

      const total = countResult[0]?.count ?? 0;

      return res.json({
        data: rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });

    } catch (err) { next(err); }
  }
);

// ─── POST /clinics/:clinicId/book — Book an appointment ──────────────────────

router.post('/clinics/:clinicId/book',
  validate(bookAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string;
      const { doctorId, appointmentDatetime, consultationType, notes, patient: patientData, paymentMode = 'online' } = req.body;

      // 1. Validate clinic + doctor exist
      const clinic = await db.query.clinics.findFirst({
        where: and(eq(clinics.id, clinicId), eq(clinics.isActive, true)),
      });
      if (!clinic) throw new AppError('Clinic not found', 404);

      const doctor = await db.query.doctors.findFirst({
        where: and(eq(doctors.id, doctorId), eq(doctors.clinicId, clinicId), eq(doctors.isActive, true)),
      });
      if (!doctor) throw new AppError('Doctor not found in this clinic', 404);

      const slotDatetime = new Date(appointmentDatetime);
      if (slotDatetime <= new Date()) throw new AppError('Cannot book a past appointment', 400);

      // 2. Check for slot conflict (race condition prevention)
      const existingApt = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.doctorId, doctorId),
          eq(appointments.appointmentDatetime, slotDatetime),
        ),
      });

      // 3. Upsert patient within the clinic group
      const existingPatient = await db.query.patients.findFirst({
        where: and(
          eq(patients.groupId, clinic.groupId!),
          eq(patients.phone, patientData.phone),
        ),
      });

      if (existingApt) {
        let isConflict = false;

        if (existingApt.status === 'confirmed') {
          isConflict = true;
        } else if (existingApt.status === 'pending_payment') {
          const isSamePatient = existingPatient && existingApt.patientId === existingPatient.id;
          const isStale = new Date().getTime() - new Date(existingApt.createdAt).getTime() > 15 * 60 * 1000;

          if (!isSamePatient && !isStale) {
            isConflict = true; // Blocked for another patient currently paying
          }
        }

        if (isConflict) {
          throw new AppError('This slot is no longer available. Please choose another.', 409);
        }
      }

      let patient;
      if (existingPatient) {
        // Update details if name/email changed
        [patient] = await db
          .update(patients)
          .set({
            name: patientData.name,
            email: patientData.email ?? existingPatient.email,
            age: patientData.age ?? existingPatient.age,
            gender: patientData.gender ?? existingPatient.gender,
            updatedAt: new Date(),
          })
          .where(eq(patients.id, existingPatient.id))
          .returning();
      } else {
        [patient] = await db.insert(patients).values({
          groupId: clinic.groupId!,
          originClinicId: clinicId,
          phone: patientData.phone,
          email: patientData.email,
          name: patientData.name,
          age: patientData.age,
          gender: patientData.gender,
        }).returning();
      }

      // Get day of week for availability
      const timezone = clinic.timezone || 'Asia/Kolkata';
      const localDate = toZonedTime(slotDatetime, timezone);
      const dayOfWeekNum = localDate.getDay().toString(); // 0=sun
      const DAY_MAP: Record<string, 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'> = {
        '0': 'sunday',
        '1': 'monday',
        '2': 'tuesday',
        '3': 'wednesday',
        '4': 'thursday',
        '5': 'friday',
        '6': 'saturday',
      };
      const dayOfWeek = DAY_MAP[dayOfWeekNum];

      const availability = await db.query.doctorAvailability.findFirst({
        where: and(
          eq(doctorAvailability.doctorId, doctorId),
          eq(doctorAvailability.dayOfWeek, dayOfWeek),
          eq(doctorAvailability.isActive, true),
        ),
      });

      const slotDuration = availability?.slotDurationMinutes ?? 15;

      const targetStatus = (Number(doctor.consultationFee) === 0)
        ? 'confirmed'
        : (paymentMode === 'offline')
          ? 'confirmed'
          : (consultationType === 'teleconsult')
            ? 'pending_payment'
            : (clinic.paymentGateway === 'free' ? 'confirmed' : 'pending_payment');

      // 4. Create or reuse appointment
      let appointment;
      if (existingApt) {
        // Reuse existing row to prevent unique constraint violation (doctorSlotUnique)
        [appointment] = await db.update(appointments).set({
          patientId: patient.id,
          durationMinutes: slotDuration,
          status: targetStatus,
          consultationType,
          consultationFeeSnapshot: doctor.consultationFee,
          notes: notes || null,
          cancellationReason: null,
          cancelledAt: null,
          cancelledBy: null,
          createdAt: new Date(), // Reset timestamp for payment expiration window
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, existingApt.id))
        .returning();
      } else {
        [appointment] = await db.insert(appointments).values({
          clinicId,
          doctorId,
          patientId: patient.id,
          appointmentDatetime: slotDatetime,
          durationMinutes: slotDuration,
          status: targetStatus,
          consultationType,
          consultationFeeSnapshot: doctor.consultationFee,
          notes,
        }).returning();
      }

      // 5. Update patient's last appointment time
      await db.update(patients)
        .set({ lastAppointmentAt: slotDatetime, updatedAt: new Date() })
        .where(eq(patients.id, patient.id));

      if (paymentMode === 'offline' && Number(doctor.consultationFee) > 0) {
        await db.insert(payments).values({
          clinicId,
          appointmentId: appointment.id,
          patientId: patient.id,
          amount: doctor.consultationFee,
          currency: 'INR',
          gateway: 'free',
          status: 'pending',
        }).onConflictDoUpdate({
          target: payments.appointmentId,
          set: {
            patientId: patient.id,
            amount: doctor.consultationFee,
            gateway: 'free',
            status: 'pending',
            gatewayPaymentId: null,
            gatewaySignature: null,
            paymentMethod: null,
            metadata: null,
            completedAt: null,
            createdAt: new Date(),
          }
        });
      }

      // 6. Confirm immediately for: free consultations OR pay-at-clinic OR (free gateway + in_person)
      //    Teleconsult always waits for online payment regardless of gateway.
      const isImmediatelyConfirmed =
        Number(doctor.consultationFee) === 0 ||
        paymentMode === 'offline' ||
        (clinic.paymentGateway === 'free' && consultationType !== 'teleconsult');

      if (isImmediatelyConfirmed) {
        await emailQueue.add('send_confirmation', {
          type: 'appointment_confirmation',
          appointmentId: appointment.id,
        });
        await db.insert(appointmentReminders).values({
          appointmentId: appointment.id,
          reminderType: 'email',
          status: 'pending',
          scheduledFor: addMinutes(slotDatetime, -60 * 24), // 24h before
        }).onConflictDoNothing();
      }

      // 7. Audit log
      await auditLog({
        clinicId,
        actorType: 'patient',
        actorId: patient.id,
        action: 'appointment.created',
        resourceType: 'appointment',
        resourceId: appointment.id,
        after: appointment,
      });

      return res.status(201).json({
        appointment,
        patient: {
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
        },
        // Teleconsult always needs online payment; in-person respects paymentGateway
        paymentRequired:
          paymentMode !== 'offline' &&
          Number(doctor.consultationFee) > 0 &&
          (consultationType === 'teleconsult' || clinic.paymentGateway !== 'free'),
        consultationFee: doctor.consultationFee,
        currency: 'INR',
      });
    } catch (err) { next(err); }
  }
);

// ─── GET /appointments/:appointmentId ────────────────────────────────────────

router.get('/appointments/:appointmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apt = await db.query.appointments.findFirst({
      where: eq(appointments.id, req.params.appointmentId as string),
      with: { patient: true, doctor: true, clinic: true, payment: true, reminders: true },
    });
    if (!apt) throw new AppError('Appointment not found', 404);
    return res.json(apt);
  } catch (err) { next(err); }
});

// ─── PUT /appointments/:appointmentId/cancel ──────────────────────────────────

router.put('/appointments/:appointmentId/cancel',
  validate(cancelAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointmentId = req.params.appointmentId as string;
      const { reason } = req.body;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        with: { payment: true },
      });

      if (!apt) throw new AppError('Appointment not found', 404);
      if (['cancelled', 'completed'].includes(apt.status)) {
        throw new AppError(`Cannot cancel an appointment that is already ${apt.status}`, 400);
      }

      const [cancelled] = await db
        .update(appointments)
        .set({
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, appointmentId))
        .returning();

      await auditLog({
        clinicId: apt.clinicId,
        actorType: 'patient',
        action: 'appointment.cancelled',
        resourceType: 'appointment',
        resourceId: appointmentId,
        before: { status: apt.status },
        after: { status: 'cancelled', reason },
      });

      // TODO: trigger refund job if payment exists and is 'success'

      return res.json({
        message: 'Appointment cancelled',
        appointment: cancelled,
        refundInitiated: (apt as any).payment?.status === 'success',
      });
    } catch (err) { next(err); }
  }
);

// ─── PUT /appointments/:appointmentId/complete — Mark completed ───────────────

router.put('/appointments/:appointmentId/complete', authMiddleware,
  requireRole('owner', 'admin', 'receptionist'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const appointmentId = req.params.appointmentId as string;
      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
      });
      if (!apt) throw new AppError('Appointment not found', 404);
      if (apt.status !== 'confirmed') throw new AppError('Only confirmed appointments can be marked complete', 400);

      const [updated] = await db
        .update(appointments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(appointments.id, appointmentId))
        .returning();

      return res.json(updated);
    } catch (err) { next(err); }
  }
);

// ─── GET /clinics/:clinicId/patients ─────────────────────────────────────────

router.get('/clinics/:clinicId/patients', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string;

      const clinic = await db.query.clinics.findFirst({
        where: eq(clinics.id, clinicId),
      });
      if (!clinic || !clinic.groupId) throw new AppError('Clinic not found', 404);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Number(req.query.limit) || 20);

      const patientList = await db.query.patients.findMany({
        where: eq(patients.groupId, clinic.groupId),
        orderBy: desc(patients.lastAppointmentAt),
        limit,
        offset: (page - 1) * limit,
      });

      return res.json({ data: patientList, page, limit });
    } catch (err) { next(err); }
  }
);

// ─── PUT /appointments/:appointmentId/update-fee — Update consultation fee ───

const updateFeeSchema = z.object({
  consultationFee: z.coerce.number().min(0),
});

router.put('/appointments/:appointmentId/update-fee', authMiddleware,
  requireRole('owner', 'admin', 'receptionist'),
  validate(updateFeeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const appointmentId = req.params.appointmentId as string;
      const { consultationFee } = req.body;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
      });
      if (!apt) throw new AppError('Appointment not found', 404);

      await db.transaction(async (tx) => {
        // 1. Update fee snapshot in appointment
        await tx.update(appointments)
          .set({
            consultationFeeSnapshot: String(consultationFee),
            updatedAt: new Date(),
          })
          .where(eq(appointments.id, appointmentId));

        // 2. If a payment record exists, update its amount as well
        await tx.update(payments)
          .set({
            amount: String(consultationFee),
          })
          .where(eq(payments.appointmentId, appointmentId));
      });

      return res.json({ message: 'Fee updated successfully', consultationFee });
    } catch (err) { next(err); }
  }
);

export default router;
