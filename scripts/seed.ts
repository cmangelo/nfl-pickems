import './_env';
import { getDb } from '../src/db';
import { seedBase } from '../src/db/queries';

// NOTE: pglite is single-process. Run this while the dev server is STOPPED (or use POST /api/test/reset with TEST_MODE=1).
async function main() {
  const db = await getDb();
  const admin = await seedBase(db);
  console.log(`seeded admin user "${admin.username}" (PIN 1234)`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
