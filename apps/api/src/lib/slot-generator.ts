import { addMinutes, format, parseISO, startOfDay, endOfDay, isWithinInterval, isBefore, isAfter } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface Break {
  breakStart: string; // "HH:MM"
  breakEnd: string;
}

interface BlockedSlot {
  startDatetime: Date;
  endDatetime: Date;
}

interface ExistingAppointment {
  appointmentDatetime: Date;
  durationMinutes: number;
}

interface AvailabilityConfig {
  startTime: string;       // "09:00"
  endTime: string;         // "17:00"
  slotDurationMinutes: number;
  bufferTimeBetweenSlots: number;
  breaks: Break[];
}

export interface TimeSlot {
  datetime: Date;          // UTC
  datetimeLocal: string;   // ISO string in clinic timezone
  time: string;            // "09:00"
  isAvailable: boolean;
}

/**
 * Generates all available appointment slots for a doctor on a given date.
 *
 * Algorithm:
 * 1. Parse availability config for the requested day of week
 * 2. Generate all theoretical slots between startTime and endTime
 * 3. Exclude slots that fall within any break window
 * 4. Exclude slots that overlap with any blocked_slot
 * 5. Exclude slots that are already booked (existing appointments)
 * 6. Exclude slots in the past
 * 7. Return remaining available slots
 */
export function generateAvailableSlots(params: {
  date: string;                          // "YYYY-MM-DD" in clinic timezone
  availability: AvailabilityConfig | null;
  blockedSlots: BlockedSlot[];
  existingAppointments: ExistingAppointment[];
  timezone: string;
  maxPatientsPerDay: number;
}): TimeSlot[] {
  const { date, availability, blockedSlots, existingAppointments, timezone, maxPatientsPerDay } = params;

  // No availability configured for this day
  if (!availability) return [];

  const { startTime, endTime, slotDurationMinutes, bufferTimeBetweenSlots, breaks } = availability;
  const totalSlotDuration = slotDurationMinutes + bufferTimeBetweenSlots;

  // Parse date in clinic's timezone
  const [year, month, day] = date.split('-').map(Number);
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  // Create start and end datetimes in clinic timezone, then convert to UTC
  const localStart = new Date(year, month - 1, day, startHour, startMin, 0);
  const localEnd = new Date(year, month - 1, day, endHour, endMin, 0);
  const utcStart = fromZonedTime(localStart, timezone);
  const utcEnd = fromZonedTime(localEnd, timezone);

  const now = new Date();
  const slots: TimeSlot[] = [];
  let current = utcStart;

  // Check if doctor has hit max patients for the day
  const confirmedTodayCount = existingAppointments.filter(apt => {
    const aptDate = format(toZonedTime(apt.appointmentDatetime, timezone), 'yyyy-MM-dd');
    return aptDate === date;
  }).length;

  if (confirmedTodayCount >= maxPatientsPerDay) return [];

  while (isBefore(current, utcEnd)) {
    const slotEndTime = addMinutes(current, slotDurationMinutes);

    // Skip if slot end would exceed day end
    if (isAfter(slotEndTime, utcEnd)) break;

    const localSlotTime = toZonedTime(current, timezone);
    const slotTimeStr = format(localSlotTime, 'HH:mm');

    const isAvailable = (
      // 1. Not in the past (with 5min buffer)
      isAfter(current, addMinutes(now, 5)) &&
      // 2. Not within any break
      !isInBreak(slotTimeStr, breaks) &&
      // 3. Not blocked
      !isBlocked(current, slotEndTime, blockedSlots) &&
      // 4. Not already booked
      !isBooked(current, slotDurationMinutes, existingAppointments)
    );

    slots.push({
      datetime: current,
      datetimeLocal: current.toISOString(),
      time: slotTimeStr,
      isAvailable,
    });

    current = addMinutes(current, totalSlotDuration);
  }

  return slots;
}

function isInBreak(slotTime: string, breaks: Break[]): boolean {
  const [sh, sm] = slotTime.split(':').map(Number);
  const slotMinutes = sh * 60 + sm;

  return breaks.some(({ breakStart, breakEnd }) => {
    const [bsh, bsm] = breakStart.split(':').map(Number);
    const [beh, bem] = breakEnd.split(':').map(Number);
    const breakStartMinutes = bsh * 60 + bsm;
    const breakEndMinutes = beh * 60 + bem;
    return slotMinutes >= breakStartMinutes && slotMinutes < breakEndMinutes;
  });
}

function isBlocked(slotStart: Date, slotEnd: Date, blockedSlots: BlockedSlot[]): boolean {
  return blockedSlots.some(blocked =>
    !(isAfter(slotStart, blocked.endDatetime) || isBefore(slotEnd, blocked.startDatetime))
  );
}

function isBooked(slotStart: Date, durationMinutes: number, existingAppointments: ExistingAppointment[]): boolean {
  const slotEnd = addMinutes(slotStart, durationMinutes);
  return existingAppointments.some(apt => {
    const aptEnd = addMinutes(apt.appointmentDatetime, apt.durationMinutes);
    // Overlap check: slot starts before apt ends AND slot ends after apt starts
    return isBefore(slotStart, aptEnd) && isAfter(slotEnd, apt.appointmentDatetime);
  });
}
