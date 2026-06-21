'use client';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      {/* Background orbs */}
      <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '40%', right: '20%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-in" style={{ textAlign: 'center', maxWidth: '720px', position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '100px', padding: '6px 16px', fontSize: '13px', color: 'var(--primary-light)', marginBottom: '2rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-light)', animation: 'pulse-glow 2s infinite' }} />
          Smart Clinic Management Platform
        </div>

        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: '800', lineHeight: '1.1', marginBottom: '1.5rem' }}>
          Your clinic,{' '}
          <span className="gradient-text">online in minutes</span>
        </h1>

        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', marginBottom: '3rem', lineHeight: '1.7', maxWidth: '560px', margin: '0 auto 3rem' }}>
          Register your clinic, add doctors, set availability — and share a booking link with patients. No phone calls. No waiting.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            color: '#fff', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '600', fontSize: '1rem', textDecoration: 'none',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            🚀 Register Your Clinic
          </Link>
          <Link href="/admin/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '600', fontSize: '1rem', textDecoration: 'none',
            transition: 'transform 0.2s, background 0.2s',
          }}>
            ⚙️ Admin Login
          </Link>
        </div>

        {/* How it works */}
        <div style={{ marginTop: '5rem' }}>
          <h2 style={{ fontSize: '1.1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2rem', fontWeight: '600' }}>How It Works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {[
              { step: '01', icon: '🏥', title: 'Register Clinic', desc: 'Sign up and create your clinic profile with a unique booking URL.' },
              { step: '02', icon: '👨‍⚕️', title: 'Add Doctors', desc: 'Add doctors, set their schedule, fees, and availability.' },
              { step: '03', icon: '🔗', title: 'Share Link', desc: 'Share your booking URL with patients — they book online instantly.' },
              { step: '04', icon: '📊', title: 'Manage', desc: 'Track appointments, payments, and patients from your dashboard.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="glass glow-card" style={{ padding: '2rem 1.5rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary-light)', fontWeight: '700', letterSpacing: '1px' }}>STEP {step}</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '4rem', flexWrap: 'wrap' }}>
          {[
            { value: '₹0', label: 'Setup Cost' },
            { value: '2 min', label: 'To Go Live' },
            { value: '24/7', label: 'Online Booking' },
          ].map(({ value, label }) => (
            <div key={label} className="glass" style={{ padding: '1rem 1.5rem', textAlign: 'center', minWidth: '120px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-light)' }}>{value}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
