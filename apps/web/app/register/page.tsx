'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Hospital, User, CheckCircle, AlertCircle, Link2,
  ListChecks, Settings, ArrowLeft, Eye, EyeOff, Loader2, Plus
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RegisterClinicPage() {
  const router = useRouter();

  // Form fields
  const [clinicName, setClinicName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // Owner fields
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clinicId: string; slug: string; bookingUrl: string } | null>(null);

  // Auto-generate slug from clinic name (unless user manually edits it)
  useEffect(() => {
    if (!slugManuallyEdited && clinicName) {
      const generated = clinicName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
      setSlug(generated);
    }
  }, [clinicName, slugManuallyEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName || !slug || !ownerName || !ownerEmail || !ownerPassword) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/clinics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clinicName,
          slug,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
          timezone: 'Asia/Kolkata',
          ownerName,
          ownerEmail,
          ownerPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register clinic');
      }

      setSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://yoursite.com';

  // Success state
  if (success) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,101,192,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="glass animate-in" style={{ padding: '3rem 2.5rem', maxWidth: '520px', width: '100%', zIndex: 1, textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '2px solid rgba(46,125,50,0.25)' }}>
            <CheckCircle size={34} color="var(--success)" strokeWidth={1.75} className="check-draw" />
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text)' }}>Clinic Registered!</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
            Your clinic has been created successfully. Here&apos;s your booking URL:
          </p>

          {/* Booking URL display */}
          <div style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem', marginBottom: '1.5rem', border: '1px solid var(--border)', wordBreak: 'break-all' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: '600' }}>Patient Booking URL</div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-light)' }}>
              {currentDomain}/book/{success.slug}
            </div>
          </div>

          {/* Next steps */}
          <div style={{ background: 'rgba(21,101,192,0.06)', borderRadius: 'var(--radius-sm)', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left', border: '1px solid rgba(21,101,192,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--primary)' }}>
              <ListChecks size={15} strokeWidth={2} />
              Next Steps
            </div>
            <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <li>Login to the admin dashboard</li>
              <li>Add your doctors and set their availability</li>
              <li>Configure payment gateway (Razorpay / PhonePe)</li>
              <li>Share your booking URL with patients!</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/admin/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'var(--primary)',
              color: '#fff', padding: '12px 28px', borderRadius: '100px',
              fontWeight: '600', fontSize: '0.95rem', textDecoration: 'none',
              boxShadow: '0 6px 20px rgba(21,101,192,0.25)',
            }}>
              <Settings size={16} strokeWidth={2} />
              Go to Admin Login
            </Link>
            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#FFFFFF', border: '1.5px solid rgba(21,101,192,0.2)',
              color: 'var(--primary)', padding: '12px 28px', borderRadius: '100px',
              fontWeight: '600', fontSize: '0.95rem', textDecoration: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <ArrowLeft size={16} strokeWidth={2} />
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      {/* Background orbs */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,101,192,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,151,167,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-in" style={{ maxWidth: '560px', width: '100%', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '1.5rem' }}>
            <ArrowLeft size={14} />
            Back to Home
          </Link>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text)' }}>
            Register Your <span className="gradient-text">Clinic</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Create your clinic profile and start accepting online appointments.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--danger-bg)', border: '1px solid rgba(198,40,40,0.2)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            <AlertCircle size={15} strokeWidth={2} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Clinic Details Section */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(21,101,192,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Hospital size={17} color="var(--primary)" strokeWidth={1.75} />
              </div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>Clinic Details</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Clinic Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>
                  Clinic Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="e.g., Sri Swetha Clinic"
                  className="premium-input"
                />
              </div>

              {/* URL Slug */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>
                  Booking URL Slug <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  placeholder="e.g., sri-swetha-clinic"
                  className="premium-input"
                  pattern="^[a-z0-9-]+$"
                  title="Only lowercase letters, numbers, and hyphens"
                />
                {slug && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.4rem', wordBreak: 'break-all' }}>
                    <Link2 size={12} strokeWidth={2} />
                    Patients will book at: <strong>{currentDomain}/book/{slug}</strong>
                  </div>
                )}
              </div>

              {/* Phone & Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91XXXXXXXXXX"
                    className="premium-input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinic@example.com"
                    className="premium-input"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Clinic address (shown to patients)"
                  className="premium-input"
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Owner Account Section */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(21,101,192,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={17} color="var(--primary)" strokeWidth={1.75} />
              </div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>Owner Account</h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              This creates the admin account for managing your clinic dashboard.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Owner Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>
                  Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g., Dr. Ravi Kumar"
                  className="premium-input"
                />
              </div>

              {/* Owner Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>
                  Login Email <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@clinic.com"
                  className="premium-input"
                />
              </div>

              {/* Owner Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>
                  Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="premium-input"
                    style={{ paddingRight: '3rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '100px',
              background: loading ? 'var(--surface-4)' : 'var(--primary)',
              border: 'none',
              color: '#fff',
              fontWeight: '700',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 6px 24px rgba(21,101,192,0.28)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating clinic...</>
              : <><Plus size={18} strokeWidth={2.5} /> Register Clinic</>
            }
          </button>

          {/* Login link */}
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Already have a clinic?{' '}
            <Link href="/admin/login" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
              Login here
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
