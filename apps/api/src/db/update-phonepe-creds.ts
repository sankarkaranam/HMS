import 'dotenv/config';
import { db, pool } from './client';
import { clinics } from './schema';
import { eq } from 'drizzle-orm';

async function updatePhonePeV2Credentials() {
  console.log('🔧 Updating PhonePe V2 credentials in the database...');

  const CLIENT_ID = process.env.PHONEPE_CLIENT_ID!;
  const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET!; // use as-is (base64 from portal)
  const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';

  console.log('Client ID:', CLIENT_ID);
  console.log('Client Version:', CLIENT_VERSION);
  console.log('Client Secret (first 12 chars):', CLIENT_SECRET?.slice(0, 12) + '...');

  // Store Client ID in base64 (as our router expects)
  const keyEncrypted = Buffer.from(CLIENT_ID).toString('base64');
  // Store V2 creds as JSON with clientSecret holding the ORIGINAL base64 value from portal
  const secretObj = JSON.stringify({ clientSecret: CLIENT_SECRET, clientVersion: CLIENT_VERSION });
  const secretEncrypted = Buffer.from(secretObj).toString('base64');

  const result = await db.update(clinics)
    .set({
      paymentGateway: 'phonepe',
      paymentGatewayKeyEncrypted: keyEncrypted,
      paymentGatewaySecretEncrypted: secretEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(clinics.slug, 'dr-ravi-clinic'))
    .returning({ id: clinics.id, name: clinics.name, gateway: clinics.paymentGateway });

  if (result.length === 0) {
    console.error('❌ No clinic found with slug "dr-ravi-clinic"');
  } else {
    console.log('✅ Updated clinic:', result[0]);
    console.log('✅ PhonePe V2 credentials stored successfully!');
  }
}

updatePhonePeV2Credentials()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
