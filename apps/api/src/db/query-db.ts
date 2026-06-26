import 'dotenv/config';
import { db, pool } from './client';
import { clinics } from './schema';

async function query() {
  const allClinics = await db.query.clinics.findMany();
  console.log('CLINICS:', allClinics.map(c => ({ id: c.id, name: c.name, slug: c.slug, phone: c.phone, address: c.address })));
}

query()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
