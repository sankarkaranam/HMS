import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { db } from '../../db/client';
import { doctors, doctorAvailability, doctorBreaks, blockedSlots, appointments, clinics } from '../../db/schema';
import { validate } from '../../middleware/validate';
import { authMiddleware, requireRole, AuthenticatedRequest } from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import { generateAvailableSlots } from '../../lib/slot-generator';

const router: Router = Router();

const DAY_MAP: Record<string, string> = {
  '1': 'monday', '2': 'tuesday', '3': 'wednesday',
  '4': 'thursday', '5': 'friday', '6': 'saturday', '0': 'sunday',
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createDoctorSchema = z.object({
  name: z.string().min(2).max(255),
  specialization: z.string().max(255).optional(),
  qualifications: z.string().max(255).optional(),
  consultationFee: z.coerce.number().min(0).default(0),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  email: z.string().email().optional(),
  maxPatientsPerDay: z.coerce.number().min(1).max(200).default(30),
  bufferTimeBetweenSlots: z.coerce.number().min(0).max(60).default(0),
  bio: z.string().optional(),
});

const updateDoctorSchema = createDoctorSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'on_leave']).optional(),
  isActive: z.boolean().optional(),
});

const setAvailabilitySchema = z.object({
  schedule: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format: HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format: HH:MM'),
    slotDurationMinutes: z.coerce.number().min(5).max(120).default(15),
    isActive: z.boolean().default(true),
    breaks: z.array(z.object({
      breakStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      breakEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      label: z.string().optional(),
    })).optional().default([]),
  })).min(1),
});

const blockSlotSchema = z.object({
  startDatetime: z.string().datetime(),
  endDatetime: z.string().datetime(),
  reason: z.string().max(255).optional(),
});

// ─── GET /clinics/:clinicId/doctors ──────────────────────────────────────────

router.get('/clinics/:clinicId/doctors', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string;
      const all = await db.query.doctors.findMany({
        where: and(eq(doctors.clinicId, clinicId), eq(doctors.isActive, true)),
        with: { availability: { with: { breaks: true } } },
        orderBy: doctors.name,
      });
      return res.json(all);
    } catch (err) { next(err); }
  }
);

// ─── POST /clinics/:clinicId/doctors ─────────────────────────────────────────

router.post('/clinics/:clinicId/doctors', authMiddleware, requireRole('owner', 'admin'),
  validate(createDoctorSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string;
      const { consultationFee, ...rest } = req.body;

      const [doctor] = await db.insert(doctors).values({
        clinicId,
        consultationFee: String(consultationFee),
        ...rest,
      }).returning();

      return res.status(201).json(doctor);
    } catch (err) { next(err); }
  }
);

// ─── GET /doctors/:doctorId ───────────────────────────────────────────────────

router.get('/doctors/:doctorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctorId = req.params.doctorId as string;
    const doctor = await db.query.doctors.findFirst({
      where: eq(doctors.id, doctorId),
      with: { availability: { with: { breaks: true } } },
    });
    if (!doctor) throw new AppError('Doctor not found', 404);
    return res.json(doctor);
  } catch (err) { next(err); }
});

// ─── PUT /doctors/:doctorId ───────────────────────────────────────────────────

router.put('/doctors/:doctorId', authMiddleware, requireRole('owner', 'admin'),
  validate(updateDoctorSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const doctorId = req.params.doctorId as string;
      const { consultationFee, ...rest } = req.body;
      const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (consultationFee !== undefined) updateData.consultationFee = String(consultationFee);

      const [updated] = await db
        .update(doctors)
        .set(updateData as any)
        .where(eq(doctors.id, doctorId))
        .returning();

      if (!updated) throw new AppError('Doctor not found', 404);
      return res.json(updated);
    } catch (err) { next(err); }
  }
);

// ─── PUT /doctors/:doctorId/availability — Set full weekly schedule ───────────

router.put('/doctors/:doctorId/availability', authMiddleware, requireRole('owner', 'admin'),
  validate(setAvailabilitySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const doctorId = req.params.doctorId as string;
      const { schedule } = req.body as z.infer<typeof setAvailabilitySchema>;

      // Verify doctor exists and belongs to staff's clinic
      const doctor = await db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) });
      if (!doctor) throw new AppError('Doctor not found', 404);
      if (req.user?.clinicId !== doctor.clinicId) throw new AppError('Access denied', 403);

      await db.transaction(async (tx) => {
        // Remove old availability (cascade deletes breaks)
        await tx.delete(doctorAvailability).where(eq(doctorAvailability.doctorId, doctorId));

        // Insert new schedule with breaks
        for (const day of schedule) {
          const { breaks = [], ...availData } = day;
          const [avail] = await tx.insert(doctorAvailability).values({
            doctorId,
            ...availData,
          }).returning();

          if (breaks.length > 0) {
            await tx.insert(doctorBreaks).values(
              breaks.map((b) => ({ availabilityId: avail.id, ...b }))
            );
          }
        }
      });

      const updated = await db.query.doctors.findFirst({
        where: eq(doctors.id, doctorId),
        with: { availability: { with: { breaks: true } } },
      });

      return res.json(updated);
    } catch (err) { next(err); }
  }
);

// ─── POST /doctors/:doctorId/blocked-slots ────────────────────────────────────

router.post('/doctors/:doctorId/blocked-slots', authMiddleware, requireRole('owner', 'admin', 'receptionist'),
  validate(blockSlotSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const doctorId = req.params.doctorId as string;
      const { startDatetime, endDatetime, reason } = req.body;

      const start = new Date(startDatetime);
      const end = new Date(endDatetime);

      if (end <= start) throw new AppError('endDatetime must be after startDatetime', 400);

      const [blocked] = await db.insert(blockedSlots).values({
        doctorId,
        startDatetime: start,
        endDatetime: end,
        reason,
        createdBy: req.user?.sub,
      }).returning();

      return res.status(201).json(blocked);
    } catch (err) { next(err); }
  }
);

// ─── DELETE /doctors/:doctorId/blocked-slots/:slotId ─────────────────────────

router.delete('/doctors/:doctorId/blocked-slots/:slotId', authMiddleware, requireRole('owner', 'admin', 'receptionist'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const doctorId = req.params.doctorId as string;
      const slotId = req.params.slotId as string;
      const [deleted] = await db
        .delete(blockedSlots)
        .where(and(
          eq(blockedSlots.id, slotId),
          eq(blockedSlots.doctorId, doctorId),
        ))
        .returning();

      if (!deleted) throw new AppError('Blocked slot not found', 404);
      return res.json({ message: 'Blocked slot removed' });
    } catch (err) { next(err); }
  }
);

// ─── GET /doctors/:doctorId/availability?date=YYYY-MM-DD — Get available slots ─

router.get('/doctors/:doctorId/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctorId = req.params.doctorId as string;
    const dateStr = req.query.date as string;

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new AppError('Query param `date` is required in YYYY-MM-DD format', 400);
    }

    const doctor = await db.query.doctors.findFirst({
      where: and(eq(doctors.id, doctorId), eq(doctors.isActive, true)),
      with: {
        clinic: true,
        availability: { with: { breaks: true } },
        blockedSlots: true,
      },
    });

    if (!doctor) throw new AppError('Doctor not found', 404);

    const clinic = (doctor as any).clinic;
    const timezone = clinic?.timezone || 'Asia/Kolkata';

    // Find availability for requested day of week
    const date = new Date(`${dateStr}T12:00:00Z`);
    const localDate = toZonedTime(date, timezone);
    const dayOfWeekNum = localDate.getDay().toString(); // 0=sun
    const dayOfWeek = DAY_MAP[dayOfWeekNum];

    const todayAvailability = (doctor as any).availability?.find(
      (a: any) => a.dayOfWeek === dayOfWeek && a.isActive
    );

    // Existing confirmed appointments for this doctor on this date
    const existingApts = await db.query.appointments.findMany({
      where: and(
        eq(appointments.doctorId, doctorId),
        // Filter appointments for this date window using SQL
      ),
    });

    // Filter to just this date
    const dayAppointments = existingApts.filter((apt) => {
      const aptDate = format(toZonedTime(apt.appointmentDatetime, timezone), 'yyyy-MM-dd');
      return aptDate === dateStr && ['confirmed', 'pending_payment'].includes(apt.status);
    });

    const slots = generateAvailableSlots({
      date: dateStr,
      availability: todayAvailability ? {
        startTime: todayAvailability.startTime,
        endTime: todayAvailability.endTime,
        slotDurationMinutes: todayAvailability.slotDurationMinutes,
        bufferTimeBetweenSlots: doctor.bufferTimeBetweenSlots || 0,
        breaks: (todayAvailability.breaks || []).map((b: any) => ({
          breakStart: b.breakStart,
          breakEnd: b.breakEnd,
        })),
      } : null,
      blockedSlots: (doctor as any).blockedSlots || [],
      existingAppointments: dayAppointments.map((a) => ({
        appointmentDatetime: a.appointmentDatetime,
        durationMinutes: a.durationMinutes,
      })),
      timezone,
      maxPatientsPerDay: doctor.maxPatientsPerDay || 30,
    });

    return res.json({
      doctorId,
      doctorName: doctor.name,
      date: dateStr,
      timezone,
      consultationFee: doctor.consultationFee,
      slotDurationMinutes: todayAvailability?.slotDurationMinutes || null,
      totalSlots: slots.length,
      availableCount: slots.filter((s) => s.isAvailable).length,
      slots,
    });
  } catch (err) { next(err); }
});

export default router;
