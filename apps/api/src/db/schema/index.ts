import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  time,
  inet,
  jsonb,
  unique,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'professional',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'cancelled',
]);

export const doctorStatusEnum = pgEnum('doctor_status', [
  'active',
  'inactive',
  'on_leave',
]);

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
]);

export const consultationTypeEnum = pgEnum('consultation_type', [
  'in_person',
  'teleconsult',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'success',
  'failed',
  'refunded',
]);

export const paymentGatewayEnum = pgEnum('payment_gateway', [
  'razorpay',
  'cashfree',
  'phonepe',
  'free', // for ₹0 consultations
]);

export const reminderTypeEnum = pgEnum('reminder_type', [
  'whatsapp',
  'email',
  'sms',
]);

export const reminderStatusEnum = pgEnum('reminder_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
]);

export const actorTypeEnum = pgEnum('actor_type', [
  'admin',
  'doctor',
  'receptionist',
  'patient',
  'system',
]);

export const dayOfWeekEnum = pgEnum('day_of_week', [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

// ─── Clinic Groups (Chains / Branches) ────────────────────────────────────────

export const clinicGroups = pgTable('clinic_groups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Clinics ──────────────────────────────────────────────────────────────────

export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').references(() => clinicGroups.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(), // booking URL: /book/:slug
  phone: varchar('phone', { length: 15 }),
  email: varchar('email', { length: 255 }),
  logoUrl: text('logo_url'),
  address: text('address'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
  subscriptionPlan: subscriptionPlanEnum('subscription_plan').default('starter'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').default('trial'),
  subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),

  // Payment gateway (pluggable — each clinic uses their own)
  paymentGateway: paymentGatewayEnum('payment_gateway').default('razorpay'),
  // Stored encrypted via pgcrypto in application layer before saving
  paymentGatewayKeyEncrypted: text('payment_gateway_key_encrypted'),
  paymentGatewaySecretEncrypted: text('payment_gateway_secret_encrypted'),

  // WhatsApp (Phase 2)
  whatsappPhoneNumber: varchar('whatsapp_phone_number', { length: 15 }),
  whatsappEnabled: boolean('whatsapp_enabled').default(false),

  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Clinic Staff / Admins ────────────────────────────────────────────────────

export const clinicStaffRoleEnum = pgEnum('clinic_staff_role', [
  'owner',
  'admin',
  'receptionist',
]);

export const clinicStaff = pgTable('clinic_staff', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 15 }),
  role: clinicStaffRoleEnum('role').notNull().default('receptionist'),
  passwordHash: text('password_hash'), // for email/password login
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailClinicUnique: unique().on(table.email, table.clinicId),
  clinicIdIdx: index('clinic_staff_clinic_id_idx').on(table.clinicId),
}));

// ─── OTP Tokens (Email-based auth) ───────────────────────────────────────────

export const otpTokens = pgTable('otp_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull(),
  otp: varchar('otp', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('otp_email_idx').on(table.email),
}));

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid('staff_id').references(() => clinicStaff.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  staffIdIdx: index('refresh_tokens_staff_id_idx').on(table.staffId),
}));

// ─── Doctors ──────────────────────────────────────────────────────────────────

export const doctors = pgTable('doctors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  specialization: varchar('specialization', { length: 255 }),
  qualifications: varchar('qualifications', { length: 255 }),
  profileImageUrl: text('profile_image_url'),
  consultationFee: decimal('consultation_fee', { precision: 10, scale: 2 }).notNull().default('0'),
  phone: varchar('phone', { length: 15 }),
  email: varchar('email', { length: 255 }),
  status: doctorStatusEnum('status').notNull().default('active'),
  maxPatientsPerDay: integer('max_patients_per_day').default(30),
  bufferTimeBetweenSlots: integer('buffer_time_between_slots').default(0), // minutes
  bio: text('bio'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  clinicEmailUnique: unique().on(table.clinicId, table.email),
  clinicIdIdx: index('doctors_clinic_id_idx').on(table.clinicId),
}));

// ─── Doctor Availability ──────────────────────────────────────────────────────

export const doctorAvailability = pgTable('doctor_availability', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  doctorId: uuid('doctor_id').notNull().references(() => doctors.id, { onDelete: 'cascade' }),
  dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
  startTime: time('start_time').notNull(),          // e.g. "09:00"
  endTime: time('end_time').notNull(),              // e.g. "17:00"
  slotDurationMinutes: integer('slot_duration_minutes').notNull().default(15),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  doctorDayUnique: unique().on(table.doctorId, table.dayOfWeek),
  doctorIdIdx: index('availability_doctor_id_idx').on(table.doctorId),
}));

// ─── Doctor Breaks (lunch, prayer, etc.) ─────────────────────────────────────

export const doctorBreaks = pgTable('doctor_breaks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  availabilityId: uuid('availability_id').notNull().references(() => doctorAvailability.id, { onDelete: 'cascade' }),
  breakStart: time('break_start').notNull(),
  breakEnd: time('break_end').notNull(),
  label: varchar('label', { length: 100 }).default('Break'),
});

// ─── Blocked Slots (vacations, conferences, etc.) ────────────────────────────

export const blockedSlots = pgTable('blocked_slots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  doctorId: uuid('doctor_id').notNull().references(() => doctors.id, { onDelete: 'cascade' }),
  startDatetime: timestamp('start_datetime', { withTimezone: true }).notNull(),
  endDatetime: timestamp('end_datetime', { withTimezone: true }).notNull(),
  reason: varchar('reason', { length: 255 }),
  createdBy: uuid('created_by').references(() => clinicStaff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  doctorStartIdx: index('blocked_slots_doctor_start_idx').on(table.doctorId, table.startDatetime),
}));

// ─── Patients ─────────────────────────────────────────────────────────────────
// Scoped to clinic_group — same chain/branch shares patients, different clinic = different patient

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => clinicGroups.id, { onDelete: 'cascade' }),
  originClinicId: uuid('origin_clinic_id').references(() => clinics.id, { onDelete: 'set null' }),
  phone: varchar('phone', { length: 15 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  age: integer('age'),
  gender: varchar('gender', { length: 10 }),
  address: text('address'),
  bloodGroup: varchar('blood_group', { length: 5 }),
  whatsappConsent: boolean('whatsapp_consent').default(true).notNull(),
  emailConsent: boolean('email_consent').default(true).notNull(),
  lastAppointmentAt: timestamp('last_appointment_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  groupPhoneUnique: unique().on(table.groupId, table.phone), // unique within a clinic chain
  groupIdIdx: index('patients_group_id_idx').on(table.groupId),
  phoneIdx: index('patients_phone_idx').on(table.phone),
}));

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => doctors.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  appointmentDatetime: timestamp('appointment_datetime', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(15),
  status: appointmentStatusEnum('status').notNull().default('pending_payment'),
  consultationType: consultationTypeEnum('consultation_type').notNull().default('in_person'),
  consultationFeeSnapshot: decimal('consultation_fee_snapshot', { precision: 10, scale: 2 }).notNull(), // fee at time of booking
  notes: text('notes'),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by'), // staff id or patient
  bookedByStaffId: uuid('booked_by_staff_id').references(() => clinicStaff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // CRITICAL: prevents double-booking at same slot
  doctorSlotUnique: unique().on(table.doctorId, table.appointmentDatetime),
  clinicDateIdx: index('appointments_clinic_date_idx').on(table.clinicId, table.appointmentDatetime),
  doctorDateIdx: index('appointments_doctor_date_idx').on(table.doctorId, table.appointmentDatetime),
  patientDateIdx: index('appointments_patient_date_idx').on(table.patientId, table.appointmentDatetime),
  statusIdx: index('appointments_status_idx').on(table.status),
}));

// ─── Payments ─────────────────────────────────────────────────────────────────

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  appointmentId: uuid('appointment_id').notNull().references(() => appointments.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  gateway: paymentGatewayEnum('gateway').notNull(),
  gatewayPaymentId: varchar('gateway_payment_id', { length: 255 }), // razorpay payment_id
  gatewayOrderId: varchar('gateway_order_id', { length: 255 }),     // razorpay order_id
  gatewaySignature: text('gateway_signature'),                       // verified signature
  status: paymentStatusEnum('status').notNull().default('pending'),
  paymentMethod: varchar('payment_method', { length: 50 }),         // card, upi, netbanking
  refundId: varchar('refund_id', { length: 255 }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  metadata: jsonb('metadata'),                                       // raw gateway response
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  appointmentIdUnique: unique().on(table.appointmentId), // one payment per appointment
  gatewayPaymentIdIdx: index('payments_gateway_payment_id_idx').on(table.gatewayPaymentId),
  clinicCreatedIdx: index('payments_clinic_created_idx').on(table.clinicId, table.createdAt),
}));

// ─── Appointment Reminders ────────────────────────────────────────────────────

export const appointmentReminders = pgTable('appointment_reminders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: uuid('appointment_id').notNull().references(() => appointments.id, { onDelete: 'cascade' }),
  reminderType: reminderTypeEnum('reminder_type').notNull(),
  status: reminderStatusEnum('status').notNull().default('pending'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  appointmentTypeUnique: unique().on(table.appointmentId, table.reminderType),
  scheduledForIdx: index('reminders_scheduled_for_idx').on(table.scheduledFor, table.status),
}));

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  actorId: uuid('actor_id'),
  actorType: actorTypeEnum('actor_type').notNull().default('system'),
  action: varchar('action', { length: 100 }).notNull(), // e.g. 'appointment.cancelled'
  resourceType: varchar('resource_type', { length: 100 }),
  resourceId: uuid('resource_id'),
  before: jsonb('before'),  // state before change
  after: jsonb('after'),    // state after change
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  clinicCreatedIdx: index('audit_logs_clinic_created_idx').on(table.clinicId, table.createdAt),
  resourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
}));

// ─── Clinic Webhooks (integrations) ───────────────────────────────────────────

export const clinicWebhooks = pgTable('clinic_webhooks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(), // appointment.created, payment.success
  webhookUrl: varchar('webhook_url', { length: 500 }).notNull(),
  secretHash: text('secret_hash'), // HMAC secret for verification
  isActive: boolean('is_active').default(true).notNull(),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const clinicGroupsRelations = relations(clinicGroups, ({ many }) => ({
  clinics: many(clinics),
  patients: many(patients),
}));

export const clinicsRelations = relations(clinics, ({ one, many }) => ({
  group: one(clinicGroups, { fields: [clinics.groupId], references: [clinicGroups.id] }),
  staff: many(clinicStaff),
  doctors: many(doctors),
  appointments: many(appointments),
  payments: many(payments),
  webhooks: many(clinicWebhooks),
}));

export const doctorsRelations = relations(doctors, ({ one, many }) => ({
  clinic: one(clinics, { fields: [doctors.clinicId], references: [clinics.id] }),
  availability: many(doctorAvailability),
  blockedSlots: many(blockedSlots),
  appointments: many(appointments),
}));

export const doctorAvailabilityRelations = relations(doctorAvailability, ({ one, many }) => ({
  doctor: one(doctors, { fields: [doctorAvailability.doctorId], references: [doctors.id] }),
  breaks: many(doctorBreaks),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  group: one(clinicGroups, { fields: [patients.groupId], references: [clinicGroups.id] }),
  originClinic: one(clinics, { fields: [patients.originClinicId], references: [clinics.id] }),
  appointments: many(appointments),
  payments: many(payments),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  clinic: one(clinics, { fields: [appointments.clinicId], references: [clinics.id] }),
  doctor: one(doctors, { fields: [appointments.doctorId], references: [doctors.id] }),
  patient: one(patients, { fields: [appointments.patientId], references: [patients.id] }),
  payment: one(payments, { fields: [appointments.id], references: [payments.appointmentId] }),
  reminders: many(appointmentReminders),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  clinic: one(clinics, { fields: [payments.clinicId], references: [clinics.id] }),
  appointment: one(appointments, { fields: [payments.appointmentId], references: [appointments.id] }),
  patient: one(patients, { fields: [payments.patientId], references: [patients.id] }),
}));

export const doctorBreaksRelations = relations(doctorBreaks, ({ one }) => ({
  availability: one(doctorAvailability, { fields: [doctorBreaks.availabilityId], references: [doctorAvailability.id] }),
}));

export const blockedSlotsRelations = relations(blockedSlots, ({ one }) => ({
  doctor: one(doctors, { fields: [blockedSlots.doctorId], references: [doctors.id] }),
}));

