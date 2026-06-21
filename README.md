# ClinicBook — Multi-Tenant Hospital Appointment Booking SaaS

A production-ready, multi-tenant SaaS platform for hospitals and clinics to manage appointment bookings. Built with Next.js 15, Express.js, PostgreSQL, and Redis.

---

## 🏗️ Architecture Overview

```
clinic-saas/
├── apps/
│   ├── api/          # Express.js REST API (TypeScript + Drizzle ORM)
│   └── web/          # Next.js 15 Frontend (App Router)
├── packages/         # Shared packages
└── docker-compose.yml
```

### URL Structure

| Route | Description |
|-------|-------------|
| `/` | Platform landing page |
| `/register` | Self-service clinic registration |
| `/admin/login` | Clinic staff login (Email+Password or OTP) |
| `/admin/dashboard` | Clinic admin control panel |
| `/super-admin/login` | **SaaS Global Admin login** |
| `/super-admin/dashboard` | **SaaS Global Admin control panel** |
| `/book/[clinic-slug]` | Public patient booking page |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 1. Clone & Install
```bash
git clone https://github.com/sankarkaranam/HMS.git
cd HMS
pnpm install
```

### 2. Start Infrastructure
```bash
docker-compose up -d
```
This starts PostgreSQL on port `5433` and Redis on port `6379`.

### 3. Configure Environment
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit both .env files with your values
```

### 4. Run Migrations + Seed
```bash
pnpm db:migrate
pnpm --filter=@clinic/api exec tsx src/db/seed-doctor.ts
```

### 5. Start Dev Servers
```bash
pnpm dev
```
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000

---

## 👑 SaaS Global Admin

The platform owner can onboard hospitals/clinics via the Super-Admin portal.

**Default Credentials (change in production!)**
- URL: `http://localhost:3000/super-admin/login`
- Email: `admin@clinicbook.com`
- Password: `adminpassword123`

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `apps/api/.env` before deploying.

### Onboarding Flow
1. Login to Super-Admin dashboard
2. Click **"Onboard New Hospital"**
3. Fill hospital details + admin credentials
4. System automatically creates clinic DB record + admin login
5. Share the booking URL and admin credentials with the hospital

---

## 🏥 Clinic Admin Portal

After being onboarded by the Super-Admin, hospital admins can:
- Login at `/admin/login` using their email + password
- Manage doctors (add, edit, set availability & fees)
- Review appointments & patient details
- Configure payment gateway (Razorpay / PhonePe / Cashfree)
- View monthly revenue stats

---

## 📱 Patient Booking

Patients access `https://your-domain.com/book/[clinic-slug]` to:
- Browse available doctors filtered by specialization
- Pick a date and time slot
- Fill in patient details
- Pay consultation fee online
- Receive booking confirmation

---

## 🗄️ Database Schema

- `clinic_groups` — Groups of clinics (franchise support)
- `clinics` — Individual clinic tenants
- `clinic_staff` — Admins, doctors, receptionists
- `doctors` — Doctor profiles + availability rules
- `doctor_availability` — Weekly schedule per doctor
- `doctor_leaves` — Leave/holiday tracking
- `patients` — Patient records (per clinic)
- `appointments` — Booking records
- `payments` — Payment transactions
- `otp_tokens` — OTP authentication tokens
- `refresh_tokens` — JWT refresh token store

---

## 🔐 Authentication

| User Type | Method | Route |
|-----------|--------|-------|
| SaaS Super-Admin | Email + Password (env-based) | `POST /auth/super-admin/login` |
| Clinic Staff | Email + Password | `POST /auth/login` |
| Clinic Staff (alt) | Email OTP | `POST /auth/send-otp` + `POST /auth/verify-otp` |

---

## ⚙️ Environment Variables

### API (`apps/api/.env`)
See `apps/api/.env.example` for all required variables.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_ACCESS_SECRET` — JWT signing secret (min 32 chars)
- `JWT_REFRESH_SECRET` — JWT refresh signing secret
- `SUPER_ADMIN_EMAIL` — Global admin email
- `SUPER_ADMIN_PASSWORD` — Global admin password

### Web (`apps/web/.env.local`)
- `NEXT_PUBLIC_API_URL` — Backend API URL (e.g., `https://api.yourdomain.com`)

---

## 🚢 Deployment

### Recommended Stack
- **Frontend**: Vercel (Next.js App Router)
- **Backend API**: Railway / Render / Fly.io
- **Database**: Neon (serverless Postgres) or Supabase
- **Redis**: Upstash (serverless Redis)

### Deploy Backend to Railway
1. Connect your GitHub repo to Railway
2. Set the root directory to `apps/api`
3. Set build command: `pnpm build`
4. Set start command: `pnpm start`
5. Add all environment variables from `.env.example`

### Deploy Frontend to Vercel
1. Connect your GitHub repo to Vercel
2. Set root directory to `apps/web`
3. Set `NEXT_PUBLIC_API_URL` to your deployed API URL
4. Deploy

---

## 📄 License

MIT
