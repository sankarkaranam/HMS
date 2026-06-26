import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import Razorpay from 'razorpay';

import { db } from '../../db/client';
import { appointments, payments, clinics, doctors, patients } from '../../db/schema';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { emailQueue } from '../../queues';
import { auditLog } from '../../lib/audit';
import { addMinutes } from 'date-fns';
import { appointmentReminders } from '../../db/schema';
import { authMiddleware, requireRole, AuthenticatedRequest } from '../../middleware/auth';

const router: Router = Router();

// ─── PhonePe V2 OAuth Token Cache ────────────────────────────────────────────
// PhonePe access tokens are short-lived; cache per merchant to avoid hammering
// the auth endpoint on every request.
interface TokenCache {
  token: string;
  expiresAt: number; // unix ms
}
const phonePeTokenCache = new Map<string, TokenCache>();

async function getPhonePeV2Token(clientId: string, clientSecret: string, clientVersion: string, env: string): Promise<string> {
  const cacheKey = clientId;
  const cached = phonePeTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token; // return cached token with 60s buffer
  }

  // Try the configured environment first, then fall back to the other
  const productionUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
  const sandboxUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
  
  // 'production' uses production URL first; 'sandbox'/'uat'/anything-else uses sandbox first
  const urlsToTry = env === 'production'
    ? [productionUrl, sandboxUrl]
    : [sandboxUrl, productionUrl];

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    client_version: clientVersion,
    grant_type: 'client_credentials',
  });

  let lastError: any = null;

  for (const tokenUrl of urlsToTry) {
    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      // Safely parse: PhonePe can return plain text on auth failures
      const rawText = await res.text();
      let data: any = {};
      try { data = JSON.parse(rawText); } catch { data = { message: rawText }; }
      console.log(`PhonePe OAuth attempt [${tokenUrl}]:`, res.status, JSON.stringify(data));

      if (res.ok && data.access_token) {
        // Cache with expiry (expires_in is in seconds)
        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        phonePeTokenCache.set(cacheKey, { token: data.access_token, expiresAt });
        return data.access_token;
      }

      lastError = data;
    } catch (fetchErr) {
      console.error('PhonePe OAuth fetch error:', fetchErr);
      lastError = { message: 'Network error' };
    }
  }

  console.error('PhonePe OAuth Failed on all endpoints. Last error:', JSON.stringify(lastError));
  const errMsg = lastError?.message || lastError?.error_description || 'PhonePe account not yet activated. Please complete merchant KYC on the PhonePe Business Dashboard.';
  throw new AppError(errMsg, 502);
}

// ─── Helper: Get PhonePe V2 credentials for a clinic ────────────────────────

interface PhonePeV2Creds {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  env: string;
}

async function getPhonePeV2Creds(clinicId: string): Promise<PhonePeV2Creds> {
  // Global env var fallback
  const envClientId = process.env.PHONEPE_CLIENT_ID;
  const envClientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const envClientVersion = process.env.PHONEPE_CLIENT_VERSION || '1';
  const envMode = process.env.PHONEPE_ENV || 'production';

  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.id, clinicId),
  });
  if (!clinic) throw new AppError('Clinic not found', 404);

  // If clinic has DB credentials saved via Settings page
  if (clinic.paymentGateway === 'phonepe' && clinic.paymentGatewayKeyEncrypted && clinic.paymentGatewaySecretEncrypted) {
    try {
      const clientId = Buffer.from(clinic.paymentGatewayKeyEncrypted, 'base64').toString('utf-8');
      const secretRaw = Buffer.from(clinic.paymentGatewaySecretEncrypted, 'base64').toString('utf-8');
      let clientSecret = secretRaw;
      let clientVersion = '1';

      if (secretRaw.startsWith('{')) {
        const parsed = JSON.parse(secretRaw);
        clientSecret = parsed.clientSecret || parsed.saltKey || secretRaw;
        clientVersion = parsed.clientVersion || parsed.saltIndex || '1';
      }

      // Dynamically detect UAT / Sandbox mode
      const isSandbox = envMode === 'sandbox' || 
        clientId.toLowerCase().includes('test') || 
        clientId.toLowerCase().includes('uat') || 
        clientId.toLowerCase().includes('sandbox') ||
        clientId === 'M23667ZTWVUU4_2602051256' ||
        (envClientId && clientId === envClientId);

      const targetEnv = isSandbox ? 'sandbox' : 'production';
      console.log(`[PhonePe] Using DB credentials for clinic ${clinicId} → ${targetEnv} mode`);

      return { clientId, clientSecret, clientVersion, env: targetEnv };
    } catch (e) {
      // fall through to env vars
    }
  }

  // Fallback to .env file credentials (respects PHONEPE_ENV)
  if (envClientId && envClientSecret) {
    console.log(`[PhonePe] Using .env credentials → ${envMode} mode`);
    return { clientId: envClientId, clientSecret: envClientSecret, clientVersion: envClientVersion, env: envMode };
  }

  throw new AppError('PhonePe payment gateway not configured for this clinic', 503);
}

// ─── Helper: Get decrypted gateway credentials for Razorpay ──────────────────

async function getRazorpayCredentials(clinicId: string) {
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.id, clinicId),
  });
  if (!clinic) throw new AppError('Clinic not found', 404);
  if (!clinic.paymentGatewayKeyEncrypted || !clinic.paymentGatewaySecretEncrypted) {
    throw new AppError('Payment gateway not configured for this clinic', 503);
  }
  const key = Buffer.from(clinic.paymentGatewayKeyEncrypted, 'base64').toString('utf-8');
  const secret = Buffer.from(clinic.paymentGatewaySecretEncrypted, 'base64').toString('utf-8');
  return { key, secret, gateway: clinic.paymentGateway };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  appointmentId: z.string().uuid(),
  origin: z.string().url().optional(),
});

const verifyPaymentSchema = z.object({
  appointmentId: z.string().uuid(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

const verifyPhonepeSchema = z.object({
  appointmentId: z.string().uuid(),
  txnId: z.string(),
});

// ─── POST /payments/create-order ─────────────────────────────────────────────

router.post('/create-order', validate(createOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointmentId, origin } = req.body;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        with: { patient: true, doctor: true, clinic: true },
      });

      if (!apt) throw new AppError('Appointment not found', 404);
      if (apt.status !== 'pending_payment') {
        throw new AppError(`Appointment is already ${apt.status}`, 400);
      }

      const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, apt.clinicId) });
      if (!clinic) throw new AppError('Clinic not found', 404);

      const amountPaise = Math.round(Number(apt.consultationFeeSnapshot) * 100);

      // Dynamically resolve frontend origin to redirect back to the exact starting domain (custom domain or localhost)
      let resolvedOrigin = 'http://localhost:3000';
      if (origin) {
        resolvedOrigin = origin;
      } else {
        const headerOrigin = req.headers.origin || req.headers.referer;
        if (headerOrigin) {
          try {
            const parsed = new URL(headerOrigin);
            resolvedOrigin = parsed.origin;
          } catch {
            resolvedOrigin = headerOrigin;
          }
        } else {
          resolvedOrigin = process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000';
        }
      }
      const frontendOrigin = resolvedOrigin.replace(/\/$/, '');

      // Teleconsult always routes through PhonePe for online pre-payment,
      // even if the clinic's default gateway is 'free' (walk-in).
      const isTeleconsult = apt.consultationType === 'teleconsult';
      const usePhonePe = clinic.paymentGateway === 'phonepe' || isTeleconsult;

      // ── PhonePe V2 ──────────────────────────────────────────────────────────
      if (usePhonePe) {
        const creds = await getPhonePeV2Creds(apt.clinicId);
        const accessToken = await getPhonePeV2Token(creds.clientId, creds.clientSecret, creds.clientVersion, creds.env);

        const merchantOrderId = `ORD${apt.id.replace(/-/g, '').slice(0, 16)}${Date.now().toString().slice(-6)}`;
        const redirectUrl = `${frontendOrigin}/${(apt as any).clinic.slug}/book?phonepe_verify=1&appointmentId=${appointmentId}&txnId=${merchantOrderId}`;

        const paymentApiUrl = creds.env === 'production'
          ? 'https://api.phonepe.com/apis/pg/checkout/v2/pay'
          : 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay';

        const payload = {
          merchantOrderId,
          amount: amountPaise,
          expireAfter: 1200, // 20 minutes
          paymentFlow: {
            type: 'PG_CHECKOUT',
            message: `Consultation with ${(apt as any).doctor?.name || 'Doctor'}`,
            merchantUrls: {
              redirectUrl,
            },
          },
        };

        console.log('PhonePe V2 Pay Request URL:', paymentApiUrl);
        console.log('PhonePe V2 Payload:', JSON.stringify(payload, null, 2));

        const phonepeRes = await fetch(paymentApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        // Safely parse: PhonePe can return plain text on auth/env mismatch errors
        const phonepeRawText = await phonepeRes.text();
        let phonepeData: any = {};
        try { phonepeData = JSON.parse(phonepeRawText); } catch { phonepeData = { message: phonepeRawText }; }

        console.log('PhonePe V2 Response Status:', phonepeRes.status);
        console.log('PhonePe V2 Response:', JSON.stringify(phonepeData, null, 2));

        if (!phonepeRes.ok || phonepeData.state === 'FAILED') {
          throw new AppError(phonepeData.message || phonepeData.error || `PhonePe payment initialization failed (HTTP ${phonepeRes.status})`, 502);
        }

        const paymentUrl = phonepeData.redirectUrl || phonepeData.data?.instrumentResponse?.redirectInfo?.url;
        if (!paymentUrl) {
          console.error('PhonePe V2 Full Response (no redirectUrl):', JSON.stringify(phonepeData, null, 2));
          throw new AppError('PhonePe did not return a redirect URL', 502);
        }

        // Store pending payment record
        await db.insert(payments).values({
          clinicId: apt.clinicId,
          appointmentId: apt.id,
          patientId: apt.patientId,
          amount: apt.consultationFeeSnapshot,
          currency: 'INR',
          gateway: 'phonepe',
          gatewayOrderId: merchantOrderId,
          status: 'pending',
        }).onConflictDoUpdate({
          target: payments.appointmentId,
          set: {
            patientId: apt.patientId,
            amount: apt.consultationFeeSnapshot,
            gateway: 'phonepe',
            gatewayOrderId: merchantOrderId,
            status: 'pending',
            gatewayPaymentId: null,
            gatewaySignature: null,
            paymentMethod: null,
            metadata: null,
            completedAt: null,
            createdAt: new Date(),
          }
        });

        return res.json({
          gateway: 'phonepe',
          paymentUrl,
          appointmentId: apt.id,
          merchantOrderId,
        });
      }

      // ── Default: Razorpay ────────────────────────────────────────────────────
      const { key, secret } = await getRazorpayCredentials(apt.clinicId);
      const razorpay = new Razorpay({ key_id: key, key_secret: secret });

      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `apt_${apt.id.slice(0, 20)}`,
        notes: {
          appointment_id: apt.id,
          clinic_id: apt.clinicId,
          patient_phone: (apt as any).patient?.phone,
        },
      });

      // Store pending payment record
      await db.insert(payments).values({
        clinicId: apt.clinicId,
        appointmentId: apt.id,
        patientId: apt.patientId,
        amount: apt.consultationFeeSnapshot,
        currency: 'INR',
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        status: 'pending',
      }).onConflictDoUpdate({
        target: payments.appointmentId,
        set: {
          patientId: apt.patientId,
          amount: apt.consultationFeeSnapshot,
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          status: 'pending',
          gatewayPaymentId: null,
          gatewaySignature: null,
          paymentMethod: null,
          metadata: null,
          completedAt: null,
          createdAt: new Date(),
        }
      });

      return res.json({
        gateway: 'razorpay',
        orderId: order.id,
        amount: amountPaise,
        currency: 'INR',
        keyId: key,
        appointmentId: apt.id,
        prefill: {
          name: (apt as any).patient?.name,
          contact: (apt as any).patient?.phone,
          email: (apt as any).patient?.email,
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── POST /payments/verify — Client-side verification after successful pay ───

router.post('/verify', validate(verifyPaymentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointmentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        with: { payment: true },
      });
      if (!apt) throw new AppError('Appointment not found', 404);

      const { secret } = await getRazorpayCredentials(apt.clinicId);

      // CRITICAL: Verify Razorpay signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        throw new AppError('Payment verification failed — invalid signature', 400);
      }

      // Update payment + appointment in transaction
      await db.transaction(async (tx) => {
        await tx.update(payments)
          .set({
            gatewayPaymentId: razorpayPaymentId,
            gatewaySignature: razorpaySignature,
            status: 'success',
            completedAt: new Date(),
          })
          .where(eq(payments.appointmentId, appointmentId));

        await tx.update(appointments)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(eq(appointments.id, appointmentId));

        // Schedule 24h reminder
        await tx.insert(appointmentReminders).values({
          appointmentId,
          reminderType: 'email',
          status: 'pending',
          scheduledFor: addMinutes(apt.appointmentDatetime, -60 * 24),
        }).onConflictDoNothing();
      });

      // Queue confirmation email
      await emailQueue.add('send_confirmation', {
        type: 'appointment_confirmation',
        appointmentId,
      });

      await auditLog({
        clinicId: apt.clinicId,
        actorType: 'system',
        action: 'payment.verified',
        resourceType: 'payment',
        after: { razorpayPaymentId, status: 'success' },
      });

      return res.json({
        message: 'Payment verified. Appointment confirmed.',
        appointmentId,
        status: 'confirmed',
      });
    } catch (err) { next(err); }
  }
);

// ─── POST /payments/verify-phonepe — Verification after PhonePe V2 redirect ─

router.post('/verify-phonepe', validate(verifyPhonepeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appointmentId, txnId } = req.body;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        with: { patient: true, doctor: true, clinic: true },
      });
      if (!apt) throw new AppError('Appointment not found', 404);

      // If already confirmed, just return success (idempotency)
      if (apt.status === 'confirmed') {
        return res.json({
          status: 'success',
          message: 'Appointment already confirmed.',
          appointmentId,
        });
      }

      const creds = await getPhonePeV2Creds(apt.clinicId);
      const accessToken = await getPhonePeV2Token(creds.clientId, creds.clientSecret, creds.clientVersion, creds.env);

      const statusUrl = creds.env === 'production'
        ? `https://api.phonepe.com/apis/pg/checkout/v2/order/${txnId}/status`
        : `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${txnId}/status`;

      const phonepeRes = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${accessToken}`,
        },
      });

      // Safely parse response text
      const statusRawText = await phonepeRes.text();
      let phonepeData: any = {};
      try { phonepeData = JSON.parse(statusRawText); } catch { phonepeData = { message: statusRawText }; }
      console.log('PhonePe V2 Status Check Response:', JSON.stringify(phonepeData, null, 2));

      if (!phonepeRes.ok) {
        throw new AppError('Failed to fetch payment status from PhonePe', 502);
      }

      const orderState = phonepeData.state; // COMPLETED | PENDING | FAILED

      if (orderState === 'COMPLETED') {
        const paymentId = phonepeData.paymentDetails?.[0]?.transactionId || txnId;
        const method = phonepeData.paymentDetails?.[0]?.paymentMode || 'UPI';

        // Update payment + appointment in transaction
        await db.transaction(async (tx) => {
          await tx.update(payments)
            .set({
              gatewayPaymentId: paymentId,
              status: 'success',
              paymentMethod: method,
              completedAt: new Date(),
              metadata: phonepeData,
            })
            .where(eq(payments.appointmentId, appointmentId));

          await tx.update(appointments)
            .set({ status: 'confirmed', updatedAt: new Date() })
            .where(eq(appointments.id, appointmentId));

          // Schedule 24h reminder
          await tx.insert(appointmentReminders).values({
            appointmentId,
            reminderType: 'email',
            status: 'pending',
            scheduledFor: addMinutes(apt.appointmentDatetime, -60 * 24),
          }).onConflictDoNothing();
        });

        // Queue confirmation email (which will trigger email + SMS)
        await emailQueue.add('send_confirmation', {
          type: 'appointment_confirmation',
          appointmentId,
        });

        await auditLog({
          clinicId: apt.clinicId,
          actorType: 'system',
          action: 'payment.verified',
          resourceType: 'payment',
          after: { gatewayPaymentId: paymentId, status: 'success' },
        });

        return res.json({
          status: 'success',
          message: 'Payment verified. Appointment confirmed.',
          appointmentId,
        });
      } else if (orderState === 'PENDING') {
        return res.json({
          status: 'pending',
          message: 'Payment status is pending.',
          appointmentId,
        });
      } else {
        // Payment failed or other status
        await db.transaction(async (tx) => {
          await tx.update(payments)
            .set({
              status: 'failed',
              metadata: phonepeData,
            })
            .where(eq(payments.appointmentId, appointmentId));
        });

        return res.json({
          status: 'failed',
          message: phonepeData.message || 'Payment failed.',
          appointmentId,
        });
      }

    } catch (err) { next(err); }
  }
);

// ─── POST /payments/webhook-phonepe — Webhook callback from PhonePe V2 ───────

router.post('/webhook-phonepe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { merchantOrderId, transactionId, state, amount, paymentMode } = req.body;

    if (!merchantOrderId) {
      return res.status(400).json({ error: 'Missing merchantOrderId' });
    }

    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.gatewayOrderId, merchantOrderId),
    });

    if (!existingPayment) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (state === 'COMPLETED') {
      if (existingPayment.status !== 'success') {
        const appointmentId = existingPayment.appointmentId;
        const apt = await db.query.appointments.findFirst({
          where: eq(appointments.id, appointmentId),
        });

        if (apt) {
          await db.transaction(async (tx) => {
            await tx.update(payments)
              .set({
                gatewayPaymentId: transactionId || merchantOrderId,
                status: 'success',
                paymentMethod: paymentMode || 'UPI',
                completedAt: new Date(),
                metadata: req.body,
              })
              .where(eq(payments.id, existingPayment.id));

            await tx.update(appointments)
              .set({ status: 'confirmed', updatedAt: new Date() })
              .where(eq(appointments.id, appointmentId));

            await tx.insert(appointmentReminders).values({
              appointmentId,
              reminderType: 'email',
              status: 'pending',
              scheduledFor: addMinutes(apt.appointmentDatetime, -60 * 24),
            }).onConflictDoNothing();
          });

          await emailQueue.add('send_confirmation', {
            type: 'appointment_confirmation',
            appointmentId,
          });
        }
      }
    } else if (state === 'FAILED') {
      if (existingPayment.status === 'pending') {
        await db.update(payments)
          .set({ status: 'failed', metadata: req.body })
          .where(eq(payments.id, existingPayment.id));
      }
    }

    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /webhooks/razorpay — Razorpay webhook (ground truth) ───────────────

router.post('/razorpay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = req.body as Buffer;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const signature = req.headers['x-razorpay-signature'] as string;

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSig !== signature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody.toString());
    const { event: eventType, payload } = event;

    if (eventType === 'payment.captured') {
      const paymentEntity = payload.payment.entity;
      const { order_id, id: payment_id, amount, method } = paymentEntity;

      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.gatewayOrderId, order_id),
      });

      if (!existingPayment || existingPayment.status === 'success') {
        return res.json({ received: true });
      }

      await db.transaction(async (tx) => {
        await tx.update(payments)
          .set({
            gatewayPaymentId: payment_id,
            status: 'success',
            paymentMethod: method,
            completedAt: new Date(),
            metadata: paymentEntity,
          })
          .where(eq(payments.gatewayOrderId, order_id));

        await tx.update(appointments)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(eq(appointments.id, existingPayment.appointmentId));
      });

      await emailQueue.add('send_confirmation', {
        type: 'appointment_confirmation',
        appointmentId: existingPayment.appointmentId,
      });
    }

    if (eventType === 'refund.processed') {
      const refundEntity = payload.refund.entity;
      await db.update(payments)
        .set({
          status: 'refunded',
          refundId: refundEntity.id,
          refundedAt: new Date(),
        })
        .where(eq(payments.gatewayPaymentId, refundEntity.payment_id));
    }

    return res.json({ received: true });
  } catch (err) { next(err); }
});

// ─── POST /payments/:appointmentId/mark-paid-offline — Mark offline payment as success ───

router.post('/:appointmentId/mark-paid-offline', authMiddleware,
  requireRole('owner', 'admin', 'receptionist'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const appointmentId = req.params.appointmentId as string;

      const apt = await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
      });
      if (!apt) throw new AppError('Appointment not found', 404);

      await db.transaction(async (tx) => {
        // Upsert payment as success
        await tx.insert(payments).values({
          clinicId: apt.clinicId,
          appointmentId: apt.id,
          patientId: apt.patientId,
          amount: apt.consultationFeeSnapshot,
          currency: 'INR',
          gateway: 'free',
          status: 'success',
          paymentMethod: 'cash',
          completedAt: new Date(),
        }).onConflictDoUpdate({
          target: payments.appointmentId,
          set: {
            status: 'success',
            paymentMethod: 'cash',
            completedAt: new Date(),
            gateway: 'free',
            amount: apt.consultationFeeSnapshot,
          }
        });

        // Ensure appointment is confirmed
        await tx.update(appointments)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(eq(appointments.id, appointmentId));
      });

      return res.json({ message: 'Offline payment recorded successfully' });
    } catch (err) { next(err); }
  }
);

export default router;
