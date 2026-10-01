import './_env';
import { resetDb } from '../src/db';
import { seedBase } from '../src/db/queries';

// NOTE: pglite is single-process. Run this while the dev server is STOPPED.
async function main() {
  const db = await resetDb();
  await seedBase(db);
  console.log('database reset and seeded');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
