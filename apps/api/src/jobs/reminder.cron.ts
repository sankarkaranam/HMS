import cron from 'node-cron';
import { eq, and, lte, gte, inArray } from 'drizzle-orm';
import { addHours, addMinutes } from 'date-fns';
import { db } from '../db/client';
import { appointmentReminders, appointments } from '../db/schema';
import { emailQueue } from '../queues';

/**
 * Runs every hour at :05 past.
 * Finds all pending reminders scheduled to fire in the next 60 minutes
 * and queues email jobs for them.
 */
export function startReminderCron() {
  cron.schedule('5 * * * *', async () => {
    console.log('[Cron] Checking for upcoming appointment reminders...');

    try {
      const now = new Date();
      const windowEnd = addHours(now, 1);

      // Find all pending reminders due within the next hour
      const dueReminders = await db.query.appointmentReminders.findMany({
        where: and(
          eq(appointmentReminders.status, 'pending'),
          lte(appointmentReminders.scheduledFor, windowEnd),
          gte(appointmentReminders.scheduledFor, now),
        ),
        with: { appointment: true },
      });

      console.log(`[Cron] Found ${dueReminders.length} reminders to dispatch`);

      for (const reminder of dueReminders) {
        const apt = (reminder as any).appointment;

        // Skip if appointment was cancelled
        if (!apt || apt.status === 'cancelled') {
          await db.update(appointmentReminders)
            .set({ status: 'skipped' })
            .where(eq(appointmentReminders.id, reminder.id));
          continue;
        }

        // Queue email reminder
        await emailQueue.add('send_reminder', {
          type: 'appointment_reminder',
          appointmentId: reminder.appointmentId,
        });

        // Mark as sent to prevent double-dispatch
        await db.update(appointmentReminders)
          .set({ status: 'sent', sentAt: now, attempts: reminder.attempts + 1 })
          .where(eq(appointmentReminders.id, reminder.id));
      }
    } catch (err) {
      console.error('[Cron] Reminder cron failed:', err);
    }
  });

  console.log('✅ Reminder cron started (every hour at :05)');
}
