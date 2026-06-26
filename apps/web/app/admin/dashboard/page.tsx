'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const DEFAULT_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface Clinic {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  paymentGateway: 'razorpay' | 'cashfree' | 'phonepe' | 'free';
  hasPaymentGateway: boolean;
}

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  qualifications: string;
  consultationFee: string | number;
  phone: string;
  email: string;
  status: 'active' | 'inactive' | 'on_leave';
  maxPatientsPerDay: number;
  bufferTimeBetweenSlots: number;
  bio: string | null;
}

interface Appointment {
  id: string;
  appointmentDatetime: string;
  durationMinutes: number;
  status: 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  consultationType: 'in_person' | 'teleconsult';
  consultationFeeSnapshot: string;
  notes: string | null;
  patient: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  doctor: {
    id: string;
    name: string;
  };
  payment?: {
    id: string;
    gateway: string;
    gatewayPaymentId: string | null;
    status: string;
    amount: string | number;
  } | null;
}

interface DashboardStats {
  today: {
    total: number;
    confirmed: number;
    pendingPayment: number;
  };
  thisMonth: {
    appointments: number;
    revenue: number;
  };
  allTime: {
    totalPatients: number;
  };
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [staffRole, setStaffRole] = useState<string>('');

  // App state
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'doctors' | 'settings'>('overview');
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [appointmentsList, setAppointmentsList] = useState<Appointment[]>([]);
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [editingAptFeeId, setEditingAptFeeId] = useState<string | null>(null);
  const [newAptFee, setNewAptFee] = useState<string>('');

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals / Forms state
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecialization, setNewDocSpecialization] = useState('');
  const [newDocQualifications, setNewDocQualifications] = useState('');
  const [newDocFee, setNewDocFee] = useState(0);
  const [newDocPhone, setNewDocPhone] = useState('');
  const [newDocEmail, setNewDocEmail] = useState('');
  const [newDocMaxPatients, setNewDocMaxPatients] = useState(30);
  const [newDocBuffer, setNewDocBuffer] = useState(0);
  const [newDocBio, setNewDocBio] = useState('');

  // Editing doctor profile state
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocSpecialization, setEditDocSpecialization] = useState('');
  const [editDocQualifications, setEditDocQualifications] = useState('');
  const [editDocFee, setEditDocFee] = useState(0);
  const [editDocPhone, setEditDocPhone] = useState('');
  const [editDocEmail, setEditDocEmail] = useState('');
  const [editDocMaxPatients, setEditDocMaxPatients] = useState(30);
  const [editDocBuffer, setEditDocBuffer] = useState(0);
  const [editDocBio, setEditDocBio] = useState('');
  const [editDocStatus, setEditDocStatus] = useState<'active' | 'inactive' | 'on_leave'>('active');

  // Timings / Availability manager state
  const [timingDoctor, setTimingDoctor] = useState<Doctor | null>(null);
  const [timingSchedule, setTimingSchedule] = useState<{
    dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    isActive: boolean;
  }[]>([]);

  // Settings form state
  const [settingsName, setSettingsName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsTimezone, setSettingsTimezone] = useState('');
  const [settingsGateway, setSettingsGateway] = useState<'razorpay' | 'cashfree' | 'phonepe' | 'free'>('free');
  const [settingsGatewayKey, setSettingsGatewayKey] = useState('');
  const [settingsGatewaySecret, setSettingsGatewaySecret] = useState('');

  // Appointment filters
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPaymentMode, setFilterPaymentMode] = useState<'all' | 'online' | 'offline'>('all');

  // Check Auth on Mount
  useEffect(() => {
    const localToken = localStorage.getItem('accessToken');
    const localClinicId = localStorage.getItem('clinicId');
    const localName = localStorage.getItem('staffName');
    const localRole = localStorage.getItem('staffRole');

    if (!localToken || !localClinicId) {
      router.push('/admin/login');
      return;
    }

    setToken(localToken);
    setClinicId(localClinicId);
    setStaffName(localName || 'Staff Member');
    setStaffRole(localRole || 'Admin');
  }, [router]);

  // Fetch all dashboard data when token is ready
  useEffect(() => {
    if (!token || !clinicId) return;
    loadDashboardData();
  }, [token, clinicId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch clinic details
      const clinicRes = await fetch(`${API_URL}/clinics/${clinicId}`, { headers });
      if (!clinicRes.ok) throw new Error('Failed to load clinic settings');
      const clinicData = await clinicRes.json();
      setClinic(clinicData);
      
      // Populate settings form
      setSettingsName(clinicData.name);
      setSettingsPhone(clinicData.phone || '');
      setSettingsEmail(clinicData.email || '');
      setSettingsAddress(clinicData.address || '');
      setSettingsTimezone(clinicData.timezone || 'Asia/Kolkata');
      setSettingsGateway(clinicData.paymentGateway);

      // 2. Fetch stats
      const statsRes = await fetch(`${API_URL}/clinics/${clinicId}/dashboard`, { headers });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // 3. Fetch doctors
      const doctorsRes = await fetch(`${API_URL}/clinics/${clinicId}/doctors`, { headers });
      if (doctorsRes.ok) {
        const doctorsData = await doctorsRes.json();
        setDoctorsList(doctorsData);
      }

      // 4. Fetch appointments
      const appointmentsRes = await fetch(`${API_URL}/clinics/${clinicId}/appointments?limit=100`, { headers });
      if (appointmentsRes.ok) {
        const appointmentsData = await appointmentsRes.json();
        setAppointmentsList(appointmentsData.data || []);
      }

    } catch (err: any) {
      setError(err.message || 'Error loading dashboard data');
      if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/admin/login');
  };

  // Complete Appointment Action
  const handleCompleteAppointment = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/appointments/${id}/complete`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete appointment');
      
      setSuccessMsg('Appointment marked as completed!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Mark Paid Offline Action
  const handleMarkPaidOffline = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/payments/${id}/mark-paid-offline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record offline payment');
      
      setSuccessMsg('Offline payment marked as successful!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Update Consultation Fee Action
  const handleUpdateFee = async (id: string, consultationFee: number) => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/appointments/${id}/update-fee`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ consultationFee }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update consultation fee');
      
      setSuccessMsg('Consultation fee updated successfully!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Cancel Appointment Action
  const handleCancelAppointment = async (id: string) => {
    const reason = prompt('Please enter the cancellation reason:');
    if (reason === null) return;
    if (reason.trim().length < 3) {
      alert('Cancellation reason must be at least 3 characters.');
      return;
    }

    try {
      setError(null);
      const res = await fetch(`${API_URL}/appointments/${id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel appointment');

      setSuccessMsg('Appointment cancelled successfully!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Create Doctor Action
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const res = await fetch(`${API_URL}/clinics/${clinicId}/doctors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newDocName,
          specialization: newDocSpecialization || undefined,
          qualifications: newDocQualifications || undefined,
          consultationFee: newDocFee,
          phone: newDocPhone || undefined,
          email: newDocEmail || undefined,
          maxPatientsPerDay: newDocMaxPatients,
          bufferTimeBetweenSlots: newDocBuffer,
          bio: newDocBio || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add doctor');

      setSuccessMsg(`Doctor ${newDocName} added successfully!`);
      setShowAddDoctor(false);
      
      // Reset Form
      setNewDocName('');
      setNewDocSpecialization('');
      setNewDocQualifications('');
      setNewDocFee(0);
      setNewDocPhone('');
      setNewDocEmail('');
      setNewDocMaxPatients(30);
      setNewDocBuffer(0);
      setNewDocBio('');

      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Deactivate/Archive Doctor
  const handleDeleteDoctor = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete / deactivate the profile for ${name}?`)) return;

    try {
      setError(null);
      const res = await fetch(`${API_URL}/doctors/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: false }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete doctor');

      setSuccessMsg(`Doctor ${name} deactivated successfully.`);
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditDoctor = (doc: Doctor) => {
    setEditingDoctor(doc);
    setEditDocName(doc.name);
    setEditDocSpecialization(doc.specialization || '');
    setEditDocQualifications(doc.qualifications || '');
    setEditDocFee(Number(doc.consultationFee));
    setEditDocPhone(doc.phone || '');
    setEditDocEmail(doc.email || '');
    setEditDocMaxPatients(doc.maxPatientsPerDay || 30);
    setEditDocBuffer(doc.bufferTimeBetweenSlots || 0);
    setEditDocBio(doc.bio || '');
    setEditDocStatus(doc.status);
    
    // Close other forms/modals
    setShowAddDoctor(false);
    setTimingDoctor(null);
  };

  const handleUpdateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;
    try {
      setError(null);
      const res = await fetch(`${API_URL}/doctors/${editingDoctor.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editDocName,
          specialization: editDocSpecialization || undefined,
          qualifications: editDocQualifications || undefined,
          consultationFee: editDocFee,
          phone: editDocPhone || undefined,
          email: editDocEmail || undefined,
          maxPatientsPerDay: editDocMaxPatients,
          bufferTimeBetweenSlots: editDocBuffer,
          bio: editDocBio || undefined,
          status: editDocStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update doctor profile');

      setSuccessMsg(`Doctor profile for ${editDocName} updated successfully!`);
      setEditingDoctor(null);
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startManageTimings = (doc: any) => {
    setTimingDoctor(doc);
    
    // Load existing availability or fallback to default
    const existing = doc.availability || [];
    const initialSchedule = ALL_DAYS.map(day => {
      const found = existing.find((a: any) => a.dayOfWeek === day);
      if (found) {
        return {
          dayOfWeek: day,
          startTime: found.startTime.slice(0, 5), // Format HH:MM
          endTime: found.endTime.slice(0, 5),
          slotDurationMinutes: Number(found.slotDurationMinutes),
          isActive: found.isActive,
        };
      }
      return {
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 15,
        isActive: (DEFAULT_WEEKDAYS as readonly string[]).includes(day),
      };
    });

    setTimingSchedule(initialSchedule);
    
    // Close other forms/modals
    setShowAddDoctor(false);
    setEditingDoctor(null);
  };

  const handleSaveTimings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timingDoctor) return;
    try {
      setError(null);
      
      // Filter to only include active schedules
      const activeSchedules = timingSchedule.filter(s => s.isActive);
      if (activeSchedules.length === 0) {
        throw new Error('Please select at least one active day for availability.');
      }

      const res = await fetch(`${API_URL}/doctors/${timingDoctor.id}/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schedule: activeSchedules }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update schedule');

      setSuccessMsg(`Timings schedule for ${timingDoctor.name} updated successfully!`);
      setTimingDoctor(null);
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Update Settings Action
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      setSuccessMsg(null);

      const payload: Record<string, any> = {
        name: settingsName,
        phone: settingsPhone || undefined,
        email: settingsEmail || undefined,
        address: settingsAddress || undefined,
        timezone: settingsTimezone,
        paymentGateway: settingsGateway,
      };

      if (settingsGatewayKey) payload.paymentGatewayKey = settingsGatewayKey;
      if (settingsGatewaySecret) {
        if (settingsGateway === 'phonepe') {
          payload.paymentGatewaySecret = JSON.stringify({
            clientSecret: settingsGatewaySecret,
            clientVersion: '1'
          });
        } else {
          payload.paymentGatewaySecret = settingsGatewaySecret;
        }
      }

      const res = await fetch(`${API_URL}/clinics/${clinicId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      setSuccessMsg('Clinic settings updated successfully!');
      // Clear key/secret fields from UI
      setSettingsGatewayKey('');
      setSettingsGatewaySecret('');
      
      loadDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Filtered Appointments
  const getFilteredAppointments = () => {
    return appointmentsList.filter((apt) => {
      if (filterDate && apt.appointmentDatetime.split('T')[0] !== filterDate) return false;
      if (filterDoctor && apt.doctor.id !== filterDoctor) return false;
      if (filterStatus && apt.status !== filterStatus) return false;
      if (filterPaymentMode === 'online') {
        if (!apt.payment || apt.payment.gateway === 'free') return false;
      }
      if (filterPaymentMode === 'offline') {
        if (apt.payment && apt.payment.gateway !== 'free') return false;
      }
      return true;
    });
  };

  if (loading && !clinic) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)' }}>
        <div className="skeleton" style={{ width: '200px', height: '40px', marginBottom: '1.5rem' }} />
        <div className="skeleton" style={{ width: '400px', height: '24px', marginBottom: '1rem' }} />
        <div className="skeleton" style={{ width: '300px', height: '20px' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--surface)', color: 'var(--text)' }}>
      {/* Sidebar */}
      <aside style={{ width: '260px', background: 'var(--surface-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.25rem' }}>{clinic?.name}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>⚙️ Dashboard Portal</div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'appointments', label: '📅 Appointments' },
            { id: 'doctors', label: '🥼 Doctors' },
            { id: 'settings', label: '⚙️ Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setSuccessMsg(null);
              }}
              style={{
                textAlign: 'left',
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                border: 'none',
                color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.95rem',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* User Card */}
        <div style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{staffName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{staffRole}</div>
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
      <main style={{ flex: 1, padding: '3rem', overflowY: 'auto', maxHeight: '100vh' }}>
        {successMsg && (
          <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--success)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>✓ {successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>Dashboard Overview</h1>
              <p style={{ color: 'var(--text-muted)' }}>Welcome back, {staffName}. Here is the clinic status for today.</p>
            </div>

            {/* Metrics cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
              <div className="glass" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Today's Bookings</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0.5rem 0 0.25rem', color: 'var(--primary-light)' }}>{stats?.today?.total || 0}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Confirmed: {stats?.today?.confirmed || 0} | Unpaid: {stats?.today?.pendingPayment || 0}
                </div>
              </div>

              <div className="glass" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Monthly Bookings</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0.5rem 0 0.25rem', color: 'var(--accent)' }}>{stats?.thisMonth?.appointments || 0}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>For this calendar month</div>
              </div>

              <div className="glass" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Monthly Revenue</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0.5rem 0 0.25rem', color: 'var(--success)' }}>₹{stats?.thisMonth?.revenue || 0}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>From paid appointments</div>
              </div>

              <div className="glass" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Total Patients</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0.5rem 0 0.25rem', color: 'var(--warning)' }}>{stats?.allTime?.totalPatients || 0}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Registered with the clinic</div>
              </div>
            </div>

            {/* Quick Today's Appointment list */}
            <div className="glass" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Upcoming Appointments</h2>
              
              {appointmentsList.filter(a => a.status === 'confirmed').slice(0, 5).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No confirmed upcoming appointments found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {appointmentsList.filter(a => a.status === 'confirmed').slice(0, 5).map((apt) => (
                    <div key={apt.id} style={{ background: 'var(--surface-2)', padding: '1rem 1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '1rem' }}>{apt.patient.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          With {apt.doctor.name} • 🏢 {apt.consultationType === 'in_person' ? 'In Person' : 'Teleconsult'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--primary-light)' }}>
                            {new Date(apt.appointmentDatetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(apt.appointmentDatetime).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            onClick={() => handleCompleteAppointment(apt.id)}
                            style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                          >
                            Complete
                          </button>
                          <button 
                            onClick={() => handleCancelAppointment(apt.id)}
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>Appointments Manager</h1>
              <p style={{ color: 'var(--text-muted)' }}>Track, filter, complete, and cancel patient bookings.</p>
            </div>

            {/* Filter bar */}
            <div className="glass" style={{ padding: '1.25rem 2rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Date</label>
                <input 
                  type="date" 
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Doctor</label>
                <select 
                  value={filterDoctor}
                  onChange={(e) => setFilterDoctor(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', minWidth: '150px', height: '37px' }}
                >
                  <option value="">All Doctors</option>
                  {doctorsList.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Status</label>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', minWidth: '150px', height: '37px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="pending_payment">Pending Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Payment Option</label>
                <select 
                  value={filterPaymentMode}
                  onChange={(e) => setFilterPaymentMode(e.target.value as any)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', minWidth: '175px', height: '37px' }}
                >
                  <option value="all">All Payments</option>
                  <option value="online">Online Payment (UPI/Card)</option>
                  <option value="offline">Offline / Pay at Hospital</option>
                </select>
              </div>

              {(filterDate || filterDoctor || filterStatus || filterPaymentMode !== 'all') && (
                <button 
                  onClick={() => { setFilterDate(''); setFilterDoctor(''); setFilterStatus(''); setFilterPaymentMode('all'); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Table */}
            <div className="glass" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Patient</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Doctor</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Date & Time</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Type</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Status</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>Payment</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredAppointments().length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No appointments match current filters.
                      </td>
                    </tr>
                  ) : (
                    getFilteredAppointments().map((apt) => (
                      <tr key={apt.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ fontWeight: '600' }}>{apt.patient.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📞 {apt.patient.phone}</div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.95rem' }}>{apt.doctor.name}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ fontSize: '0.9rem' }}>{new Date(apt.appointmentDatetime).toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)' }}>{new Date(apt.appointmentDatetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>
                          {apt.consultationType === 'in_person' ? '🏢 In Person' : '💻 Teleconsult'}
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            background: 
                              apt.status === 'confirmed' ? 'rgba(16,185,129,0.12)' :
                              apt.status === 'completed' ? 'rgba(99,102,241,0.12)' :
                              apt.status === 'cancelled' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color:
                              apt.status === 'confirmed' ? 'var(--success)' :
                              apt.status === 'completed' ? 'var(--primary-light)' :
                              apt.status === 'cancelled' ? 'var(--danger)' : 'var(--warning)',
                          }}>
                            {apt.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {/* Consultation Fee editing */}
                            {editingAptFeeId === apt.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>₹</span>
                                <input
                                  type="number"
                                  value={newAptFee}
                                  onChange={(e) => setNewAptFee(e.target.value)}
                                  style={{ width: '65px', padding: '2px 4px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', outline: 'none' }}
                                />
                                <button
                                  onClick={async () => {
                                    await handleUpdateFee(apt.id, Number(newAptFee));
                                    setEditingAptFeeId(null);
                                  }}
                                  style={{ background: 'var(--success)', border: 'none', color: '#fff', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600' }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingAptFeeId(null)}
                                  style={{ background: 'var(--danger)', border: 'none', color: '#fff', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600' }}
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: '800', color: 'var(--accent)', fontSize: '0.95rem' }}>
                                  ₹{apt.consultationFeeSnapshot}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingAptFeeId(apt.id);
                                    setNewAptFee(String(apt.consultationFeeSnapshot));
                                  }}
                                  style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                                  title="Edit Fee"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}

                            {/* Payment details */}
                            {apt.payment ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ textTransform: 'capitalize', fontWeight: '600', color: 'var(--text-muted)' }}>
                                    {apt.payment.gateway === 'free' ? 'Hospital' : apt.payment.gateway}
                                  </span>
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                    background: apt.payment.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                    color: apt.payment.status === 'success' ? 'var(--success)' : 'var(--warning)'
                                  }}>
                                    {apt.payment.status.toUpperCase()}
                                  </span>
                                </div>
                                {apt.payment.gatewayPaymentId && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                                    ID: {apt.payment.gatewayPaymentId}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Pay at Hospital</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {/* Offline payment collection */}
                            {apt.payment && apt.payment.gateway === 'free' && apt.payment.status === 'pending' && (
                              <button 
                                onClick={() => handleMarkPaidOffline(apt.id)}
                                style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700' }}
                              >
                                Mark Paid
                              </button>
                            )}

                            {apt.status === 'confirmed' && (
                              <>
                                <button 
                                  onClick={() => handleCompleteAppointment(apt.id)}
                                  style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                                >
                                  Complete
                                </button>
                                <button 
                                  onClick={() => handleCancelAppointment(apt.id)}
                                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {apt.status === 'pending_payment' && (
                              <button 
                                onClick={() => handleCancelAppointment(apt.id)}
                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DOCTORS */}
        {activeTab === 'doctors' && (
          <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>Doctor Directory</h1>
                <p style={{ color: 'var(--text-muted)' }}>Manage doctor accounts, credentials, and profile snapshots.</p>
              </div>
              <button 
                onClick={() => setShowAddDoctor(!showAddDoctor)}
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {showAddDoctor ? 'Close Form' : '+ Add Doctor'}
              </button>
            </div>

            {/* Add Doctor form */}
            {showAddDoctor && (
              <div className="glass animate-in" style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Create Doctor Profile</h2>
                <form onSubmit={handleCreateDoctor} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Doctor Name *</label>
                    <input 
                      type="text" required value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="e.g. Dr. Ravi Kumar"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Specialization</label>
                    <input 
                      type="text" value={newDocSpecialization} onChange={(e) => setNewDocSpecialization(e.target.value)} placeholder="e.g. Cardiologist"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Qualifications</label>
                    <input 
                      type="text" value={newDocQualifications} onChange={(e) => setNewDocQualifications(e.target.value)} placeholder="e.g. MBBS, MD"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Consultation Fee (INR) *</label>
                    <input 
                      type="number" min={0} required value={newDocFee} onChange={(e) => setNewDocFee(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Phone</label>
                    <input 
                      type="tel" value={newDocPhone} onChange={(e) => setNewDocPhone(e.target.value)} placeholder="e.g. +919999999999"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Email</label>
                    <input 
                      type="email" value={newDocEmail} onChange={(e) => setNewDocEmail(e.target.value)} placeholder="doctor@clinic.com"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Professional Bio</label>
                    <textarea 
                      value={newDocBio} onChange={(e) => setNewDocBio(e.target.value)} placeholder="Brief introduction..." rows={3}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', resize: 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button type="submit" style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Save Doctor Profile
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Edit Doctor form */}
            {editingDoctor && (
              <div className="glass animate-in" style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Edit Doctor Profile: {editingDoctor.name}</h2>
                <form onSubmit={handleUpdateDoctor} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Doctor Name *</label>
                    <input 
                      type="text" required value={editDocName} onChange={(e) => setEditDocName(e.target.value)} placeholder="e.g. Dr. Ravi Kumar"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Specialization</label>
                    <input 
                      type="text" value={editDocSpecialization} onChange={(e) => setEditDocSpecialization(e.target.value)} placeholder="e.g. Cardiologist"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Qualifications</label>
                    <input 
                      type="text" value={editDocQualifications} onChange={(e) => setEditDocQualifications(e.target.value)} placeholder="e.g. MBBS, MD"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Consultation Fee (INR) *</label>
                    <input 
                      type="number" min={0} required value={editDocFee} onChange={(e) => setEditDocFee(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Phone</label>
                    <input 
                      type="tel" value={editDocPhone} onChange={(e) => setEditDocPhone(e.target.value)} placeholder="e.g. +919999999999"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Email</label>
                    <input 
                      type="email" value={editDocEmail} onChange={(e) => setEditDocEmail(e.target.value)} placeholder="doctor@clinic.com"
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Daily Max Patients</label>
                    <input 
                      type="number" min={1} required value={editDocMaxPatients} onChange={(e) => setEditDocMaxPatients(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Status</label>
                    <select 
                      value={editDocStatus} onChange={(e) => setEditDocStatus(e.target.value as any)}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', height: '45px' }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="on_leave">On Leave</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Professional Bio</label>
                    <textarea 
                      value={editDocBio} onChange={(e) => setEditDocBio(e.target.value)} placeholder="Brief introduction..." rows={3}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', resize: 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingDoctor(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Cancel
                    </button>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Timings Manager form */}
            {timingDoctor && (
              <div className="glass animate-in" style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>Weekly Availability: {timingDoctor.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>Define when patients can book appointments with this doctor.</p>
                <form onSubmit={handleSaveTimings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {timingSchedule.map((day, idx) => (
                      <div key={day.dayOfWeek} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '1.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.01)', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'capitalize', fontWeight: '600', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={day.isActive} 
                            onChange={(e) => {
                              const updated = [...timingSchedule];
                              updated[idx].isActive = e.target.checked;
                              setTimingSchedule(updated);
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          {day.dayOfWeek}
                        </label>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Start Time</label>
                          <input 
                            type="time" 
                            disabled={!day.isActive}
                            value={day.startTime}
                            onChange={(e) => {
                              const updated = [...timingSchedule];
                              updated[idx].startTime = e.target.value;
                              setTimingSchedule(updated);
                            }}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', opacity: day.isActive ? 1 : 0.5 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>End Time</label>
                          <input 
                            type="time" 
                            disabled={!day.isActive}
                            value={day.endTime}
                            onChange={(e) => {
                              const updated = [...timingSchedule];
                              updated[idx].endTime = e.target.value;
                              setTimingSchedule(updated);
                            }}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', opacity: day.isActive ? 1 : 0.5 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Slot Duration</label>
                          <select 
                            disabled={!day.isActive}
                            value={day.slotDurationMinutes}
                            onChange={(e) => {
                              const updated = [...timingSchedule];
                              updated[idx].slotDurationMinutes = Number(e.target.value);
                              setTimingSchedule(updated);
                            }}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', opacity: day.isActive ? 1 : 0.5 }}
                          >
                            <option value={10}>10 Min</option>
                            <option value={15}>15 Min</option>
                            <option value={20}>20 Min</option>
                            <option value={30}>30 Min</option>
                            <option value={45}>45 Min</option>
                            <option value={60}>60 Min</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="button" onClick={() => setTimingDoctor(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Cancel
                    </button>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Save Timings
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Doctors Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {doctorsList.map((doc) => (
                <div key={doc.id} className="glass animate-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '1.25rem' }}>
                      {doc.name.replace('Dr. ', '').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>{doc.name}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{doc.specialization || 'General Physician'}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--primary-light)' }}>{doc.qualifications || 'MBBS'}</p>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Consultation Fee</span>
                      <span style={{ fontWeight: '600', color: 'var(--accent)' }}>₹{doc.consultationFee}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Daily Max Patients</span>
                      <span>{doc.maxPatientsPerDay}</span>
                    </div>
                    {doc.phone && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Contact</span>
                        <span>{doc.phone}</span>
                      </div>
                    )}
                  </div>

                  {doc.bio && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>{doc.bio}</p>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      background: doc.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: doc.status === 'active' ? 'var(--success)' : 'var(--danger)',
                      textTransform: 'uppercase',
                      marginRight: 'auto'
                    }}>
                      {doc.status}
                    </span>

                    <button 
                      onClick={() => startManageTimings(doc)}
                      style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Timings
                    </button>
                    <button 
                      onClick={() => startEditDoctor(doc)}
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--primary-light)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteDoctor(doc.id, doc.name)}
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>Clinic Settings</h1>
              <p style={{ color: 'var(--text-muted)' }}>Configure details, booking timezone, and integrated payment gateway.</p>
            </div>

            <div className="glass" style={{ padding: '2.5rem' }}>
              <form onSubmit={handleUpdateSettings} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* General Clinic Information */}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>📋 Clinic Profile</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Clinic Name *</label>
                      <input 
                        type="text" required value={settingsName} onChange={(e) => setSettingsName(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Timezone *</label>
                      <select 
                        value={settingsTimezone} onChange={(e) => setSettingsTimezone(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', height: '45px' }}
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="UTC">Coordinated Universal Time (UTC)</option>
                        <option value="America/New_York">US Eastern Time</option>
                        <option value="Europe/London">London (GMT/BST)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Contact Phone</label>
                      <input 
                        type="tel" value={settingsPhone} onChange={(e) => setSettingsPhone(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Contact Email</label>
                      <input 
                        type="email" value={settingsEmail} onChange={(e) => setSettingsEmail(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                      />
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Clinic Physical Address</label>
                      <textarea 
                        value={settingsAddress} onChange={(e) => setSettingsAddress(e.target.value)} rows={2}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', resize: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Pluggable Payment Gateway configuration */}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>💳 Integrated Payment Gateway</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Active Gateway</label>
                      <select 
                        value={settingsGateway} onChange={(e) => setSettingsGateway(e.target.value as any)}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none', height: '45px', maxWidth: '300px' }}
                      >
                        <option value="free">Free (₹0 consultation fees only)</option>
                        <option value="razorpay">Razorpay Checkout Integration</option>
                        <option value="phonepe">PhonePe Hosted Checkout</option>
                      </select>
                    </div>

                    {settingsGateway === 'razorpay' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: 'rgba(255,255,255,0.01)', padding: '1.5rem', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: '600' }}>
                            {clinic?.hasPaymentGateway && clinic.paymentGateway === 'razorpay' ? '✓ Keys are configured securely at rest' : '⚠️ No keys set yet. Fill in keys below to configure.'}
                          </span>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Razorpay Key ID</label>
                          <input 
                            type="text" value={settingsGatewayKey} onChange={(e) => setSettingsGatewayKey(e.target.value)} placeholder="rzp_test_..."
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>Razorpay Key Secret</label>
                          <input 
                            type="password" value={settingsGatewaySecret} onChange={(e) => setSettingsGatewaySecret(e.target.value)} placeholder="••••••••••••••••"
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                          />
                        </div>
                      </div>
                    )}

                    {settingsGateway === 'phonepe' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: 'rgba(255,255,255,0.01)', padding: '1.5rem', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: '600' }}>
                            {clinic?.hasPaymentGateway && clinic.paymentGateway === 'phonepe' ? '✓ PhonePe credentials are configured securely' : '⚠️ No credentials set yet. Fill in details below to configure.'}
                          </span>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>PhonePe Client ID</label>
                          <input 
                            type="text" value={settingsGatewayKey} onChange={(e) => setSettingsGatewayKey(e.target.value)} placeholder="M23667ZTWVUU4_..."
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>PhonePe Client Secret (Base64)</label>
                          <input 
                            type="password" value={settingsGatewaySecret} onChange={(e) => setSettingsGatewaySecret(e.target.value)} placeholder="••••••••••••••••"
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', boxShadow: '0 4px 16px rgba(99,102,241,0.2)' }}>
                    Save All Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
