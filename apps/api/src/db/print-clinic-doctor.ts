import 'dotenv/config';
import { db, pool } from './client';
import { clinics, doctors } from './schema';
import { eq } from 'drizzle-orm';

async function print() {
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.slug, 'dr-ravi-clinic'),
  });
  console.log('CLINIC PAYMENT GATEWAY:', clinic?.paymentGateway);
  console.log('CLINIC KEYS ENCRYPTED:', !!clinic?.paymentGatewayKeyEncrypted, !!clinic?.paymentGatewaySecretEncrypted);

  const doc = await db.query.doctors.findFirst({
    where: eq(doctors.name, 'Dr. Ravi Kumar'),
  });
  console.log('DOCTOR FEE:', doc?.consultationFee);
}

print()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
