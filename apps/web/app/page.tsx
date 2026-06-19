'use client';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      {/* Background orbs */}
      <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-in" style={{ textAlign: 'center', maxWidth: '640px', position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '100px', padding: '6px 16px', fontSize: '13px', color: 'var(--primary-light)', marginBottom: '2rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-light)', animation: 'pulse-glow 2s infinite' }} />
          Smart Clinic Management SaaS
        </div>

        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: '800', lineHeight: '1.1', marginBottom: '1.5rem' }}>
          Book appointments{' '}
          <span className="gradient-text">instantly</span>
        </h1>

        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '3rem', lineHeight: '1.7' }}>
          No phone calls. No waiting. Patients book online, doctors manage everything in one dashboard.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/book/dr-ravi-clinic" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            color: '#fff', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '600', fontSize: '1rem', textDecoration: 'none',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            📅 Book Appointment
          </Link>
          <Link href="/admin/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '600', fontSize: '1rem', textDecoration: 'none',
          }}>
            ⚙️ Admin Login
          </Link>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '4rem', flexWrap: 'wrap' }}>
          {[
            { value: '15+', label: 'DB Tables' },
            { value: '100%', label: 'Type-safe' },
            { value: 'Live', label: 'API Status' },
          ].map(({ value, label }) => (
            <div key={label} className="glass" style={{ padding: '1rem 1.5rem', textAlign: 'center', minWidth: '100px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-light)' }}>{value}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
