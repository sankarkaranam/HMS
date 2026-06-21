import 'dotenv/config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { AppError } from './lib/errors';

import authRouter from './modules/auth/auth.router';
import clinicsRouter from './modules/clinics/clinics.router';
import doctorsRouter from './modules/doctors/doctors.router';
import appointmentsRouter from './modules/appointments/appointments.router';
import paymentsRouter from './modules/payments/payments.router';
import { startReminderCron } from './jobs/reminder.cron';

// Initialize queues (workers start on import)
import './queues';


const app: Application = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet());

// Dynamic CORS: allow localhost, all *.vercel.app preview deployments, and any explicitly listed origins
const explicitOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow localhost for local dev
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    // Allow all Vercel preview + production deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    // Allow explicitly listed origins from env
    if (explicitOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Global rate limit: 100 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ─── Body Parsing ─────────────────────────────────────────────────────────────

// Raw body needed for Razorpay webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Logging ─────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authLimiter, authRouter);
app.use('/clinics', clinicsRouter);
app.use('/', doctorsRouter);          // handles /clinics/:id/doctors and /doctors/:id/*
app.use('/', appointmentsRouter); // handles /clinics/:id/appointments, /clinics/:id/book, /appointments/:id/*
app.use('/payments', paymentsRouter);
app.use('/webhooks', paymentsRouter); // /webhooks/razorpay uses raw body; /payments/webhook-phonepe uses JSON

// Start background jobs
startReminderCron();


// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Unexpected error — log and return generic message
  console.error('Unexpected error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
