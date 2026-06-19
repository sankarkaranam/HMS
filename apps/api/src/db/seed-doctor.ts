import 'dotenv/config';
import { db, pool } from './client';
import { clinics, doctors, doctorAvailability, doctorBreaks } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Starting seed...');

  // Find clinic
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.slug, 'dr-ravi-clinic'),
  });

  if (!clinic) {
    console.error('❌ Clinic not found! Run API server or create clinic first.');
    process.exit(1);
  }

  console.log(`Found clinic: ${clinic.name} (${clinic.id})`);

  // Check if doctor exists
  let doctor = await db.query.doctors.findFirst({
    where: eq(doctors.clinicId, clinic.id),
  });

  if (!doctor) {
    console.log('Inserting Dr. Ravi Kumar...');
    const [inserted] = await db.insert(doctors).values({
      clinicId: clinic.id,
      name: 'Dr. Ravi Kumar',
      specialization: 'Cardiologist',
      qualifications: 'MBBS, MD (Cardiology)',
      consultationFee: '500.00',
      phone: '9876543210',
      email: 'ravi@drraviclinic.com',
      status: 'active',
      maxPatientsPerDay: 30,
      bufferTimeBetweenSlots: 0,
      bio: 'Over 15 years of experience in cardiology. Specialized in non-invasive interventions and preventive heart care.',
    }).returning();
    doctor = inserted;
  } else {
    console.log(`Doctor Dr. Ravi Kumar already exists (${doctor.id}), updating consultation fee...`);
    const [updated] = await db.update(doctors).set({
      consultationFee: '500.00',
      specialization: 'Cardiologist',
      qualifications: 'MBBS, MD (Cardiology)',
      updatedAt: new Date(),
    }).where(eq(doctors.id, doctor.id)).returning();
    doctor = updated;
  }

  // Insert availability
  const days: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday')[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];

  for (const day of days) {
    // Check if availability exists
    const existingAvail = await db.query.doctorAvailability.findFirst({
      where: (da, { and }) => and(eq(da.doctorId, doctor.id), eq(da.dayOfWeek, day)),
    });

    if (!existingAvail) {
      console.log(`Adding availability for ${day}...`);
      const [avail] = await db.insert(doctorAvailability).values({
        doctorId: doctor.id,
        dayOfWeek: day,
        startTime: '09:00:00',
        endTime: '17:00:00',
        slotDurationMinutes: 15,
        isActive: true,
      }).returning();

      // Add Lunch Break
      await db.insert(doctorBreaks).values({
        availabilityId: avail.id,
        breakStart: '13:00:00',
        breakEnd: '14:00:00',
        label: 'Lunch Break',
      });
    } else {
      console.log(`Availability for ${day} already exists`);
    }
  }

  console.log('✅ Seeding completed successfully.');
}

seed()
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
  })
  .finally(async () => {
    await pool.end();
  });
