import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { appointments, appointmentReminders } from '../db/schema';
import {
  sendAppointmentConfirmationEmail,
  sendReminderEmail,
} from '../lib/email';
import {
  sendAppointmentConfirmationSms,
  sendPaymentReceiptSms,
} from '../lib/sms';

// BullMQ prefers a plain connection options object over an ioredis instance
// to avoid version conflicts when ioredis is also a direct dependency
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const redisConnection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
};

// ─── Queues ───────────────────────────────────────────────────────────────────

export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const reminderQueue = new Queue('reminders', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// ─── Job Types ────────────────────────────────────────────────────────────────

export type EmailJobData =
  | { type: 'appointment_confirmation'; appointmentId: string }
  | { type: 'appointment_reminder'; appointmentId: string };

// ─── Workers ──────────────────────────────────────────────────────────────────

const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job) => {
    const { type, appointmentId } = job.data;

    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        patient: true,
        doctor: true,
        clinic: true,
        payment: true,
      },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    const { patient, doctor, clinic } = appointment as any;

    if (type === 'appointment_confirmation') {
      // 1. Send Email if consented
      console.log(`✉️ Processing appointment confirmation email job for appointment ID: ${appointmentId}`);
      console.log(`✉️ Patient Email: "${patient.email}", Consent: ${patient.emailConsent}`);
      
      if (patient.email && patient.emailConsent) {
        const paymentDetails = (appointment as any).payment?.status === 'success' ? {
          amount: (appointment as any).payment.amount,
          paymentId: (appointment as any).payment.gatewayPaymentId || (appointment as any).payment.id,
          paymentMethod: (appointment as any).payment.paymentMethod || 'Online',
          completedAt: (appointment as any).payment.completedAt,
        } : undefined;

        console.log(`✉️ Dispatching SMTP request to: ${patient.email}`);
        await sendAppointmentConfirmationEmail({
          to: patient.email,
          patientName: patient.name,
          doctorName: doctor.name,
          clinicName: clinic.name,
          clinicPhone: clinic.phone,
          appointmentDatetime: appointment.appointmentDatetime,
          durationMinutes: appointment.durationMinutes,
          appointmentId: appointment.id,
          paymentDetails,
        });
        console.log(`✅ Appointment confirmation email sent successfully to: ${patient.email}`);
      } else {
        console.log(`⚠️ Skipping email delivery: ${!patient.email ? 'Patient email is empty' : 'Patient has disabled email consent'}`);
      }

      // 2. Send SMS if phone is present
      if (patient.phone) {
        await sendAppointmentConfirmationSms({
          to: patient.phone,
          patientName: patient.name,
          doctorName: doctor.name,
          clinicName: clinic.name,
          appointmentDatetime: appointment.appointmentDatetime,
        }).catch((err) => console.error('Failed to send SMS confirmation:', err));

        if ((appointment as any).payment?.status === 'success') {
          await sendPaymentReceiptSms({
            to: patient.phone,
            patientName: patient.name,
            doctorName: doctor.name,
            clinicName: clinic.name,
            appointmentDatetime: appointment.appointmentDatetime,
            amount: (appointment as any).payment.amount,
            paymentId: (appointment as any).payment.gatewayPaymentId || (appointment as any).payment.id,
          }).catch((err) => console.error('Failed to send SMS receipt:', err));
        }
      }

      // Mark confirmation reminder as sent
      await db
        .update(appointmentReminders)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(appointmentReminders.appointmentId, appointmentId));
    }

    if (type === 'appointment_reminder') {
      if (!patient.email || !patient.emailConsent) return;

      await sendReminderEmail({
        to: patient.email,
        patientName: patient.name,
        doctorName: doctor.name,
        clinicName: clinic.name,
        appointmentDatetime: appointment.appointmentDatetime,
      });

      await db
        .update(appointmentReminders)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(appointmentReminders.appointmentId, appointmentId));
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

emailWorker.on('completed', (job) => {
  console.log(`✅ Email job ${job.id} completed: ${job.data.type}`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`❌ Email job ${job?.id} failed: ${err.message}`);
});

export { redisConnection };
