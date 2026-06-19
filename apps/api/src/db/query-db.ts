import 'dotenv/config';
import { db, pool } from './client';
import { clinics, doctors, appointments, payments } from './schema';

async function query() {
  const allClinics = await db.query.clinics.findMany();
  console.log('CLINICS:', JSON.stringify(allClinics, null, 2));

  const allDoctors = await db.query.doctors.findMany();
  console.log('DOCTORS:', JSON.stringify(allDoctors, null, 2));

  const allAppointments = await db.query.appointments.findMany({
    with: { patient: true, doctor: true, payment: true }
  });
  console.log('APPOINTMENTS:', JSON.stringify(allAppointments, null, 2));
}

query()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
