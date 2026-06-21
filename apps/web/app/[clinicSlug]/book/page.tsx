'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import {
  Calendar, Clock, User, Phone, Mail, Award, CheckCircle,
  MapPin, Building2, PhoneCall, ShieldCheck, ArrowRight,
  Sparkles, Activity, Info, FileText, Briefcase,
  ChevronRight, Star, Zap
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
  status?: string;
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
  time?: string;
  reason?: string;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicSlug = params?.clinicSlug as string;

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const [specializations, setSpecializations] = useState<string[]>([]);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [notes, setNotes] = useState('');
  const [consultationType, setConsultationType] = useState<'in_person' | 'teleconsult'>('in_person');

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successApt, setSuccessApt] = useState<any | null>(null);

  const handleSpecializationChange = (spec: string, allDocs: Doctor[]) => {
    setSelectedSpecialization(spec);
    setSelectedDoctor(null);
    setSelectedSlot('');
    setSlots([]);
    const filtered = allDocs.filter(d => (d.specialization || 'General') === spec);
    if (filtered.length > 0) setSelectedDoctor(filtered[0]);
  };

  const getNext7Days = () => {
    const days: { val: string; weekday: string; dayNum: string; month: string; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      days.push({
        val: d.toISOString().split('T')[0],
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: String(d.getDate()),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        isToday: i === 0,
      });
    }
    return days;
  };

  // Load clinic and doctors
  useEffect(() => {
    if (!clinicSlug) return;
    const fetchClinicData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/clinics/public/slug/${clinicSlug}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'Clinic not found.' : 'Failed to load clinic.');
        const data = await res.json();
        setClinic(data.clinic);
        setDoctors(data.doctors);
        const specs = Array.from(new Set(data.doctors.map((d: Doctor) => d.specialization || 'General'))) as string[];
        setSpecializations(specs);
        if (specs.length > 0) {
          setSelectedSpecialization(specs[0]);
          const firstDocs = data.doctors.filter((d: Doctor) => (d.specialization || 'General') === specs[0]);
          if (firstDocs.length > 0) setSelectedDoctor(firstDocs[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };
    fetchClinicData();
  }, [clinicSlug]);

  // Set default date
  useEffect(() => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
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
        window.history.replaceState({}, '', window.location.pathname);
        if (verifyData.status === 'success') {
          const aptRes = await fetch(`${API_URL}/appointments/${appointmentId}`);
          setSuccessApt(aptRes.ok ? { ...(await aptRes.json()), _fromPhonePe: true } : { id: appointmentId, status: 'confirmed', _fromPhonePe: true, patient: { name, phone, email }, doctor: { name: selectedDoctor?.name || 'Doctor' }, appointmentDatetime: selectedSlot || new Date().toISOString() });
        } else {
          setError(verifyData.message || 'Payment failed. Please try booking again.');
        }
      } catch {
        setError('Could not verify payment. Please contact support.');
      } finally {
        setVerifyingPayment(false);
      }
    };
    verify();
  }, []);

  // Fetch slots
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;
    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot('');
        const res = await fetch(`${API_URL}/doctors/${selectedDoctor.id}/availability?date=${selectedDate}`);
        if (!res.ok) throw new Error('Failed to load slots');
        const data = await res.json();
        setSlots(data.slots || []);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [selectedDoctor, selectedDate]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !selectedDoctor || !selectedSlot) {
      setError('Please select a doctor, date, and time slot.');
      return;
    }
    try {
      setBookingLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/clinics/${clinic.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          appointmentDatetime: selectedSlot,
          consultationType,
          notes: notes || undefined,
          patient: { name, phone, email: email || undefined, age: age ? Number(age) : undefined, gender: gender || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (data.paymentRequired) {
        const orderRes = await fetch(`${API_URL}/payments/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: data.appointment.id }),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create payment order');

        if (orderData.gateway === 'phonepe') {
          if (!orderData.paymentUrl) throw new Error('PhonePe did not return a payment URL.');
          window.location.href = orderData.paymentUrl;
          return;
        }

        // Razorpay
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: clinic.name,
          description: `Consultation with ${selectedDoctor.name}`,
          order_id: orderData.orderId,
          prefill: orderData.prefill,
          handler: async (response: any) => {
            try {
              setBookingLoading(true);
              const verifyRes = await fetch(`${API_URL}/payments/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointmentId: data.appointment.id, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');
              setSuccessApt({ ...data.appointment, doctor: selectedDoctor, patient: data.patient, status: 'confirmed' });
            } catch (err: any) {
              setError(err.message || 'Payment verification failed.');
            } finally {
              setBookingLoading(false);
            }
          },
          theme: { color: '#6366f1' },
          modal: { ondismiss: () => { setError('Payment cancelled.'); setBookingLoading(false); } },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        setSuccessApt({ ...data.appointment, doctor: selectedDoctor, patient: data.patient, status: 'confirmed' });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to book appointment');
    } finally {
      setBookingLoading(false);
    }
  };

  const isFreeBooking = Number(selectedDoctor?.consultationFee) === 0 || clinic?.paymentGateway === 'free';

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (verifyingPayment) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid rgba(99,102,241,0.15)', borderTop: '3px solid var(--primary)', animation: 'spin 0.9s linear infinite', margin: '0 auto 2rem' }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Verifying Payment</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Please wait while we confirm your transaction…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', padding: '2rem 1rem', background: 'var(--surface)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="skeleton" style={{ width: '240px', height: '40px', marginBottom: '1rem', marginTop: '2rem', marginLeft: 'auto', marginRight: 'auto' }} />
          <div className="skeleton" style={{ width: '380px', height: '20px', marginBottom: '3rem', marginLeft: 'auto', marginRight: 'auto' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div className="skeleton" style={{ height: '400px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '400px', borderRadius: '16px' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error && !clinic) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--surface)', textAlign: 'center' }}>
        <div className="glass animate-in-scale" style={{ padding: '3rem 2.5rem', maxWidth: '440px', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🏥</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.75rem' }}>Clinic Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '99px', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            Try Again <ArrowRight size={16} />
          </button>
        </div>
      </main>
    );
  }

  // ─── SUCCESS ────────────────────────────────────────────────────────────────
  if (successApt) {
    const aptTime = new Date(successApt.appointmentDatetime);
    const refId = successApt.id?.split('-')[0]?.toUpperCase() || '------';
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        {/* bg glow */}
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)', pointerEvents: 'none', animation: 'glow-pulse 3s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '20%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="ticket-card animate-in-scale" style={{ maxWidth: '460px', width: '100%', zIndex: 1 }}>
          <div className="ticket-punch-left" />
          <div className="ticket-punch-right" />

          {/* Header */}
          <div style={{ padding: '2.5rem 2rem 2rem', textAlign: 'center', borderBottom: '1px dashed rgba(255,255,255,0.08)' }}>
            {/* success ring */}
            <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 1.5rem' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(16,185,129,0.3)', animation: 'ping 2s ease-out infinite' }} />
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', position: 'relative', zIndex: 1 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-draw">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: '900', marginBottom: '0.35rem', letterSpacing: '-0.5px' }}>Appointment Confirmed!</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
              {successApt.patient?.email ? <>Confirmation sent to <strong style={{ color: 'var(--text)' }}>{successApt.patient.email}</strong></> : <>Booking ID: <span style={{ fontFamily: 'monospace', color: 'var(--primary-light)', fontWeight: '700' }}>{refId}</span></>}
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: '1.75rem 2rem' }}>
            {[
              { label: 'Clinic', value: clinic?.name },
              { label: 'Doctor', value: successApt.doctor?.name || 'Doctor' },
              { label: 'Date', value: aptTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
              { label: 'Time', value: aptTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
              { label: 'Type', value: successApt.consultationType === 'in_person' ? '🏥 In Clinic' : '💻 Teleconsult' },
              { label: 'Ref ID', value: refId, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{label}</span>
                <span style={{ fontWeight: '600', fontSize: '0.88rem', color: mono ? 'var(--primary-light)' : 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit', background: mono ? 'rgba(99,102,241,0.1)' : 'transparent', padding: mono ? '2px 8px' : '0', borderRadius: mono ? '4px' : '0' }}>
                  {value}
                </span>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0 0', marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</span>
              <span className="status-badge confirmed">
                <ShieldCheck size={11} /> Confirmed
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '1.25rem 2rem 2.25rem', borderTop: '1px dashed rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              onClick={() => window.print()}
              style={{ width: '100%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', border: 'none', padding: '13px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 6px 20px rgba(99,102,241,0.3)', transition: 'all 0.2s', fontFamily: 'Inter, inherit' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              🖨️ Print Ticket
            </button>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button onClick={() => setSuccessApt(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', transition: 'all 0.2s', fontFamily: 'Inter, inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Book Another
              </button>
              <button onClick={() => router.push('/')} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', transition: 'all 0.2s', fontFamily: 'Inter, inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
        <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.7; } 80%, 100% { transform: scale(2); opacity: 0; } }`}</style>
      </main>
    );
  }

  // ─── MAIN BOOKING UI ────────────────────────────────────────────────────────
  const filteredDoctors = doctors.filter(d => (d.specialization || 'General') === selectedSpecialization);
  const availableSlots = slots.filter(s => s.isAvailable);
  const totalSlots = slots.length;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface)', color: 'var(--text)', position: 'relative', overflowX: 'hidden' }}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* Background decorations */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '550px', height: '550px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', left: '-5%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '1px', height: '100vh', background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.04), transparent)' }} />
      </div>

      <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 1rem 4rem', position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <header className="animate-in" style={{ padding: '3rem 0 2.5rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '100px', padding: '5px 14px', fontSize: '0.72rem', color: 'var(--primary-light)', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: '700' }}>
            <Sparkles size={11} /> Smart Appointment Portal
          </div>

          <h1 className="gradient-text" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: '900', letterSpacing: '-1.5px', lineHeight: '1.15', marginBottom: '1rem' }}>
            {clinic?.name}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.75rem', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {clinic?.address && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <MapPin size={14} style={{ color: 'var(--accent)' }} />
                {clinic.address}
              </span>
            )}
            {clinic?.phone && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <PhoneCall size={14} style={{ color: 'var(--accent)' }} />
                {clinic.phone}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={14} style={{ color: 'var(--warning)' }} />
              {availableSlots.length} slots available today
            </span>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="animate-in" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fca5a5', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.875rem' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
            <div>
              <strong style={{ display: 'block', marginBottom: '2px', color: '#f87171' }}>Booking Error</strong>
              {error}
            </div>
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* ── MAIN GRID ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem', alignItems: 'start' }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* STEP 1: Doctor Selection */}
            <section className="glass glow-card animate-in" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', boxShadow: '0 4px 12px rgba(99,102,241,0.35)', flexShrink: 0 }}>1</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.4px' }}>Select Doctor</h2>
              </div>

              {/* Specialization Pills */}
              {specializations.length > 1 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: '0.6rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Department</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {specializations.map(spec => {
                      const count = doctors.filter(d => (d.specialization || 'General') === spec).length;
                      const isActive = selectedSpecialization === spec;
                      return (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => handleSpecializationChange(spec, doctors)}
                          style={{ padding: '0.45rem 0.9rem', borderRadius: '99px', background: isActive ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))' : 'var(--surface-3)', border: isActive ? 'none' : '1px solid rgba(255,255,255,0.07)', color: isActive ? '#fff' : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.25)' : 'none', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter, inherit' }}
                        >
                          {spec}
                          <span style={{ background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--surface-4)', padding: '1px 6px', borderRadius: '99px', fontSize: '0.68rem', fontWeight: '700' }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Doctor Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredDoctors.map((doc) => {
                  const isSelected = selectedDoctor?.id === doc.id;
                  const initials = doc.name.replace('Dr. ', '').slice(0, 2).toUpperCase();
                  const isFree = Number(doc.consultationFee) === 0;
                  return (
                    <div
                      key={doc.id}
                      className={`doctor-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => { setSelectedDoctor(doc); setSelectedSlot(''); }}
                    >
                      <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: isSelected ? 'linear-gradient(135deg, var(--primary), var(--accent))' : 'var(--surface-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '1rem', flexShrink: 0, boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.3)' : 'none', transition: 'all 0.2s' }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</h3>
                            {isSelected && <CheckCircle size={13} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />}
                          </div>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Briefcase size={11} style={{ flexShrink: 0 }} /> {doc.specialization}
                            {doc.qualifications && <> · <Award size={11} style={{ flexShrink: 0 }} /> {doc.qualifications}</>}
                          </p>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span style={{ fontSize: '0.82rem', color: isFree ? 'var(--success)' : 'var(--accent)', fontWeight: '800', background: isFree ? 'rgba(16,185,129,0.1)' : 'rgba(6,182,212,0.1)', padding: '3px 8px', borderRadius: '6px', display: 'block' }}>
                            {isFree ? 'FREE' : `₹${doc.consultationFee}`}
                          </span>
                        </div>
                      </div>
                      {doc.bio && (
                        <p style={{ fontSize: '0.77rem', color: 'var(--text-subtle)', marginTop: '0.7rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.04)', lineHeight: '1.5', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {doc.bio}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* STEP 2: Date & Time */}
            <section className="glass glow-card animate-in-delay" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', boxShadow: '0 4px 12px rgba(99,102,241,0.35)', flexShrink: 0 }}>2</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.4px' }}>Pick Date & Time</h2>
              </div>

              {/* Date Ribbon */}
              <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Available Dates</p>
              <div className="scrollbar-hide" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '4px', marginBottom: '1.75rem' }}>
                {getNext7Days().map((d) => {
                  const isActive = selectedDate === d.val;
                  return (
                    <div
                      key={d.val}
                      onClick={() => setSelectedDate(d.val)}
                      className={`date-ribbon-item ${isActive ? 'active' : ''}`}
                    >
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', opacity: isActive ? 0.85 : 0.6, marginBottom: '1px' }}>{d.weekday}</span>
                      <span style={{ fontSize: '1.5rem', fontWeight: '900', letterSpacing: '-1px', lineHeight: 1 }}>{d.dayNum}</span>
                      <span style={{ fontSize: '0.65rem', opacity: 0.65, marginTop: '2px', fontWeight: '600' }}>{d.month}</span>
                      {d.isToday && <span style={{ fontSize: '0.6rem', background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.15)', color: isActive ? '#fff' : 'var(--primary-light)', borderRadius: '99px', padding: '1px 5px', marginTop: '3px', fontWeight: '700' }}>TODAY</span>}
                    </div>
                  );
                })}
              </div>

              {/* Time Slots */}
              <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Time Slots
                {!loadingSlots && slots.length > 0 && (
                  <span style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: '99px', padding: '2px 8px', fontSize: '0.68rem', fontWeight: '700' }}>{availableSlots.length} available</span>
                )}
              </p>

              {loadingSlots ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.5rem' }}>
                  {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton" style={{ height: '42px', borderRadius: '6px' }} />)}
                </div>
              ) : slots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 'var(--radius-sm)' }}>
                  <Info size={18} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-subtle)' }} />
                  <p style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>No slots scheduled for this date.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>Try selecting another date.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.5rem' }}>
                  {slots.map((slot) => {
                    const timeStr = slot.time || new Date(slot.datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    const isSelected = selectedSlot === slot.datetime;
                    const isAvailable = slot.isAvailable;
                    return (
                      <button
                        key={slot.datetime}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedSlot(slot.datetime)}
                        className={`slot-btn ${isSelected ? 'selected' : isAvailable ? 'available' : 'booked'}`}
                        title={!isAvailable ? 'Already booked' : timeStr}
                      >
                        {timeStr}
                        {!isAvailable && <span style={{ display: 'block', fontSize: '0.6rem', opacity: 0.5, marginTop: '1px' }}>Booked</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ── RIGHT COLUMN: PATIENT FORM ───────────────────────────────────── */}
          <section className="glass glow-card animate-in-delay-2" style={{ padding: '2rem', position: 'sticky', top: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', boxShadow: '0 4px 12px rgba(99,102,241,0.35)', flexShrink: 0 }}>3</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.4px' }}>Your Details</h2>
            </div>

            <form onSubmit={handleBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600', letterSpacing: '0.02em' }}>Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Patient's legal name" className="premium-input" style={{ paddingLeft: '2.25rem' }} />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600', letterSpacing: '0.02em' }}>Phone (WhatsApp) *</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="premium-input" style={{ paddingLeft: '2.25rem' }} />
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600', letterSpacing: '0.02em' }}>Email <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(for confirmation)</span></label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="premium-input" style={{ paddingLeft: '2.25rem' }} />
                </div>
              </div>

              {/* Age + Gender */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600' }}>Age</label>
                  <input type="number" min="0" max="150" value={age} onChange={e => setAge(e.target.value)} placeholder="Years" className="premium-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600' }}>Gender</label>
                  <select value={gender} onChange={e => setGender(e.target.value as any)} className="premium-input" style={{ height: '45px' }}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Consultation Type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.55rem', fontWeight: '600' }}>Consultation Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  {[
                    { value: 'in_person', label: '🏥 In Clinic', icon: Building2 },
                    { value: 'teleconsult', label: '💻 Teleconsult', icon: Activity },
                  ].map(({ value, label }) => {
                    const isActive = consultationType === value;
                    return (
                      <button key={value} type="button" onClick={() => setConsultationType(value as any)}
                        style={{ padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)', background: isActive ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)', border: isActive ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.07)', color: isActive ? 'var(--primary-light)' : 'var(--text-muted)', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.18s', fontFamily: 'Inter, inherit' }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600' }}>Symptoms / Notes <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(optional)</span></label>
                <div style={{ position: 'relative' }}>
                  <FileText size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-subtle)' }} />
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Briefly describe your symptoms…" rows={3} className="premium-input" style={{ paddingLeft: '2.25rem', resize: 'none' }} />
                </div>
              </div>

              {/* Booking Summary */}
              {selectedDoctor && selectedSlot && (
                <div className="animate-in" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[
                    { label: '🥼 Doctor', value: selectedDoctor.name },
                    { label: '📅 Date', value: new Date(selectedSlot).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) },
                    { label: '🕐 Time', value: new Date(selectedSlot).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
                    { label: '💬 Mode', value: consultationType === 'in_person' ? 'In Clinic' : 'Teleconsult' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span>{label}</span>
                      <span style={{ fontWeight: '600', color: 'var(--text)' }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                    <span style={{ fontWeight: '700', color: 'var(--text)' }}>Total</span>
                    <span style={{ fontWeight: '900', color: 'var(--success)', fontSize: '1.05rem' }}>
                      {Number(selectedDoctor.consultationFee) === 0
                        ? 'FREE'
                        : clinic?.paymentGateway === 'free'
                          ? `₹${selectedDoctor.consultationFee} (Pay at Clinic)`
                          : `₹${selectedDoctor.consultationFee}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={bookingLoading || !selectedSlot || !name || !phone}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  background: selectedSlot && name && phone && !bookingLoading
                    ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))'
                    : 'rgba(30,41,59,0.5)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  cursor: selectedSlot && name && phone && !bookingLoading ? 'pointer' : 'not-allowed',
                  opacity: selectedSlot && name && phone && !bookingLoading ? 1 : 0.45,
                  boxShadow: selectedSlot && name && phone && !bookingLoading ? '0 8px 24px rgba(99,102,241,0.3)' : 'none',
                  transition: 'all 0.25s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: 'Inter, inherit',
                  letterSpacing: '-0.02em',
                  marginTop: '0.25rem',
                }}
                onMouseEnter={e => { if (selectedSlot && name && phone && !bookingLoading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(99,102,241,0.4)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = selectedSlot && name && phone && !bookingLoading ? '0 8px 24px rgba(99,102,241,0.3)' : 'none'; }}
              >
                {bookingLoading ? (
                  <>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'spin 0.65s linear infinite' }} />
                    Processing…
                  </>
                ) : !selectedSlot ? (
                  'Select a Time Slot to Book'
                ) : !name || !phone ? (
                  'Enter Your Details'
                ) : isFreeBooking ? (
                  Number(selectedDoctor?.consultationFee) === 0
                    ? '✓ Confirm Appointment (Free)'
                    : `✓ Confirm Appointment (₹${selectedDoctor?.consultationFee} · Pay at Clinic)`
                ) : (
                  `Pay ₹${selectedDoctor?.consultationFee} & Confirm`
                )}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--text-subtle)', lineHeight: '1.5' }}>
                🔒 Your data is secure and protected. By booking, you agree to our terms.
              </p>
            </form>
          </section>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
