import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { clinics, clinicGroups, clinicStaff, doctors } from '../../db/schema';
import { validate } from '../../middleware/validate';
import { authMiddleware, requireRole, requireClinicAccess, AuthenticatedRequest } from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

const router: Router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createClinicSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens only'),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  // First admin staff member
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
});

const updateClinicSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  timezone: z.string().optional(),
  whatsappPhoneNumber: z.string().optional(),
  paymentGateway: z.enum(['razorpay', 'cashfree', 'phonepe', 'free']).optional(),
  // Accept raw keys — we'll encrypt before storing
  paymentGatewayKey: z.string().optional(),
  paymentGatewaySecret: z.string().optional(),
});

// ─── POST /clinics — Public signup (create clinic + owner account) ────────────

router.post('/', validate(createClinicSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, phone, email, address, timezone, ownerName, ownerEmail, ownerPassword } = req.body;

    // Check slug uniqueness
    const existing = await db.query.clinics.findFirst({
      where: eq(clinics.slug, slug),
    });
    if (existing) throw new AppError('This URL slug is already taken. Please choose another.', 409);

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    const result = await db.transaction(async (tx) => {
      // 1. Create a clinic group (standalone clinic = its own group)
      const [group] = await tx.insert(clinicGroups).values({ name }).returning();

      // 2. Create the clinic
      const [clinic] = await tx.insert(clinics).values({
        groupId: group.id,
        name,
        slug,
        phone,
        email,
        address,
        timezone,
      }).returning();

      // 3. Create the owner staff account
      const [owner] = await tx.insert(clinicStaff).values({
        clinicId: clinic.id,
        name: ownerName,
        email: ownerEmail.toLowerCase(),
        role: 'owner',
        passwordHash,
      }).returning({ id: clinicStaff.id, name: clinicStaff.name, email: clinicStaff.email, role: clinicStaff.role });

      return { clinic, owner };
    });

    return res.status(201).json({
      message: 'Clinic created successfully. You can now log in.',
      clinicId: result.clinic.id,
      slug: result.clinic.slug,
      bookingUrl: `/book/${result.clinic.slug}`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /clinics/public/slug/:slug — Public clinic & doctors details for booking ───

router.get('/public/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    const clinic = await db.query.clinics.findFirst({
      where: and(eq(clinics.slug, slug), eq(clinics.isActive, true)),
    });

    if (!clinic) throw new AppError('Clinic not found', 404);

    const activeDoctors = await db.query.doctors.findMany({
      where: and(eq(doctors.clinicId, clinic.id), eq(doctors.isActive, true)),
    });

    return res.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug,
        phone: clinic.phone,
        email: clinic.email,
        address: clinic.address,
        timezone: clinic.timezone,
        paymentGateway: clinic.paymentGateway,
      },
      doctors: activeDoctors.map(d => ({
        id: d.id,
        name: d.name,
        specialization: d.specialization,
        qualifications: d.qualifications,
        profileImageUrl: d.profileImageUrl,
        consultationFee: Number(d.consultationFee),
        bio: d.bio,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /clinics/:clinicId — Get clinic details ──────────────────────────────

router.get('/:clinicId', authMiddleware, requireClinicAccess, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const clinic = await db.query.clinics.findFirst({
      where: eq(clinics.id, req.params.clinicId as string),
      with: { group: true },
    });

    if (!clinic) throw new AppError('Clinic not found', 404);

    // Never return encrypted keys
    const { paymentGatewayKeyEncrypted, paymentGatewaySecretEncrypted, ...safeClinic } = clinic;
    return res.json({
      ...safeClinic,
      hasPaymentGateway: !!paymentGatewayKeyEncrypted,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /clinics/:clinicId — Update clinic settings ─────────────────────────

router.put('/:clinicId', authMiddleware, requireRole('owner', 'admin'), requireClinicAccess, validate(updateClinicSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { paymentGatewayKey, paymentGatewaySecret, ...rest } = req.body;

      const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };

      // Simple base64 encode for demo — replace with AES-256 in prod using ENCRYPTION_KEY
      if (paymentGatewayKey) {
        updateData.paymentGatewayKeyEncrypted = Buffer.from(paymentGatewayKey).toString('base64');
      }
      if (paymentGatewaySecret) {
        updateData.paymentGatewaySecretEncrypted = Buffer.from(paymentGatewaySecret).toString('base64');
      }

      const [updated] = await db
        .update(clinics)
        .set(updateData as any)
        .where(eq(clinics.id, req.params.clinicId as string))
        .returning();

      if (!updated) throw new AppError('Clinic not found', 404);

      const { paymentGatewayKeyEncrypted, paymentGatewaySecretEncrypted, ...safe } = updated;
      return res.json({ ...safe, hasPaymentGateway: !!paymentGatewayKeyEncrypted });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /clinics/:clinicId/dashboard — Overview stats ───────────────────────

router.get('/:clinicId/dashboard', authMiddleware, requireClinicAccess,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.params.clinicId as string;

      const statsResult = await db.execute<{
        today_appointments: string;
        this_month_appointments: string;
        total_patients: string;
        confirmed_today: string;
        pending_today: string;
        this_month_revenue: string;
      }>(sql`
        SELECT
          COUNT(CASE WHEN DATE(appointment_datetime AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE THEN 1 END) AS today_appointments,
          COUNT(CASE WHEN DATE_TRUNC('month', appointment_datetime) = DATE_TRUNC('month', NOW()) THEN 1 END) AS this_month_appointments,
          COUNT(DISTINCT patient_id) AS total_patients,
          COUNT(CASE WHEN DATE(appointment_datetime AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE AND status = 'confirmed' THEN 1 END) AS confirmed_today,
          COUNT(CASE WHEN DATE(appointment_datetime AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE AND status = 'pending_payment' THEN 1 END) AS pending_today,
          COALESCE(SUM(CASE WHEN DATE_TRUNC('month', appointment_datetime) = DATE_TRUNC('month', NOW()) AND status IN ('confirmed','completed') THEN consultation_fee_snapshot ELSE 0 END), 0) AS this_month_revenue
        FROM appointments
        WHERE clinic_id = ${clinicId}
      `);
      const stats = statsResult.rows[0];

      return res.json({
        today: {
          total: Number(stats.today_appointments),
          confirmed: Number(stats.confirmed_today),
          pendingPayment: Number(stats.pending_today),
        },
        thisMonth: {
          appointments: Number(stats.this_month_appointments),
          revenue: Number(stats.this_month_revenue),
        },
        allTime: {
          totalPatients: Number(stats.total_patients),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /clinics/super-admin/clinics — SaaS super-admin list all clinics ─────

router.get('/super-admin/clinics', authMiddleware, requireRole('super_admin'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const all = await db.query.clinics.findMany({
      orderBy: clinics.name,
    });
    return res.json(all);
  } catch (err) {
    next(err);
  }
});

// ─── POST /clinics/super-admin/clinics — SaaS super-admin create clinic ────────

router.post('/super-admin/clinics', authMiddleware, requireRole('super_admin'), validate(createClinicSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, slug, phone, email, address, timezone, ownerName, ownerEmail, ownerPassword } = req.body;

    // Check slug uniqueness
    const existing = await db.query.clinics.findFirst({
      where: eq(clinics.slug, slug),
    });
    if (existing) throw new AppError('This URL slug is already taken. Please choose another.', 409);

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    const result = await db.transaction(async (tx) => {
      // 1. Create a clinic group (standalone clinic = its own group)
      const [group] = await tx.insert(clinicGroups).values({ name }).returning();

      // 2. Create the clinic
      const [clinic] = await tx.insert(clinics).values({
        groupId: group.id,
        name,
        slug,
        phone,
        email,
        address,
        timezone,
      }).returning();

      // 3. Create the owner staff account
      const [owner] = await tx.insert(clinicStaff).values({
        clinicId: clinic.id,
        name: ownerName,
        email: ownerEmail.toLowerCase(),
        role: 'owner',
        passwordHash,
      }).returning({ id: clinicStaff.id, name: clinicStaff.name, email: clinicStaff.email, role: clinicStaff.role });

      return { clinic, owner };
    });

    return res.status(201).json({
      message: 'Clinic created successfully.',
      clinicId: result.clinic.id,
      slug: result.clinic.slug,
      bookingUrl: `/book/${result.clinic.slug}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
