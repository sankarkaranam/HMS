'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Award,
  CheckCircle,
  MapPin,
  Building2,
  PhoneCall,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Activity,
  Info,
  FileText,
  Briefcase,
  Users
} from 'lucide-react';

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

        // Extract unique specializations list
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

  // Set default date to today
  useEffect(() => {
    const today = new Date();
    const formatted = today.toISOString().split('T')[0];
    setSelectedDate(formatted);
  }, []);

  // PhonePe redirect-back verification
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

        // Clean up query params
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        if (verifyData.status === 'success') {
          const aptRes = await fetch(`${API_URL}/appointments/${appointmentId}`);
          if (aptRes.ok) {
            const aptData = await aptRes.json();
            setSuccessApt({
              ...aptData,
              _fromPhonePe: true,
            });
          } else {
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

  // Generate next 7 days list
  const getNext7Days = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const val = d.toISOString().split('T')[0];
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.toLocaleDateString('en-US', { day: 'numeric' });
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      dates.push({ val, weekday, dayNum, month });
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

      // Create appointment in backend
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

      // Handle payment flow
      if (data.paymentRequired) {
        const orderRes = await fetch(`${API_URL}/payments/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: data.appointment.id }),
        });

        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          throw new Error(orderData.error || 'Failed to create payment order');
        }

        // PhonePe: redirect to hosted pay page
        if (orderData.gateway === 'phonepe') {
          if (!orderData.paymentUrl) {
            throw new Error('PhonePe did not return a payment URL. Please try again.');
          }
          window.location.href = orderData.paymentUrl;
          return;
        }

        // Razorpay: open inline checkout modal
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: '4px solid rgba(99,102,241,0.15)', borderTop: '4px solid var(--primary)', animation: 'spin 0.9s linear infinite', margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Verifying Transaction</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '320px', margin: '0 auto', lineHeight: '1.5' }}>Please wait while we confirm your payment details securely.</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)', gap: '1.5rem' }}>
        <div className="skeleton animate-pulse" style={{ width: '220px', height: '45px', borderRadius: '12px' }} />
        <div className="skeleton animate-pulse" style={{ width: '380px', height: '20px', borderRadius: '6px' }} />
        <div style={{ width: '100%', maxWidth: '800px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem', padding: '0 1rem' }}>
          <div className="skeleton" style={{ height: '300px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '300px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  if (error && !clinic) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', color: 'var(--text)', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="glass animate-in" style={{ padding: '3.5rem 2rem', maxWidth: '480px', margin: '0 auto', border: '1px solid rgba(239,68,68,0.2)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem', filter: 'drop-shadow(0 4px 12px rgba(239,68,68,0.3))' }}>⚠️</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.75rem', letterSpacing: '-0.5px' }}>Oops! Clinic Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '0.95rem', lineHeight: '1.6' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
              color: '#fff',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '999px',
              cursor: 'pointer',
              fontWeight: '600',
              boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.3)'; }}
          >
            Refresh Page <ArrowRight size={16} />
          </button>
        </div>
      </main>
    );
  }

  if (successApt) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', background: 'var(--surface)', color: 'var(--text)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        
        <div className="ticket-card animate-in" style={{ maxWidth: '480px', width: '100%', zIndex: 1 }}>
          <div className="ticket-punch-left" />
          <div className="ticket-punch-right" />

          {/* Ticket Header */}
          <div style={{ padding: '2.5rem 2rem 1.5rem', textAlign: 'center', borderBottom: '1px dashed var(--border)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: 'var(--success)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="check-draw">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.25rem', letterSpacing: '-0.5px' }}>Appointment Confirmed!</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Confirmation details sent to <strong style={{ color: 'var(--text)' }}>{successApt.patient?.email || successApt.patient?.phone}</strong>
            </p>
          </div>

          {/* Ticket Info Body */}
          <div style={{ padding: '1.75rem 2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Clinic</span>
                <span style={{ fontWeight: '600', color: 'var(--text)' }}>{clinic?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Reference ID</span>
                <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary-light)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  {successApt.id.split('-')[0].toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Practitioner</span>
                <span style={{ fontWeight: '600', color: 'var(--text)' }}>{successApt.doctor?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--text-muted)', paddingTop: '2px' }}>Date & Time</span>
                <span style={{ fontWeight: '600', color: 'var(--text)', textAlign: 'right', maxWidth: '200px' }}>
                  {new Date(successApt.appointmentDatetime).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Type</span>
                <span style={{ fontWeight: '600', color: 'var(--accent)', textTransform: 'capitalize' }}>
                  {successApt.consultationType === 'in_person' ? '🏢 In Clinic' : '💻 Teleconsult'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span style={{ color: 'var(--success)', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={14} /> Paid & Confirmed
                </span>
              </div>
            </div>
          </div>

          {/* Ticket Footer / Action Buttons */}
          <div style={{ padding: '1.5rem 2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.01)', borderTop: '1px dashed var(--border)' }}>
            <button
              onClick={() => {
                window.print();
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.95rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(99,102,241,0.2)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
            >
              Print Ticket Receipt
            </button>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setSuccessApt(null)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Book Another
              </button>
              <button
                onClick={() => router.push('/')}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: '3.5rem 1rem', background: 'var(--surface)', color: 'var(--text)', position: 'relative', overflowX: 'hidden' }}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* Modern gradient orbs */}
      <div style={{ position: 'absolute', top: '5%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', left: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '1080px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Header section with glassmorphism badge */}
        <header style={{ marginBottom: '3.5rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '100px', padding: '4px 12px', fontSize: '0.75rem', color: 'var(--primary-light)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
            <Sparkles size={12} /> Appointment Portal
          </div>
          <h1 className="gradient-text" style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: '800', marginBottom: '0.75rem', letterSpacing: '-1px', lineHeight: '1.2' }}>
            {clinic?.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={16} style={{ color: 'var(--accent)' }} /> {clinic?.address}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PhoneCall size={16} style={{ color: 'var(--accent)' }} /> {clinic?.phone}
            </span>
          </div>
        </header>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', padding: '1rem 1.25rem', borderRadius: '12px', marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.9rem', lineHeight: '1.4' }}>
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⚠️</span>
            <div>
              <strong style={{ display: 'block', marginBottom: '2px', fontWeight: '700' }}>Booking Issue</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Master layout grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2.5rem', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: Date & Doctor Setup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            
            {/* 1. Specialist and Doctor Selection */}
            <section className="glass glow-card" style={{ padding: '2.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '800', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
                  1
                </span>
                Choose Specialist & Doctor
              </h2>

              {/* Specialization selection chips */}
              {specializations.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Medical Department
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                            borderRadius: '999px',
                            background: isActive ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))' : 'var(--surface-2)',
                            border: isActive ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                            color: isActive ? '#fff' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.2)' : 'none',
                            transition: 'all 0.2s ease',
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
                            fontWeight: '700',
                          }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Doctor cards list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Available Practitioners
                </label>
                {doctors
                  .filter(d => (d.specialization || 'General') === selectedSpecialization)
                  .map((doc) => {
                    const isSelected = selectedDoctor?.id === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoctor(doc)}
                        style={{
                          padding: '1.25rem',
                          borderRadius: '12px',
                          background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--surface-2)',
                          border: isSelected ? '2px solid var(--primary)' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: isSelected ? '0 4px 20px rgba(99,102,241,0.1)' : 'none',
                          position: 'relative',
                        }}
                        onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.borderColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: isSelected ? 'linear-gradient(135deg, var(--primary), var(--accent))' : 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '1.1rem', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 10px rgba(0,0,0,0.15)' }}>
                            {doc.name.replace('Dr. ', '').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {doc.name}
                              {isSelected && <CheckCircle size={14} style={{ color: 'var(--primary-light)' }} />}
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <Briefcase size={12} /> {doc.specialization} • <Award size={12} /> {doc.qualifications}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: '800', background: 'rgba(6,182,212,0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                              {Number(doc.consultationFee) === 0 ? 'FREE' : `₹${doc.consultationFee}`}
                            </span>
                          </div>
                        </div>
                        {doc.bio && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', lineHeight: '1.4' }}>
                            {doc.bio}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* 2. Date and Time Slot Picker */}
            <section className="glass glow-card" style={{ padding: '2.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '800', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
                  2
                </span>
                Select Date & Time
              </h2>

              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Available Dates
              </label>
              
              {/* Premium Date Ribbon */}
              <div className="scrollbar-hide" style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.75rem' }}>
                {getNext7Days().map((d) => {
                  const isActive = selectedDate === d.val;
                  return (
                    <div
                      key={d.val}
                      onClick={() => setSelectedDate(d.val)}
                      className={`date-ribbon-item ${isActive ? 'active' : ''}`}
                    >
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.75, fontWeight: '700', letterSpacing: '0.5px' }}>
                        {d.weekday}
                      </span>
                      <span style={{ fontSize: '1.4rem', fontWeight: '800', margin: '2px 0 1px' }}>
                        {d.dayNum}
                      </span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>
                        {d.month}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Time Slots Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Available Time Slots
                </label>

                {loadingSlots ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '0.6rem' }}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="skeleton" style={{ height: '42px' }} />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <Info size={16} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-muted)' }} />
                    No slots scheduled for this date.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.6rem' }}>
                    {slots.map((slot) => {
                      const timeString = new Date(slot.datetime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                      const isSelected = selectedSlot === slot.datetime;
                      return (
                        <button
                          key={slot.datetime}
                          type="button"
                          disabled={!slot.isAvailable}
                          onClick={() => setSelectedSlot(slot.datetime)}
                          style={{
                            padding: '0.75rem 0.5rem',
                            borderRadius: '8px',
                            background: isSelected 
                              ? 'linear-gradient(135deg, var(--accent), #0891b2)' 
                              : slot.isAvailable 
                                ? 'var(--surface-3)' 
                                : 'rgba(255,255,255,0.01)',
                            border: isSelected 
                              ? '1px solid var(--accent)' 
                              : '1px solid var(--border)',
                            color: !slot.isAvailable 
                              ? 'rgba(255,255,255,0.12)' 
                              : '#fff',
                            cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            textAlign: 'center',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 4px 10px rgba(6,182,212,0.2)' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (slot.isAvailable && !isSelected) {
                              e.currentTarget.style.borderColor = 'var(--accent)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (slot.isAvailable && !isSelected) {
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }
                          }}
                        >
                          {timeString}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Patient Form & Booking summary */}
          <section className="glass glow-card" style={{ padding: '2.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '800', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
                3
              </span>
              Patient Registration
            </h2>

            <form onSubmit={handleBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Patient Name input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Full Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Patient's legal name"
                    className="premium-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              {/* WhatsApp Phone input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Phone Number (WhatsApp) *
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="premium-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              {/* Email input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="For appointment receipts & updates"
                    className="premium-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              {/* Age and Gender row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Age
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Years"
                    className="premium-input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="premium-input"
                    style={{ height: '45px', appearance: 'none', background: 'rgba(30, 41, 59, 0.7) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E") no-repeat right 12px center / 16px' }}
                  >
                    <option value="" style={{ background: 'var(--surface-2)' }}>Select</option>
                    <option value="male" style={{ background: 'var(--surface-2)' }}>Male</option>
                    <option value="female" style={{ background: 'var(--surface-2)' }}>Female</option>
                    <option value="other" style={{ background: 'var(--surface-2)' }}>Other</option>
                  </select>
                </div>
              </div>

              {/* Consultation type pills */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem', fontWeight: '600' }}>
                  Consultation Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setConsultationType('in_person')}
                    style={{
                      padding: '0.8rem',
                      borderRadius: '8px',
                      background: consultationType === 'in_person' ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)',
                      border: consultationType === 'in_person' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      color: consultationType === 'in_person' ? '#fff' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Building2 size={16} /> In Clinic
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsultationType('teleconsult')}
                    style={{
                      padding: '0.8rem',
                      borderRadius: '8px',
                      background: consultationType === 'teleconsult' ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)',
                      border: consultationType === 'teleconsult' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      color: consultationType === 'teleconsult' ? '#fff' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Activity size={16} /> Teleconsult
                  </button>
                </div>
              </div>

              {/* Symptoms / Notes input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Symptoms / Medical Notes
                </label>
                <div style={{ position: 'relative' }}>
                  <FileText size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Briefly describe your symptoms or share past medical records..."
                    rows={3}
                    className="premium-input"
                    style={{ paddingLeft: '2.5rem', resize: 'none' }}
                  />
                </div>
              </div>

              {/* Order sheet Summary */}
              {selectedDoctor && selectedSlot && (
                <div className="animate-in" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} /> Schedule
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--text)' }}>
                      {new Date(selectedSlot).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} /> Mode
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--accent)' }}>
                      {consultationType === 'in_person' ? '🏢 In Clinic' : '💻 Telehealth'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                    <span style={{ fontWeight: '700', color: 'var(--text)' }}>Total Fees Due</span>
                    <span style={{ fontWeight: '800', color: 'var(--success)', fontSize: '1.1rem' }}>
                      {Number(selectedDoctor.consultationFee) === 0 ? 'FREE' : `₹${selectedDoctor.consultationFee}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={bookingLoading || !selectedSlot}
                style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '1rem',
                  cursor: selectedSlot && !bookingLoading ? 'pointer' : 'not-allowed',
                  opacity: selectedSlot && !bookingLoading ? 1 : 0.4,
                  boxShadow: selectedSlot && !bookingLoading ? '0 8px 24px rgba(99,102,241,0.35)' : 'none',
                  transition: 'all 0.25s ease',
                  marginTop: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  if (selectedSlot && !bookingLoading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.45)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSlot && !bookingLoading) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.35)';
                  }
                }}
              >
                {bookingLoading ? (
                  <>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
                    <span>Processing Booking...</span>
                  </>
                ) : selectedSlot ? (
                  Number(selectedDoctor?.consultationFee) === 0 ? (
                    'Confirm Appointment (Free)'
                  ) : (
                    `Pay & Confirm Appointment (₹${selectedDoctor?.consultationFee})`
                  )
                ) : (
                  'Select a Time Slot to Book'
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
