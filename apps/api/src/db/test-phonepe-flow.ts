import 'dotenv/config';
import { db, pool } from './client';
import { appointments, patients, doctors, clinics } from './schema';
import { eq } from 'drizzle-orm';

async function testFlow() {
  console.log('🤖 Starting programmatic PhonePe flow test...');

  // 1. Get Clinic & Doctor
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.slug, 'dr-ravi-clinic'),
  });
  if (!clinic) throw new Error('Clinic not found');

  const doctor = await db.query.doctors.findFirst({
    where: eq(doctors.clinicId, clinic.id),
  });
  if (!doctor) throw new Error('Doctor not found');

  console.log('Doctor consultation fee:', doctor.consultationFee);

  // 2. Create Patient
  const [patient] = await db.insert(patients).values({
    groupId: clinic.groupId!,
    originClinicId: clinic.id,
    phone: '+919999999999',
    name: 'PhonePe Tester',
  }).onConflictDoUpdate({
    target: [patients.groupId, patients.phone],
    set: { name: 'PhonePe Tester' }
  }).returning();

  // 3. Create Appointment
  const slotDatetime = new Date();
  slotDatetime.setDate(slotDatetime.getDate() + 1);
  slotDatetime.setHours(10, 0, 0, 0);

  // Delete any existing conflicting appointment first
  await db.delete(appointments).where(eq(appointments.appointmentDatetime, slotDatetime));

  const [appointment] = await db.insert(appointments).values({
    clinicId: clinic.id,
    doctorId: doctor.id,
    patientId: patient.id,
    appointmentDatetime: slotDatetime,
    durationMinutes: 15,
    status: 'pending_payment',
    consultationFeeSnapshot: doctor.consultationFee,
  }).returning();

  console.log('Created test appointment:', appointment.id);

  // 4. Send request to /payments/create-order
  console.log('Sending request to /payments/create-order...');
  const res = await fetch('http://localhost:4000/payments/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointmentId: appointment.id }),
  });

  const data = await res.json() as any;
  console.log('HTTP Status:', res.status);
  console.log('Response body:', JSON.stringify(data, null, 2));

  if (res.ok && data.gateway === 'phonepe' && data.paymentUrl) {
    console.log('✅ SUCCESS: PhonePe redirect URL generated successfully!');
    console.log('Redirect URL:', data.paymentUrl);
  } else {
    console.error('❌ FAILURE: PhonePe creation failed.');
  }
}

testFlow()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
