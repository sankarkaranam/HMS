'use client';
import Link from 'next/link';
import { Building2, UserCog, Hospital, Stethoscope, Link2, LayoutDashboard, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '-8%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,101,192,0.09) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-8%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,151,167,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', right: '18%', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,101,192,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-in" style={{ textAlign: 'center', maxWidth: '720px', position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(21,101,192,0.08)', border: '1px solid rgba(21,101,192,0.22)', borderRadius: '100px', padding: '6px 16px', fontSize: '13px', color: 'var(--primary)', marginBottom: '2rem', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', animation: 'pulse-glow 2s infinite' }} />
          Smart Clinic Management Platform
        </div>

        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: '800', lineHeight: '1.1', marginBottom: '1.5rem', color: 'var(--text)' }}>
          Your clinic,{' '}
          <span className="gradient-text">online in minutes</span>
        </h1>

        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', marginBottom: '3rem', lineHeight: '1.7', maxWidth: '560px', margin: '0 auto 3rem' }}>
          Register your clinic, add doctors, set availability — and share a booking link with patients. No phone calls. No waiting.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'var(--primary)',
            color: '#fff', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '700', fontSize: '1rem', textDecoration: 'none',
            boxShadow: '0 6px 24px rgba(21,101,192,0.30)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            <Building2 size={18} />
            Register Your Clinic
          </Link>
          <Link href="/admin/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: '#FFFFFF', border: '1.5px solid rgba(21,101,192,0.25)',
            color: 'var(--primary)', padding: '14px 32px', borderRadius: '100px',
            fontWeight: '600', fontSize: '1rem', textDecoration: 'none',
            transition: 'transform 0.2s, background 0.2s',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <UserCog size={18} />
            Admin Login
          </Link>
        </div>

        {/* How it works */}
        <div style={{ marginTop: '5rem' }}>
          <h2 style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '2rem', fontWeight: '700' }}>How It Works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            {[
              { step: '01', Icon: Hospital, title: 'Register Clinic', desc: 'Sign up and create your clinic profile with a unique booking URL.' },
              { step: '02', Icon: Stethoscope, title: 'Add Doctors', desc: 'Add doctors, set their schedule, fees, and availability.' },
              { step: '03', Icon: Link2, title: 'Share Link', desc: 'Share your booking URL with patients — they book online instantly.' },
              { step: '04', Icon: LayoutDashboard, title: 'Manage', desc: 'Track appointments, payments, and patients from your dashboard.' },
            ].map(({ step, Icon, title, desc }) => (
              <div key={step} className="glass glow-card" style={{ padding: '2rem 1.5rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(21,101,192,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color="var(--primary)" strokeWidth={1.75} />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: '700', letterSpacing: '1.5px' }}>STEP {step}</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text)' }}>{title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '4rem', flexWrap: 'wrap' }}>
          {[
            { value: '₹0', label: 'Setup Cost' },
            { value: '2 min', label: 'To Go Live' },
            { value: '24/7', label: 'Online Booking' },
          ].map(({ value, label }) => (
            <div key={label} className="glass" style={{ padding: '1.1rem 1.8rem', textAlign: 'center', minWidth: '130px' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--primary-light)' }}>{value}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
