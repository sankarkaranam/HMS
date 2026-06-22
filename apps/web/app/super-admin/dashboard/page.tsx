'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Clinic {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');

  // Clinics state
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form Modal state
  const [showModal, setShowModal] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Modal state
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal state
  const [deletingClinic, setDeletingClinic] = useState<Clinic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Success State Modal
  const [onboardedClinic, setOnboardedClinic] = useState<any | null>(null);

  // Auth gate
  useEffect(() => {
    const localToken = localStorage.getItem('superAccessToken');
    const localEmail = localStorage.getItem('superAdminEmail');
    const localName = localStorage.getItem('superAdminName');

    if (!localToken) {
      router.push('/super-admin/login');
      return;
    }

    setToken(localToken);
    if (localEmail) setAdminEmail(localEmail);
    if (localName) setAdminName(localName);
  }, [router]);

  // Load clinics once token is ready
  useEffect(() => {
    if (!token) return;
    fetchClinics();
  }, [token]);

  const fetchClinics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/clinics/super-admin/clinics`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch clinics');
      }
      setClinics(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate slug and prefill emails
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

      // Guess owner email if not touched
      if (!ownerEmail) {
        setOwnerEmail(`admin@${generated || 'hospital'}.com`);
      }
    }
  }, [clinicName, slugManuallyEdited, ownerEmail]);

  // Password Generator
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setOwnerPassword(pass);
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName || !slug || !ownerName || !ownerEmail || !ownerPassword) {
      setFormError('Please fill in all required fields');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      const res = await fetch(`${API_URL}/clinics/super-admin/clinics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        throw new Error(data.error || 'Failed to onboard clinic');
      }

      // Show success screen
      setOnboardedClinic({
        name: clinicName,
        slug,
        ownerEmail,
        ownerPassword,
      });

      // Clear states
      setShowModal(false);
      setClinicName('');
      setSlug('');
      setSlugManuallyEdited(false);
      setPhone('');
      setEmail('');
      setAddress('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');

      // Refresh list
      fetchClinics();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred during onboarding');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditClick = (c: Clinic) => {
    setEditingClinic(c);
    setEditName(c.name);
    setEditSlug(c.slug);
    setEditPhone(c.phone || '');
    setEditEmail(c.email || '');
    setEditAddress(c.address || '');
    setEditIsActive(c.isActive);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClinic) return;
    if (!editName || !editSlug) {
      setEditError('Please fill in all required fields');
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);

      const res = await fetch(`${API_URL}/clinics/super-admin/clinics/${editingClinic.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          slug: editSlug,
          phone: editPhone || null,
          email: editEmail || null,
          address: editAddress || null,
          isActive: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update clinic');
      }

      setEditingClinic(null);
      fetchClinics();
    } catch (err: any) {
      setEditError(err.message || 'Error occurred during update');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteClick = (c: Clinic) => {
    setDeletingClinic(c);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingClinic) return;

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const res = await fetch(`${API_URL}/clinics/super-admin/clinics/${deletingClinic.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete clinic');
      }

      setDeletingClinic(null);
      fetchClinics();
    } catch (err: any) {
      setDeleteError(err.message || 'Error occurred during deletion');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('superAccessToken');
    localStorage.removeItem('superAdminEmail');
    localStorage.removeItem('superAdminName');
    router.push('/super-admin/login');
  };

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  if (!token) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--surface)', color: 'var(--text)' }}>
      {/* Sidebar */}
      <aside style={{ width: '280px', background: 'var(--surface-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '100px', padding: '2px 10px', fontSize: '0.7rem', color: 'var(--accent)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>
            SaaS Platform
          </div>
          <h2 className="gradient-text" style={{ fontSize: '1.6rem', fontWeight: '800' }}>ClinicBook</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Global Control Center</div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <button style={{ textAlign: 'left', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem' }}>
            🏥 Hospitals & Clinics
          </button>
        </nav>

        {/* User Card */}
        <div style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{adminName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SaaS Super-Admin</div>
          </div>
          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '3rem', overflowY: 'auto', maxHeight: '100vh', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>SaaS Hospital Onboarding</h1>
            <p style={{ color: 'var(--text-muted)' }}>Manage registered tenants, generate URLs, and provision administrator credentials.</p>
          </div>
          <button
            onClick={() => {
              setShowModal(true);
              setFormError(null);
            }}
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--primary))',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(6,182,212,0.25)',
              transition: 'all 0.2s',
            }}
          >
            ➕ Onboard New Hospital
          </button>
        </div>

        {/* Statistics Widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          <div className="glass" style={{ padding: '1.5rem 2rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Active Hospitals</div>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', marginTop: '0.5rem', color: 'var(--accent)' }}>{clinics.filter(c => c.isActive).length}</div>
          </div>
          <div className="glass" style={{ padding: '1.5rem 2rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Total Platforms Onboarded</div>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', marginTop: '0.5rem', color: 'var(--primary-light)' }}>{clinics.length}</div>
          </div>
          <div className="glass" style={{ padding: '1.5rem 2rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Database Connection</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', marginTop: '1.2rem', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              🟢 Secure & Connected
            </div>
          </div>
        </div>

        {/* Clinics Table */}
        <div className="glass" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Registered Medical Centers</h2>

          {loading ? (
            <div style={{ padding: '4rem 0', textAlign: 'center' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-muted)' }}>Fetching tenant directories...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '2rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: 'var(--danger)' }}>
              ⚠️ {error}
            </div>
          ) : clinics.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>No clinics have been onboarded yet. Click Onboard New Hospital to get started.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Clinic / Hospital</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>URL Slug</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Contact Info</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Booking Link</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'right' }}>Registered Date</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '1rem', fontWeight: '600' }}>{c.name}</td>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary-light)' }}>{c.slug}</td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <div>{c.email || 'N/A'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{c.phone || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <a href={`${currentDomain}/book/${c.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                          /book/{c.slug}
                        </a>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: c.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: c.isActive ? 'var(--success)' : 'var(--danger)', fontSize: '0.75rem', fontWeight: '700' }}>
                          {c.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                        {new Date(c.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => handleEditClick(c)}
                          style={{
                            background: 'rgba(6,182,212,0.15)',
                            border: '1px solid rgba(6,182,212,0.3)',
                            color: 'var(--accent)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            marginRight: '8px',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(6,182,212,0.25)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(6,182,212,0.15)';
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(c)}
                          style={{
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: 'var(--danger)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.25)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ONBOARD MODAL */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
            <div className="glass animate-in" style={{ padding: '2.5rem', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(30, 41, 59, 0.95)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Onboard Hospital Tenant</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>

              {formError && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  ⚠️ {formError}
                </div>
              )}

              <form onSubmit={handleOnboard} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Clinic Profile */}
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>🏥 Hospital Details</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Hospital/Clinic Name *</label>
                    <input
                      type="text"
                      required
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      placeholder="e.g. Apollo Specialities"
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>URL Slug *</label>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      placeholder="e.g. apollo-specialities"
                      className="premium-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Clinic Public Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="info@apollo.com"
                      className="premium-input"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Physical address"
                    className="premium-input"
                    rows={2}
                  />
                </div>

                {/* Administrator Profile */}
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--primary-light)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginTop: '0.75rem' }}>👤 Hospital Admin Credentials</h3>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Admin Owner Name *</label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Dr. Satish Kumar"
                    className="premium-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Admin Login Email *</label>
                    <input
                      type="email"
                      required
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="admin@apollo.com"
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Admin Password *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        required
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="Generate or enter password"
                        className="premium-input"
                        style={{ paddingRight: '6.5rem' }}
                      />
                      <button
                        type="button"
                        onClick={generatePassword}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formLoading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent), var(--primary))',
                    border: 'none',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: formLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 8px 24px rgba(6,182,212,0.3)',
                    marginTop: '1rem',
                  }}
                >
                  {formLoading ? 'Provisioning Tenant...' : '🚀 Onboard & Provision Credentials'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ONBOARD SUCCESS MODAL */}
        {onboardedClinic && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
            <div className="glass animate-in" style={{ padding: '3rem', maxWidth: '520px', width: '100%', textAlign: 'center', background: 'rgba(30, 41, 59, 0.98)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '2px solid rgba(16,185,129,0.3)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="check-draw">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--success)' }}>Hospital Provisioned!</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                The database credentials and URLs have been successfully created. Copy and send these details to the hospital administrator.
              </p>

              {/* Booking & Login Info */}
              <div style={{ background: 'var(--surface-2)', borderRadius: '8px', padding: '1.25rem', border: '1px solid var(--border)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', fontSize: '0.85rem' }}>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏥 Hospital Name</strong>
                  <span style={{ fontSize: '1rem', fontWeight: '700' }}>{onboardedClinic.name}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👤 Administrator Login Email</strong>
                  <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{onboardedClinic.ownerEmail}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔑 Initial Password</strong>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--warning)', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: '4px' }}>{onboardedClinic.ownerPassword}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔗 Public Patient Booking URL</strong>
                  <a href={`${currentDomain}/book/${onboardedClinic.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: '600' }}>
                    {currentDomain}/book/{onboardedClinic.slug}
                  </a>
                </div>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚙️ Staff Dashboard Login URL</strong>
                  <a href={`${currentDomain}/admin/login`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', textDecoration: 'underline', fontWeight: '600' }}>
                    {currentDomain}/admin/login
                  </a>
                </div>
              </div>

              <button
                onClick={() => setOnboardedClinic(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--accent), var(--primary))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Close & Return
              </button>
            </div>
          </div>
        )}

        {/* EDIT CLINIC MODAL */}
        {editingClinic && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
            <div className="glass animate-in" style={{ padding: '2.5rem', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(30, 41, 59, 0.95)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Edit Hospital Tenant</h2>
                <button onClick={() => setEditingClinic(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>

              {editError && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  ⚠️ {editError}
                </div>
              )}

              <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>🏥 Hospital Details</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Hospital/Clinic Name *</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Apollo Specialities"
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>URL Slug *</label>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="e.g. apollo-specialities"
                      className="premium-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Phone</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Clinic Public Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="info@apollo.com"
                      className="premium-input"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Address</label>
                  <textarea
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Physical address"
                    className="premium-input"
                    rows={2}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: '500' }}>Tenant Status</label>
                  <select
                    value={editIsActive ? 'active' : 'suspended'}
                    onChange={(e) => setEditIsActive(e.target.value === 'active')}
                    className="premium-input"
                    style={{ height: '45px' }}
                  >
                    <option value="active">Active (Onboarding Open & Booking Allowed)</option>
                    <option value="suspended">Suspended (All Bookings & Public URLs Blocked)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditingClinic(null)}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, var(--accent), var(--primary))',
                      border: 'none',
                      color: '#fff',
                      fontWeight: '700',
                      cursor: editLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 8px 24px rgba(6,182,212,0.3)',
                    }}
                  >
                    {editLoading ? 'Updating Tenant...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {deletingClinic && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
            <div className="glass animate-in" style={{ padding: '2.5rem', maxWidth: '480px', width: '100%', background: 'rgba(30, 41, 59, 0.98)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--danger)' }}>Confirm Deletion</h2>
                <button onClick={() => setDeletingClinic(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>

              {deleteError && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  ⚠️ {deleteError}
                </div>
              )}

              <p style={{ color: 'var(--text)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.6' }}>
                Are you sure you want to delete <strong>{deletingClinic.name}</strong>?
              </p>

              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '1rem', marginBottom: '2rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                <strong>⚠️ Warning:</strong> This operation is permanent and irreversible. It will delete all linked:
                <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li>Staff administrator & staff member accounts</li>
                  <li>Doctors profile & dynamic schedules/breaks</li>
                  <li>Patient bookings & appointments history</li>
                  <li>Payments transactions records</li>
                  <li>API integrations & configured webhooks</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setDeletingClinic(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleteLoading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--danger)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: deleteLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
                  }}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
