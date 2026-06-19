import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'path';

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ loaded' : '❌ missing');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const db = drizzle(pool);

  console.log('Running migrations...');
  await migrate(db, {
    migrationsFolder: path.join(__dirname, 'src/db/migrations'),
  });

  console.log('✅ Migrations complete');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
