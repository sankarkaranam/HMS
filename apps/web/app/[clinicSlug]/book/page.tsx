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
  const [paymentMode, setPaymentMode] = useState<'online' | 'offline'>('online');

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successApt, setSuccessApt] = useState<any | null>(null);
  const [activePolicy, setActivePolicy] = useState<'terms' | 'privacy' | 'refund' | 'contact' | null>(null);

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
          paymentMode: consultationType === 'teleconsult' ? 'online' : paymentMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (data.paymentRequired) {
        const orderRes = await fetch(`${API_URL}/payments/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId: data.appointment.id,
            origin: window.location.origin,
          }),
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
          theme: { color: '#1565C0' },
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

  // Teleconsult always requires online PhonePe payment if fee > 0
  const isTeleconsultPaid = consultationType === 'teleconsult' && Number(selectedDoctor?.consultationFee) > 0;
  const isFreeBooking = Number(selectedDoctor?.consultationFee) === 0 || (clinic?.paymentGateway === 'free' && !isTeleconsultPaid);
  const isOnlinePayment = Number(selectedDoctor?.consultationFee) > 0 && !isFreeBooking;

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (verifyingPayment) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,101,192,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid rgba(21,101,192,0.15)', borderTop: '3px solid var(--primary)', animation: 'spin 0.9s linear infinite', margin: '0 auto 2rem' }} />
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
      <>
        <main className="print:hidden" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
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
                ...(clinic?.phone ? [{ label: 'Helpline', value: clinic.phone }] : []),
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
                🖨️ Print Appointment
              </button>
              <button 
                onClick={() => { window.location.href = 'https://sriswethaclinic.com'; }} 
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', transition: 'all 0.2s', fontFamily: 'Inter, inherit', textAlign: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Close
              </button>
            </div>
          </div>
          <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.7; } 80%, 100% { transform: scale(2); opacity: 0; } }`}</style>
        </main>

        {/* Printable View (Clean, Clinical Black & White Receipt Template - Hospital Style) */}
        <div className="hidden print:block" style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#000',
          backgroundColor: '#fff',
          padding: '24px',
          width: '100%',
          maxWidth: '650px',
          margin: '0 auto',
          boxSizing: 'border-box'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 4px 0', textTransform: 'uppercase', color: '#000', letterSpacing: '-0.3px' }}>
              {clinic?.name || 'Sri Swetha Pharmacy & Clinic'}
            </h1>
            {clinic?.address && <p style={{ margin: '2px 0', fontSize: '12px', color: '#444' }}>📍 {clinic.address}</p>}
            {clinic?.phone && <p style={{ margin: '2px 0', fontSize: '12px', color: '#444' }}>📞 Helpline: {clinic.phone}</p>}
            <div style={{ marginTop: '12px', display: 'inline-block', border: '1px solid #000', padding: '4px 12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Official Appointment Slip & Receipt
            </div>
          </div>

          {/* Details Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555', width: '35%' }}>Appointment ID</td>
                <td style={{ padding: '8px 0', fontWeight: '700', fontFamily: 'monospace', fontSize: '14px' }}>{refId}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555' }}>Patient Name</td>
                <td style={{ padding: '8px 0', fontWeight: '700' }}>{successApt.patient?.name}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555' }}>Consulting Doctor</td>
                <td style={{ padding: '8px 0', fontWeight: '700' }}>Dr. {successApt.doctor?.name || 'Doctor'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555' }}>Date & Time</td>
                <td style={{ padding: '8px 0', fontWeight: '700' }}>
                  {aptTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at {aptTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555' }}>Consultation Mode</td>
                <td style={{ padding: '8px 0', fontWeight: '600' }}>
                  {successApt.consultationType === 'in_person' ? '🏥 In-Clinic Consultation' : '💻 Teleconsultation (Online)'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 0', fontWeight: '600', color: '#555' }}>Status</td>
                <td style={{ padding: '8px 0', fontWeight: '700', color: '#1e7e34' }}>CONFIRMED (Paid ✅)</td>
              </tr>
            </tbody>
          </table>

          {/* Receipt Info */}
          <div style={{ border: '1px solid #000', padding: '16px', marginBottom: '24px', backgroundColor: '#f9f9f9' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '4px' }}>
              Payment Details
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 0' }}>Consultation Fee</td>
                  <td style={{ padding: '4px 0', textAlign: 'right' }}>₹{successApt.consultationFeeSnapshot || '0.00'}</td>
                </tr>
                <tr style={{ fontWeight: '800', borderTop: '1px solid #000' }}>
                  <td style={{ padding: '8px 0 0 0' }}>Total Paid</td>
                  <td style={{ padding: '8px 0 0 0', textAlign: 'right', fontSize: '15px' }}>₹{successApt.consultationFeeSnapshot || '0.00'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Instructions */}
          <div style={{ borderLeft: '3px solid #000', paddingLeft: '12px', fontSize: '11px', lineHeight: '1.4', color: '#333', marginBottom: '40px' }}>
            <strong style={{ display: 'block', fontSize: '12px', margin: '0 0 4px 0', color: '#000' }}>📌 Patient Guidelines & Instructions:</strong>
            <ul style={{ margin: 0, paddingLeft: '14px' }}>
              <li>Please report at the reception desk / join the video room at least 10 minutes prior to your time slot.</li>
              <li>Please carry this printout or show the SMS/email confirmation on your phone upon arrival.</li>
              <li>Bring your old case files, current medications, and past diagnostic reports.</li>
            </ul>
          </div>

          {/* Footer Sign stamp */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '48px' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>
              <p style={{ margin: '0' }}>Printed on: {new Date().toLocaleString('en-IN')}</p>
              <p style={{ margin: '0' }}>System-generated receipt. No signature required.</p>
            </div>
            <div style={{ textAlign: 'center', width: '180px' }}>
              <div style={{ borderBottom: '1px solid #000', marginBottom: '6px' }} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#333' }}>Clinic Authority Stamp / Sign</span>
            </div>
          </div>
        </div>
      </>
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
                    { value: 'in_person', label: '🏥 In Clinic', sub: clinic?.paymentGateway === 'free' ? 'Pay at clinic' : 'Online payment' },
                    { value: 'teleconsult', label: '💻 Teleconsult', sub: 'Online payment req.' },
                  ].map(({ value, label, sub }) => {
                    const isActive = consultationType === value;
                    const isPayOnline = value === 'teleconsult' && Number(selectedDoctor?.consultationFee) > 0;
                    return (
                      <button key={value} type="button" onClick={() => setConsultationType(value as any)}
                        style={{ padding: '0.65rem 0.5rem', borderRadius: 'var(--radius-sm)', background: isActive ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)', border: isActive ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.07)', color: isActive ? 'var(--primary-light)' : 'var(--text-muted)', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.18s', fontFamily: 'Inter, inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        {label}
                        <span style={{ fontSize: '0.62rem', fontWeight: '600', color: isPayOnline ? (isActive ? 'var(--warning)' : 'var(--warning)') : (isActive ? 'rgba(129,140,248,0.7)' : 'var(--text-subtle)'), opacity: 0.9 }}>
                          {isPayOnline ? '⚡ PhonePe required' : sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Payment Option Selector (Only for in_person when clinic has payment gateway and fee > 0) */}
                {consultationType === 'in_person' && clinic?.paymentGateway !== 'free' && Number(selectedDoctor?.consultationFee) > 0 && (
                  <div className="animate-in" style={{ marginTop: '0.85rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: '600' }}>Payment Option</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                      {[
                        { value: 'online', label: '💳 Pay Online Now', sub: 'UPI, Cards' },
                        { value: 'offline', label: '🏥 Pay at Hospital', sub: 'Cash / UPI Counter' },
                      ].map((opt) => {
                        const isActive = paymentMode === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPaymentMode(opt.value as any)}
                            style={{
                              padding: '0.65rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              background: isActive ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)',
                              border: isActive ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.07)',
                              color: isActive ? 'var(--primary-light)' : 'var(--text-muted)',
                              fontWeight: '700',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.18s',
                              fontFamily: 'Inter, inherit',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            {opt.label}
                            <span style={{ fontSize: '0.62rem', fontWeight: '500', color: 'var(--text-subtle)' }}>
                              {opt.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Teleconsult info banner */}
                {consultationType === 'teleconsult' && Number(selectedDoctor?.consultationFee) > 0 && (
                  <div className="animate-in" style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 'var(--radius-xs)', padding: '0.65rem 0.85rem' }}>
                    <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>⚡</span>
                    <p style={{ fontSize: '0.76rem', color: '#fbbf24', lineHeight: '1.45', margin: 0 }}>
                      <strong>Online payment required</strong> for teleconsult. You'll be redirected to PhonePe/Razorpay to complete payment.
                    </p>
                  </div>
                )}

                {/* Pay at Hospital info banner */}
                {consultationType === 'in_person' && paymentMode === 'offline' && clinic?.paymentGateway !== 'free' && Number(selectedDoctor?.consultationFee) > 0 && (
                  <div className="animate-in" style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 'var(--radius-xs)', padding: '0.65rem 0.85rem' }}>
                    <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>🏥</span>
                    <p style={{ fontSize: '0.76rem', color: 'var(--success)', lineHeight: '1.45', margin: 0 }}>
                      <strong>Pay at Counter</strong> selected. You can pay cash or UPI at the hospital reception.
                    </p>
                  </div>
                )}
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
                <div className="animate-in" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${isTeleconsultPaid ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 'var(--radius-sm)', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[
                    { label: '🥼 Doctor', value: selectedDoctor.name },
                    { label: '📅 Date', value: new Date(selectedSlot).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) },
                    { label: '🕐 Time', value: new Date(selectedSlot).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
                    { label: '💬 Mode', value: consultationType === 'in_person' ? 'In Clinic' : '💻 Teleconsult' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span>{label}</span>
                      <span style={{ fontWeight: '600', color: 'var(--text)' }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem', marginTop: '0.2rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', color: 'var(--text)' }}>Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: '900', fontSize: '1.05rem', color: Number(selectedDoctor.consultationFee) === 0 ? 'var(--success)' : isTeleconsultPaid ? '#fbbf24' : 'var(--success)' }}>
                        {Number(selectedDoctor.consultationFee) === 0
                          ? 'FREE'
                          : `₹${selectedDoctor.consultationFee}`}
                      </span>
                      {isTeleconsultPaid || (consultationType === 'in_person' && paymentMode === 'online' && clinic?.paymentGateway !== 'free' && Number(selectedDoctor.consultationFee) > 0) ? (
                        <span style={{ display: 'block', fontSize: '0.66rem', color: '#f59e0b', fontWeight: '600', marginTop: '1px' }}>⚡ Online via {clinic?.paymentGateway}</span>
                      ) : null}
                      {((!isTeleconsultPaid && clinic?.paymentGateway === 'free') || (consultationType === 'in_person' && paymentMode === 'offline')) && Number(selectedDoctor.consultationFee) > 0 ? (
                        <span style={{ display: 'block', fontSize: '0.66rem', color: 'var(--text-subtle)', marginTop: '1px' }}>Pay at clinic / hospital</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Helpline Contact Card */}
              {clinic?.phone && (
                <div className="animate-in" style={{ background: 'rgba(99,102,241,0.04)', border: '1px dashed rgba(99,102,241,0.18)', borderRadius: 'var(--radius-sm)', padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <PhoneCall size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>Clinic Helpline</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff' }}>{clinic.phone}</div>
                    </div>
                  </div>
                  <a href={`tel:${clinic.phone}`} style={{ fontSize: '0.72rem', color: 'var(--primary-light)', fontWeight: '700', textDecoration: 'none', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '4px', padding: '4px 8px', background: 'rgba(99,102,241,0.06)' }}>Call Now</a>
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
                ) : isTeleconsultPaid ? (
                  `⚡ Pay ₹${selectedDoctor?.consultationFee} via PhonePe`
                ) : isFreeBooking ? (
                  Number(selectedDoctor?.consultationFee) === 0
                    ? '✓ Confirm Appointment (Free)'
                    : `✓ Confirm — Pay ₹${selectedDoctor?.consultationFee} at Clinic`
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

      {/* Policy Footer (Mandatory for PhonePe PG compliance) */}
      {clinic && (
        <footer style={{ marginTop: '4rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2rem', paddingBottom: '2rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button type="button" onClick={() => setActivePolicy('terms')} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              Terms & Conditions
            </button>
            <button type="button" onClick={() => setActivePolicy('privacy')} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              Privacy Policy
            </button>
            <button type="button" onClick={() => setActivePolicy('refund')} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              Refund & Cancellation Policy
            </button>
            <button type="button" onClick={() => setActivePolicy('contact')} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              Contact & Grievance
            </button>
          </div>
          <div>
            © {new Date().getFullYear()} {clinic.name}. All rights reserved.
          </div>
        </footer>
      )}

      {/* Policy Modals */}
      {activePolicy && clinic && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass animate-in-scale" style={{ padding: '2.5rem', maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.98)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0 }}>
                {activePolicy === 'terms' && 'Terms & Conditions'}
                {activePolicy === 'privacy' && 'Privacy Policy'}
                {activePolicy === 'refund' && 'Refund & Cancellation Policy'}
                {activePolicy === 'contact' && 'Contact Us & Grievance'}
              </h2>
              <button onClick={() => setActivePolicy(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.75rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            {/* Modal Content */}
            <div style={{ fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--text)', whiteSpace: 'pre-wrap', textAlign: 'left', flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              {activePolicy === 'terms' && (
                <>
                  <p style={{ marginBottom: '1rem' }}>This document is an electronic record in terms of Information Technology Act, 2000 and rules there under as applicable and the amended provisions pertaining to electronic records in various statutes as amended by the Information Technology Act, 2000. This electronic record is generated by a computer system and does not require any physical or digital signatures.</p>
                  <p style={{ marginBottom: '1rem' }}>This document is published in accordance with the provisions of Rule 3 (1) of the Information Technology (Intermediaries guidelines) Rules, 2011 that require publishing the rules and regulations, privacy policy and Terms of Use for access or usage of domain name {typeof window !== 'undefined' ? window.location.origin : 'https://sriswethaclinic.com'} (‘Website’), including the related mobile site and mobile application (hereinafter referred to as ‘Platform’).</p>
                  <p style={{ marginBottom: '1rem' }}>The Platform is owned by {clinic.name}, {clinic.address ? `with its registered office at ${clinic.address}` : ''} (hereinafter referred to as ‘Platform Owner’, ‘we’, ‘us’, ‘our’).</p>
                  <p style={{ marginBottom: '1rem' }}>Your use of the Platform and services and tools are governed by the following terms and conditions (“Terms of Use”) as applicable to the Platform including the applicable policies which are incorporated herein by way of reference. If You transact on the Platform, You shall be subject to the policies that are applicable to the Platform for such transaction. By mere use of the Platform, You shall be contracting with the Platform Owner and these terms and conditions including the policies constitute Your binding obligations, with Platform Owner. These Terms of Use relate to your use of our website, goods (as applicable) or services (as applicable) (collectively, ‘Services’). Any terms and conditions proposed by You which are in addition to or which conflict with these Terms of Use are expressly rejected by the Platform Owner and shall be of no force or effect. These Terms of Use can be modified at any time without assigning any reason. It is your responsibility to periodically review these Terms of Use to stay informed of updates.</p>
                  <p style={{ marginBottom: '1rem' }}>For the purpose of these Terms of Use, wherever the context so requires ‘you’, ‘your’ or ‘user’ shall mean any natural or legal person who has agreed to become a user/buyer on the Platform.</p>
                  <p style={{ marginBottom: '1.5rem' }}>ACCESSING, BROWSING OR OTHERWISE USING THE PLATFORM INDICATES YOUR AGREEMENT TO ALL THE TERMS AND CONDITIONS UNDER THESE TERMS OF USE, SO PLEASE READ THE TERMS OF USE CAREFULLY BEFORE PROCEEDING.</p>
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>The use of Platform and/or availing of our Services is subject to the following Terms of Use:</p>
                  <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    <li>To access and use the Services, you agree to provide true, accurate and complete information to us during and after registration, and you shall be responsible for all acts done through the use of your registered account on the Platform.</li>
                    <li>Neither we nor any third parties provide any warranty or guarantee as to the accuracy, timeliness, performance, completeness or suitability of the information and materials offered on this website or through the Services, for any specific purpose. You acknowledge that such information and materials may contain inaccuracies or errors and we expressly exclude liability for any such inaccuracies or errors to the fullest extent permitted by law.</li>
                    <li>Your use of our Services and the Platform is solely and entirely at your own risk and discretion for which we shall not be liable to you in any manner. You are required to independently assess and ensure that the Services meet your requirements.</li>
                    <li>The contents of the Platform and the Services are proprietary to us and are licensed to us. You will not have any authority to claim any intellectual property rights, title, or interest in its contents. The contents includes and is not limited to the design, layout, look and graphics.</li>
                    <li>You acknowledge that unauthorized use of the Platform and/or the Services may lead to action against you as per these Terms of Use and/or applicable laws.</li>
                    <li>You agree to pay us the charges associated with availing the Services.</li>
                    <li>You agree not to use the Platform and/ or Services for any purpose that is unlawful, illegal or forbidden by these Terms, or Indian or local laws that might apply to you.</li>
                    <li>You agree and acknowledge that website and the Services may contain links to other third party websites. On accessing these links, you will be governed by the terms of use, privacy policy and such other policies of such third party websites. These links are provided for your convenience for provide further information.</li>
                    <li>You understand that upon initiating a transaction for availing the Services you are entering into a legally binding and enforceable contract with the Platform Owner for the Services.</li>
                    <li>You shall indemnify and hold harmless Platform Owner, its affiliates, group companies (as applicable) and their respective officers, directors, agents, and employees, from any claim or demand, or actions including reasonable attorney’s fees, made by any third party or penalty imposed due to or arising out of Your breach of this Terms of Use, privacy Policy and other Policies, or Your violation of any law, rules or regulations or the rights (including infringement of intellectual property rights) of a third party.</li>
                    <li>Notwithstanding anything contained in these Terms of Use, the parties shall not be liable for any failure to perform an obligation under these Terms if performance is prevented or delayed by a force majeure event.</li>
                    <li>These Terms and any dispute or claim relating to it, or its enforceability, shall be governed by and construed in accordance with the laws of India.</li>
                    <li>All disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts in India.</li>
                    <li>All concerns or communications relating to these Terms must be communicated to us using the contact information provided on this website.</li>
                  </ul>
                </>
              )}

              {activePolicy === 'privacy' && (
                <>
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Introduction</p>
                  <p style={{ marginBottom: '1rem' }}>This Privacy Policy describes how {clinic.name} and its affiliates (collectively “{clinic.name}, we, our, us”) collect, use, share, protect or otherwise process your information/ personal data through our website {typeof window !== 'undefined' ? window.location.origin : 'https://sriswethaclinic.com'} (hereinafter referred to as Platform). Please note that you may be able to browse certain sections of the Platform without registering with us. We do not offer any product/service under this Platform outside India and your personal data will primarily be stored and processed in India. By visiting this Platform, providing your information or availing any product/service offered on the Platform, you expressly agree to be bound by the terms and conditions of this Privacy Policy, the Terms of Use and the applicable service/product terms and conditions, and agree to be governed by the laws of India including but not limited to the laws applicable to data protection and privacy. If you do not agree please do not use or access our Platform.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Collection</p>
                  <p style={{ marginBottom: '1rem' }}>We collect your personal data when you use our Platform, services or otherwise interact with us during the course of our relationship and related information provided from time to time. Some of the information that we may collect includes but is not limited to personal data / information provided to us during sign-up/registering or using our Platform such as name, date of birth, address, telephone/mobile number, email ID and/or any such information shared as proof of identity or address. Some of the sensitive personal data may be collected with your consent, such as your bank account or credit or debit card or other payment instrument information or biometric information such as your facial features or physiological information (in order to enable use of certain features when opted for, available on the Platform) etc. all of the above being in accordance with applicable law(s). You always have the option to not provide information, by choosing not to use a particular service or feature on the Platform. We may track your behaviour, preferences, and other information that you choose to provide on our Platform.</p>
                  <p style={{ marginBottom: '1rem' }}>This information is compiled and analysed on an aggregated basis. We will also collect your information related to your transactions on Platform and such third-party business partner platforms. When such a third-party business partner collects your personal data directly from you, you will be governed by their privacy policies. We shall not be responsible for the third-party business partner’s privacy practices or the content of their privacy policies, and we request you to read their privacy policies prior to disclosing any information. If you receive an email or a call seeking any personal data like debit/credit card PIN, net-banking or mobile banking password, we request you to never provide such information. If you have already revealed such information, report it immediately to an appropriate law enforcement agency.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Usage</p>
                  <p style={{ marginBottom: '1rem' }}>We use personal data to provide the services you request. To the extent we use your personal data to market to you, we will provide you the ability to opt-out of such uses. We use your personal data to assist sellers and business partners in handling and fulfilling orders; enhancing customer experience; to resolve disputes; troubleshoot problems; inform you about online and offline offers, products, services, and updates; customise your experience; detect and protect us against error, fraud and other criminal activity; enforce our terms and conditions; conduct marketing research, analysis and surveys; and as otherwise described to you at the time of collection of information. You understand that your access to these products/services may be affected in the event permission is not provided to us.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Sharing</p>
                  <p style={{ marginBottom: '1rem' }}>We share your personal data internally within our group entities, our other corporate entities, and affiliates to provide you access to the services and products offered by them. These entities and affiliates may market to you as a result of such sharing unless you explicitly opt-out. We may disclose personal data to third parties such as sellers, business partners, third party service providers including logistics partners, prepaid payment instrument issuers, third-party reward programs and other payment opted by you. These disclosure may be required for us to provide you access to our services and products offered to you, to comply with our legal obligations, to enforce our user agreement, to facilitate our marketing and advertising activities, to prevent, detect, mitigate, and investigate fraudulent or illegal activities related to our services. We may disclose personal and sensitive personal data to government agencies or other authorised law enforcement agencies if required to do so by law or in the good faith belief that such disclosure is reasonably necessary to respond to subpoenas, court orders, or other legal process.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Security Precautions</p>
                  <p style={{ marginBottom: '1rem' }}>To protect your personal data from unauthorised access or disclosure, loss or misuse we adopt reasonable security practices and procedures. Once your information is in our possession or whenever you access your account information, we adhere to our security guidelines to protect it against unauthorised access and offer the use of a secure server. However, the transmission of information is not completely secure for reasons beyond our control. By using the Platform, the users accept the security implications of data transmission over the internet and the World Wide Web which cannot always be guaranteed as completely secure, and therefore, there would always remain certain inherent risks regarding use of the Platform. Users are responsible for ensuring the protection of login and password records for their account.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Data Deletion and Retention</p>
                  <p style={{ marginBottom: '1rem' }}>You have an option to delete your account by visiting your profile and settings on our Platform, this action would result in you losing all information related to your account. You may also write to us at the contact information provided below to assist you with these requests. We may in event of any pending grievance, claims, pending shipments or any other services refuse or delay deletion of the account. Once the account is deleted, you will lose access to the account. We retain your personal data information for a period no longer than is required for the purpose for which it was collected or as required under any applicable law. However, we may retain data related to you if we believe it may be necessary to prevent fraud or future abuse or for other legitimate purposes. We may continue to retain your data in anonymised form for analytical and research purposes.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Consent</p>
                  <p style={{ marginBottom: '1rem' }}>By visiting our Platform or by providing your information, you consent to the collection, use, storage, disclosure and otherwise processing of your information on the Platform in accordance with this Privacy Policy. If you disclose to us any personal data relating to other people, you represent that you have the authority to do so and permit us to use the information in accordance with this Privacy Policy. You, while providing your personal data over the Platform or any partner platforms or establishments, consent to us (including our other corporate entities, affiliates, lending partners, technology partners, marketing channels, business partners and other third parties) to contact you through SMS, instant messaging apps, call and/or e-mail for the purposes specified in this Privacy Policy. You have an option to withdraw your consent that you have already provided by writing to the Grievance Officer at the contact information provided below. Please mention “Withdrawal of consent for processing personal data” in your subject line of your communication. We may verify such requests before acting on our request. However, please note that your withdrawal of consent will not be retrospective and will be in accordance with the Terms of Use, this Privacy Policy, and applicable laws. In the event you withdraw consent given to us under this Privacy Policy, we reserve the right to restrict or deny the provision of our services for which we consider such information to be necessary.</p>
                  
                  <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Changes to this Privacy Policy</p>
                  <p style={{ marginBottom: '1rem' }}>Please check our Privacy Policy periodically for changes. We may update this Privacy Policy to reflect changes to our information practices. We may alert / notify you about the significant changes to the Privacy Policy, in the manner as may be required under applicable laws.</p>
                </>
              )}

              {activePolicy === 'refund' && (
                <>
                  <p style={{ marginBottom: '1rem' }}>This refund and cancellation policy outlines how you can cancel or seek a refund for a product / service that you have purchased through the Platform. Under this policy:</p>
                  <p style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>In case of any refunds approved by {clinic.name}, it will take 1 days for the refund to be processed to you.</p>
                </>
              )}

              {activePolicy === 'contact' && (
                <>
                  <p style={{ marginBottom: '1rem' }}>For any grievances, concerns, or queries regarding terms, services, or data processing, please contact us at:</p>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Entity Name</strong>
                      <span>{clinic.name}</span>
                    </div>
                    {clinic.address && (
                      <div>
                        <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Grievance / Office Address</strong>
                        <span>{clinic.address}</span>
                      </div>
                    )}
                    {clinic.phone && (
                      <div>
                        <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Contact Number</strong>
                        <span>{clinic.phone}</span>
                      </div>
                    )}
                    {clinic.email && (
                      <div>
                        <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Support Email</strong>
                        <a href={`mailto:${clinic.email}`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{clinic.email}</a>
                      </div>
                    )}
                    <div>
                      <strong style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Office Hours</strong>
                      <span>Monday – Friday (09:00 – 18:00)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setActivePolicy(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
