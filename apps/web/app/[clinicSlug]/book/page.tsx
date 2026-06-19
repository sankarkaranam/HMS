'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  qualifications: string;
  profileImageUrl: string | null;
  consultationFee: number;
  bio: string | null;
}

interface Clinic {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  paymentGateway: string;
}

interface Slot {
  datetime: string;
  isAvailable: boolean;
  reason?: string;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicSlug = params?.clinicSlug as string;

  // State
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  
  // Specializations filter state
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>('');

  // Patient details form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [notes, setNotes] = useState('');
  const [consultationType, setConsultationType] = useState<'in_person' | 'teleconsult'>('in_person');

  // UI States
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successApt, setSuccessApt] = useState<any | null>(null);

  // Helper for specialization changes
  const handleSpecializationChange = (spec: string, allDocs: Doctor[]) => {
    setSelectedSpecialization(spec);
    const filtered = allDocs.filter(d => (d.specialization || 'General') === spec);
    if (filtered.length > 0) {
      setSelectedDoctor(filtered[0]);
    } else {
      setSelectedDoctor(null);
    }
  };

  // Load clinic and doctors
  useEffect(() => {
    if (!clinicSlug) return;

    const fetchClinicData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/clinics/public/slug/${clinicSlug}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Clinic not found. Please check the URL.');
          }
          throw new Error('Failed to load clinic details.');
        }
        const data = await res.json();
        setClinic(data.clinic);
        setDoctors(data.doctors);

        // Extract unique specializations list (safely defaulting null to 'General')
        const specs = Array.from(
          new Set(data.doctors.map((d: Doctor) => d.specialization || 'General'))
        ) as string[];
        setSpecializations(specs);

        if (specs.length > 0) {
          setSelectedSpecialization(specs[0]);
          const firstSpecDocs = data.doctors.filter(
            (d: Doctor) => (d.specialization || 'General') === specs[0]
          );
          if (firstSpecDocs.length > 0) {
            setSelectedDoctor(firstSpecDocs[0]);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchClinicData();
  }, [clinicSlug]);

  // Set default date to today or tomorrow
  useEffect(() => {
    const today = new Date();
    const formatted = today.toISOString().split('T')[0];
    setSelectedDate(formatted);
  }, []);

  // ── PhonePe redirect-back verification ──────────────────────────────────────
  // After the user completes/cancels payment on PhonePe's hosted page, they are
  // redirected back to this page with ?phonepe_verify=1&appointmentId=...&txnId=...
  useEffect(() => {
    const phonePeFlag = searchParams?.get('phonepe_verify');
    const appointmentId = searchParams?.get('appointmentId');
    const txnId = searchParams?.get('txnId');

    if (phonePeFlag !== '1' || !appointmentId || !txnId) return;

    const verify = async () => {
      try {
        setVerifyingPayment(true);
        const verifyRes = await fetch(`${API_URL}/payments/verify-phonepe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId, txnId }),
        });
        const verifyData = await verifyRes.json();

        // Clean up query params regardless of result
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        if (verifyData.status === 'success') {
          // Fetch full appointment details to populate success screen and prevent runtime crash
          const aptRes = await fetch(`${API_URL}/appointments/${appointmentId}`);
          if (aptRes.ok) {
            const aptData = await aptRes.json();
            setSuccessApt({
              ...aptData,
              _fromPhonePe: true,
            });
          } else {
            // Graceful fallback using current selections
            setSuccessApt({
              id: appointmentId,
              status: 'confirmed',
              _fromPhonePe: true,
              patient: { name, phone, email },
              doctor: { name: selectedDoctor?.name || 'Doctor' },
              appointmentDatetime: selectedSlot || new Date().toISOString(),
            });
          }
        } else if (verifyData.status === 'pending') {
          setError('Payment is still processing. Please wait a moment and refresh or contact support.');
        } else {
          setError(verifyData.message || 'Payment failed. Please try booking again.');
        }
      } catch (err: any) {
        setError('Could not verify payment. Please contact support.');
      } finally {
        setVerifyingPayment(false);
      }
    };

    verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch slots when doctor or date changes
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;

    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        const res = await fetch(
          `${API_URL}/doctors/${selectedDoctor.id}/availability?date=${selectedDate}`
        );
        if (!res.ok) {
          throw new Error('Failed to fetch slots');
        }
        const data = await res.json();
        setSlots(data.slots || []);
        setSelectedSlot('');
      } catch (err) {
        console.error(err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDoctor, selectedDate]);

  // Generate next 7 days list for date select
  const getNext7Days = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const val = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      dates.push({ val, label });
    }
    return dates;
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !selectedDoctor || !selectedSlot) {
      setError('Please fill in all details and select a slot.');
      return;
    }

    try {
      setBookingLoading(true);
      setError(null);

      // 1. Create appointment in backend
      const bookingPayload = {
        doctorId: selectedDoctor.id,
        appointmentDatetime: selectedSlot,
        consultationType,
        notes: notes || undefined,
        patient: {
          name,
          phone,
          email: email || undefined,
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
        },
      };

      const res = await fetch(`${API_URL}/clinics/${clinic.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Booking failed');
      }

      // 2. Handle payment flow
      if (data.paymentRequired) {
        // Create payment order
        const orderRes = await fetch(`${API_URL}/payments/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: data.appointment.id }),
        });

        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          throw new Error(orderData.error || 'Failed to create payment order');
        }

        // ── PhonePe: redirect to hosted pay page ─────────────────────────────
        if (orderData.gateway === 'phonepe') {
          if (!orderData.paymentUrl) {
            throw new Error('PhonePe did not return a payment URL. Please try again.');
          }
          // Redirect immediately — PhonePe will send user back with query params
          window.location.href = orderData.paymentUrl;
          return; // stop further execution
        }

        // ── Razorpay: open inline checkout modal ─────────────────────────────
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: clinic.name,
          description: `Consultation with ${selectedDoctor.name}`,
          order_id: orderData.orderId,
          prefill: orderData.prefill,
          handler: async function (response: any) {
            try {
              setBookingLoading(true);
              const verifyRes = await fetch(`${API_URL}/payments/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  appointmentId: data.appointment.id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              });

              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                throw new Error(verifyData.error || 'Payment verification failed');
              }

              // Payment Success!
              setSuccessApt({
                ...data.appointment,
                doctor: selectedDoctor,
                patient: data.patient,
                status: 'confirmed',
              });
            } catch (err: any) {
              setError(err.message || 'Payment verification failed. Please contact support.');
            } finally {
              setBookingLoading(false);
            }
          },
          theme: { color: '#6366f1' },
          modal: {
            ondismiss: function () {
              setError('Payment cancelled. Please try booking again.');
              setBookingLoading(false);
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // Free consultation confirmed immediately
        setSuccessApt({
          ...data.appointment,
          doctor: selectedDoctor,
          patient: data.patient,
          status: 'confirmed',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to book appointment');
    } finally {
      setBookingLoading(false);
    }
  };

  if (verifyingPayment) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)', textAlign: 'center' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: '4px solid rgba(99,102,241,0.15)', borderTop: '4px solid var(--primary)', animation: 'spin 0.9s linear infinite', margin: '0 auto 1.5rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.5rem' }}>Verifying Payment…</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please wait while we confirm your payment with PhonePe.</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)' }}>
        <div className="skeleton" style={{ width: '150px', height: '40px', marginBottom: '1.5rem' }} />
        <div className="skeleton" style={{ width: '300px', height: '20px' }} />
      </div>
    );
  }

  if (error && !clinic) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', color: 'var(--text)', textAlign: 'center' }}>
        <div className="glass" style={{ padding: '3rem', maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>Error Loading Clinic</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ display: 'inline-flex', background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Try Again
          </button>
        </div>
      </main>
    );
  }

  if (successApt) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', color: 'var(--text)', position: 'relative' }}>
        {/* Background gradient blur */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        
        <div className="glass animate-in" style={{ padding: '3rem', maxWidth: '540px', width: '100%', textAlign: 'center', zIndex: 1 }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2.5rem', color: 'var(--success)' }}>
            ✓
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem' }}>Booking Confirmed!</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            A confirmation email has been sent to {successApt.patient.email || 'your registered address'}.
          </p>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', textAlign: 'left', marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Appointment ID</span>
              <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{successApt.id.split('-')[0].toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Doctor</span>
              <span style={{ fontWeight: '600' }}>{successApt.doctor.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date & Time</span>
              <span style={{ fontWeight: '600' }}>{new Date(successApt.appointmentDatetime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status</span>
              <span style={{ color: 'var(--success)', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.9rem' }}>{successApt.status}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={() => setSuccessApt(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
              Book Another
            </button>
            <button onClick={() => router.push('/')} style={{ flex: 1, background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
              Back to Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: '3rem 1.5rem', background: 'var(--surface)', color: 'var(--text)', position: 'relative' }}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* Decorative Orbs */}
      <div style={{ position: 'absolute', top: '5%', right: '5%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '5%', left: '5%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem' }}>{clinic?.name}</h1>
          <p style={{ color: 'var(--text-muted)' }}>📍 {clinic?.address} | 📞 {clinic?.phone}</p>
        </header>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span style={{ fontSize: '0.95rem' }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Step 1 & 2: Doctor and Slot Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Doctor & Specialization Select */}
            <div className="glass" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>1</span>
                Select a Doctor
              </h2>

              {/* Specialization selector */}
              {specializations.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Choose Specialization
                  </label>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {specializations.map((spec) => {
                      const count = doctors.filter(d => (d.specialization || 'General') === spec).length;
                      const isActive = selectedSpecialization === spec;
                      return (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => handleSpecializationChange(spec, doctors)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '100px',
                            background: isActive ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))' : 'var(--surface-2)',
                            border: isActive ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                            color: isActive ? '#fff' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.2)' : 'none',
                            transition: 'all 0.15s',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>{spec}</span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--surface-3)',
                            color: isActive ? '#fff' : 'var(--text-muted)',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            fontSize: '0.7rem',
                          }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Doctors List under chosen Specialization */}
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Doctors Available ({doctors.filter(d => (d.specialization || 'General') === selectedSpecialization).length})
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {doctors
                    .filter(d => (d.specialization || 'General') === selectedSpecialization)
                    .map((doc) => (
                      <div 
                        key={doc.id} 
                        onClick={() => setSelectedDoctor(doc)}
                        style={{
                          padding: '1rem',
                          borderRadius: 'var(--radius-sm)',
                          background: selectedDoctor?.id === doc.id ? 'rgba(99,102,241,0.08)' : 'var(--surface-2)',
                          border: selectedDoctor?.id === doc.id ? '2px solid var(--primary)' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '1.1rem' }}>
                            {doc.name.replace('Dr. ', '').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>{doc.name}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{doc.specialization} • {doc.qualifications}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: '700' }}>
                              {Number(doc.consultationFee) === 0 ? 'FREE' : `₹${doc.consultationFee}`}
                            </span>
                          </div>
                        </div>
                        {doc.bio && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                            {doc.bio}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Date Select */}
            <div className="glass" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>2</span>
                Select Date & Time
              </h2>

              {/* Date slider */}
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                {getNext7Days().map((d) => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => setSelectedDate(d.val)}
                    style={{
                      flex: '0 0 auto',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      background: selectedDate === d.val ? 'var(--primary)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: selectedDate === d.val ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Slots Grid */}
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: '600' }}>Available Slots</h3>
                
                {loadingSlots ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.75rem' }}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="skeleton" style={{ height: '40px' }} />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                    🚫 No slots available for this date.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.75rem' }}>
                    {slots.map((slot) => {
                      const timeString = new Date(slot.datetime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                      return (
                        <button
                          key={slot.datetime}
                          type="button"
                          disabled={!slot.isAvailable}
                          onClick={() => setSelectedSlot(slot.datetime)}
                          style={{
                            padding: '0.75rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            background: selectedSlot === slot.datetime 
                              ? 'var(--accent)' 
                              : slot.isAvailable 
                                ? 'var(--surface-3)' 
                                : 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border)',
                            color: !slot.isAvailable 
                              ? 'rgba(255,255,255,0.15)' 
                              : selectedSlot === slot.datetime 
                                ? '#fff' 
                                : 'var(--text)',
                            cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            textAlign: 'center',
                            textDecoration: !slot.isAvailable ? 'line-through' : 'none',
                            transition: 'all 0.2s',
                          }}
                        >
                          {timeString}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Patient Form */}
          <div className="glass" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>3</span>
              Patient Information
            </h2>

            <form onSubmit={handleBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Patient Name *</label>
                <input 
                  type="text" 
                  required 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Full name"
                  style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', transition: 'border-color 0.2s' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Phone Number (WhatsApp) *</label>
                <input 
                  type="tel" 
                  required 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="e.g. +919876543210"
                  style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Email Address</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="for appointment updates"
                  style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Age</label>
                  <input 
                    type="number" 
                    value={age} 
                    onChange={(e) => setAge(e.target.value)} 
                    placeholder="Age"
                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Gender</label>
                  <select 
                    value={gender} 
                    onChange={(e) => setGender(e.target.value as any)} 
                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', height: '47px' }}
                  >
                    <option value="" style={{ background: 'var(--surface-2)' }}>Select</option>
                    <option value="male" style={{ background: 'var(--surface-2)' }}>Male</option>
                    <option value="female" style={{ background: 'var(--surface-2)' }}>Female</option>
                    <option value="other" style={{ background: 'var(--surface-2)' }}>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Consultation Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setConsultationType('in_person')}
                    style={{
                      padding: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      background: consultationType === 'in_person' ? 'rgba(6,182,212,0.15)' : 'var(--surface-2)',
                      border: consultationType === 'in_person' ? '1px solid var(--accent)' : '1px solid var(--border)',
                      color: consultationType === 'in_person' ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    🏢 In Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsultationType('teleconsult')}
                    style={{
                      padding: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      background: consultationType === 'teleconsult' ? 'rgba(6,182,212,0.15)' : 'var(--surface-2)',
                      border: consultationType === 'teleconsult' ? '1px solid var(--accent)' : '1px solid var(--border)',
                      color: consultationType === 'teleconsult' ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    💻 Teleconsult
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Symptoms / Notes</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="Describe your symptoms or add notes for the doctor..."
                  rows={3}
                  style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', resize: 'none' }}
                />
              </div>

              {selectedDoctor && selectedSlot && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Slot</span>
                    <span>{new Date(selectedSlot).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Consultation Fee</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent)' }}>
                      {Number(selectedDoctor.consultationFee) === 0 ? 'FREE' : `₹${selectedDoctor.consultationFee}`}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={bookingLoading || !selectedSlot}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '1rem',
                  cursor: selectedSlot && !bookingLoading ? 'pointer' : 'not-allowed',
                  opacity: selectedSlot && !bookingLoading ? 1 : 0.5,
                  boxShadow: selectedSlot && !bookingLoading ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
                  transition: 'all 0.2s',
                  marginTop: '0.5rem',
                }}
              >
                {bookingLoading 
                  ? 'Processing Booking...' 
                  : selectedSlot 
                    ? Number(selectedDoctor?.consultationFee) === 0 
                      ? 'Confirm Appointment (Free)'
                      : `Pay & Confirm (₹${selectedDoctor?.consultationFee})`
                    : 'Select a time slot first'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
