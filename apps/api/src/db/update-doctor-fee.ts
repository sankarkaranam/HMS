import 'dotenv/config';
import { db, pool } from './client';
import { doctors } from './schema';
import { eq } from 'drizzle-orm';

async function update() {
  const [updated] = await db
    .update(doctors)
    .set({ consultationFee: '500.00' })
    .where(eq(doctors.name, 'Dr. Ravi Kumar'))
    .returning();
  console.log('UPDATED DOCTOR:', updated);
}

update()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
