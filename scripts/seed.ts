import './_env';
import { getDb } from '../src/db';
import { seedAdmin } from '../src/db/queries';

// NOTE: pglite is single-process. Run this while the dev server is STOPPED (or use POST /api/test/reset with TEST_MODE=1).
// Env: ADMIN_USERNAME / ADMIN_PIN / ADMIN_FIRST_NAME. Defaults (admin / 1234 / Admin) apply outside production only.
async function main() {
  const prod = process.env.NODE_ENV === 'production';
  const username = process.env.ADMIN_USERNAME || (prod ? '' : 'admin');
  const pin = process.env.ADMIN_PIN || (prod ? '' : '1234');
  const firstName = process.env.ADMIN_FIRST_NAME || (prod ? '' : 'Admin');
  if (!username || !pin || !firstName) {
    throw new Error('ADMIN_USERNAME, ADMIN_PIN and ADMIN_FIRST_NAME are required in production');
  }
  if (!/^\d{4}$/.test(pin)) throw new Error('ADMIN_PIN must be exactly 4 digits');
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) throw new Error('ADMIN_USERNAME must be 3-20 chars of letters, digits, _');
  const db = await getDb();
  const admin = await seedAdmin(db, { username, pin, firstName });
  console.log(`admin user "${admin.username}" is ready`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
