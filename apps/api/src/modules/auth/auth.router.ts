import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { addMinutes, addDays } from 'date-fns';
import bcrypt from 'bcryptjs';

import { db } from '../../db/client';
import {
  clinicStaff,
  clinics,
  otpTokens,
  refreshTokens,
} from '../../db/schema';
import {
  generateOtp,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from '../../lib/jwt';
import { sendOtpEmail } from '../../lib/email';
import { AppError } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import { authMiddleware } from '../../middleware/auth';

const router: Router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  // Allow 4-6 digits — covers the dummy OTP "0000" used in dev
  otp: z.string().min(4).max(6).regex(/^\d+$/),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

router.post('/send-otp', validate(sendOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as z.infer<typeof sendOtpSchema>;

    // Check staff exists
    const staff = await db.query.clinicStaff.findFirst({
      where: and(
        eq(clinicStaff.email, email.toLowerCase()),
        eq(clinicStaff.isActive, true)
      ),
    });

    if (!staff) {
      // Don't reveal whether email exists — return same response
      return res.json({ message: 'If that email is registered, you will receive an OTP.' });
    }

    // Fetch clinic name for the email subject (non-critical)
    const clinic = await db.query.clinics.findFirst({
      where: eq(clinics.id, staff.clinicId),
    }).catch(() => null);

    // Invalidate existing unused OTPs for this email
    await db
      .delete(otpTokens)
      .where(and(eq(otpTokens.email, email.toLowerCase()), isNull(otpTokens.usedAt)));

    const otp = generateOtp();
    const expiresAt = addMinutes(new Date(), 10);

    await db.insert(otpTokens).values({
      email: email.toLowerCase(),
      otp, // In production: hash this with bcrypt before storing
      expiresAt,
    });

    // Fire-and-forget — email failures must never crash the OTP request.
    // In dev, SMTP is not configured; use dummy OTP "0000" to log in.
    sendOtpEmail(email, otp, clinic?.name ?? undefined).catch((emailErr) => {
      console.warn('[send-otp] Email delivery failed (SMTP not configured?):', (emailErr as Error).message);
    });

    return res.json({ message: 'If that email is registered, you will receive an OTP.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

// ── Dev-only dummy OTP bypass ─────────────────────────────────────────────────
const DUMMY_OTP = '0000';

router.post('/verify-otp', validate(verifyOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body as z.infer<typeof verifyOtpSchema>;

    // ── DUMMY OTP bypass (dev/demo mode) ──────────────────────────────────────
    // Any registered staff can log in with OTP "0000" or "000000" — skips DB token lookup.
    // Remove this block (or gate it behind NODE_ENV) before going to production.
    if (otp === '0000' || otp === '000000') {
      const staff = await db.query.clinicStaff.findFirst({
        where: and(eq(clinicStaff.email, email.toLowerCase()), eq(clinicStaff.isActive, true)),
      });
      if (!staff) throw new AppError('Account not found', 404);

      await db.update(clinicStaff).set({ lastLoginAt: new Date() }).where(eq(clinicStaff.id, staff.id));

      const tokenPayload = { sub: staff.id, clinicId: staff.clinicId, role: staff.role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);
      await db.insert(refreshTokens).values({
        staffId: staff.id,
        token: hashRefreshToken(refreshToken),
        expiresAt: addDays(new Date(), 7),
      });

      return res.json({
        accessToken,
        refreshToken,
        staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role, clinicId: staff.clinicId },
      });
    }
    // ── End dummy OTP bypass ──────────────────────────────────────────────────

    const token = await db.query.otpTokens.findFirst({
      where: and(
        eq(otpTokens.email, email.toLowerCase()),
        isNull(otpTokens.usedAt),
        gt(otpTokens.expiresAt, new Date())
      ),
    });

    if (!token) {
      throw new AppError('Invalid or expired OTP', 401);
    }

    // Max 5 attempts
    if (token.attempts >= 5) {
      throw new AppError('Too many attempts. Request a new OTP.', 429);
    }

    if (token.otp !== otp) {
      // Increment attempt count
      await db
        .update(otpTokens)
        .set({ attempts: token.attempts + 1 })
        .where(eq(otpTokens.id, token.id));
      throw new AppError('Invalid OTP', 401);
    }

    // Mark OTP as used
    await db
      .update(otpTokens)
      .set({ usedAt: new Date() })
      .where(eq(otpTokens.id, token.id));

    // Get staff
    const staff = await db.query.clinicStaff.findFirst({
      where: and(eq(clinicStaff.email, email.toLowerCase()), eq(clinicStaff.isActive, true)),
    });

    if (!staff) {
      throw new AppError('Account not found', 404);
    }

    // Update last login
    await db
      .update(clinicStaff)
      .set({ lastLoginAt: new Date() })
      .where(eq(clinicStaff.id, staff.id));

    const tokenPayload = { sub: staff.id, clinicId: staff.clinicId, role: staff.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store hashed refresh token
    await db.insert(refreshTokens).values({
      staffId: staff.id,
      token: hashRefreshToken(refreshToken),
      expiresAt: addDays(new Date(), 7),
    });

    return res.json({
      accessToken,
      refreshToken,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        clinicId: staff.clinicId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshTokenSchema>;

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.token, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date())
      ),
    });

    if (!stored) {
      throw new AppError('Refresh token revoked or expired', 401);
    }

    // Rotate — revoke old, issue new
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    const tokenPayload = { sub: payload.sub, clinicId: payload.clinicId, role: payload.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    await db.insert(refreshTokens).values({
      staffId: payload.sub,
      token: hashRefreshToken(newRefreshToken),
      expiresAt: addDays(new Date(), 7),
    });

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post('/logout', authMiddleware, validate(refreshTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshTokenSchema>;
    const tokenHash = hashRefreshToken(refreshToken);

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.token, tokenHash));

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/login — Clinic staff password login ───────────────────────────

router.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const staff = await db.query.clinicStaff.findFirst({
      where: and(
        eq(clinicStaff.email, email.toLowerCase()),
        eq(clinicStaff.isActive, true)
      ),
    });

    if (!staff || !staff.passwordHash) {
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await db.update(clinicStaff).set({ lastLoginAt: new Date() }).where(eq(clinicStaff.id, staff.id));

    const tokenPayload = { sub: staff.id, clinicId: staff.clinicId, role: staff.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await db.insert(refreshTokens).values({
      staffId: staff.id,
      token: hashRefreshToken(refreshToken),
      expiresAt: addDays(new Date(), 7),
    });

    return res.json({
      accessToken,
      refreshToken,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        clinicId: staff.clinicId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/super-admin/login — SaaS super-admin password login ───────────

router.post('/super-admin/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const superEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@clinicbook.com';
    const superPassword = process.env.SUPER_ADMIN_PASSWORD || 'adminpassword123';

    if (email.toLowerCase() !== superEmail.toLowerCase() || password !== superPassword) {
      throw new AppError('Invalid admin email or password', 401);
    }

    const tokenPayload = {
      sub: 'super-admin',
      clinicId: 'system',
      role: 'super_admin',
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return res.json({
      accessToken,
      refreshToken,
      staff: {
        id: 'super-admin',
        name: 'SaaS Platform Admin',
        email: superEmail,
        role: 'super_admin',
        clinicId: 'system',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
