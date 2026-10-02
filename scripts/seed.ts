import './_env';
import { getDb } from '../src/db';
import { seedAdmin } from '../src/db/queries';
import { resolveSeedConfig } from './seed-config';

// NOTE: pglite is single-process. Run this while the dev server is STOPPED (or use POST /api/test/reset with TEST_MODE=1).
// Env: ADMIN_USERNAME / ADMIN_PIN / ADMIN_FIRST_NAME. Defaults (admin / 1234 / Admin) apply to local pglite only; they are
// required (and trivial PINs refused) with the neon driver or NODE_ENV=production. See resolveSeedConfig.
async function main() {
  const { username, pin, firstName } = resolveSeedConfig();
  const db = await getDb();
  const admin = await seedAdmin(db, { username, pin, firstName });
  console.log(`admin user "${admin.username}" is ready`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
