import { resolveDriver } from '../src/db';

export const TRIVIAL_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580']);

export interface SeedConfig {
  username: string;
  pin: string;
  firstName: string;
}

/**
 * Resolves the admin to seed from the environment. ADMIN_USERNAME / ADMIN_PIN / ADMIN_FIRST_NAME are REQUIRED whenever
 * the DB driver is neon or NODE_ENV=production, and trivial PINs (1234, 0000, 1111, ...) are refused for neon.
 * The admin/1234/Admin defaults only apply to local pglite development. Throws a clear message otherwise.
 */
export function resolveSeedConfig(env: NodeJS.ProcessEnv = process.env): SeedConfig {
  const strict = resolveDriver(env) === 'neon' || env.NODE_ENV === 'production';
  const username = env.ADMIN_USERNAME || (strict ? '' : 'admin');
  const pin = env.ADMIN_PIN || (strict ? '' : '1234');
  const firstName = env.ADMIN_FIRST_NAME || (strict ? '' : 'Admin');
  if (!username || !pin || !firstName) {
    throw new Error('ADMIN_USERNAME, ADMIN_PIN and ADMIN_FIRST_NAME are required when seeding a production (neon) database');
  }
  if (!/^\d{4}$/.test(pin)) throw new Error('ADMIN_PIN must be exactly 4 digits');
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) throw new Error('ADMIN_USERNAME must be 3-20 chars of letters, digits, _');
  if (resolveDriver(env) === 'neon' && TRIVIAL_PINS.has(pin)) {
    throw new Error(`Refusing to seed an admin with the trivial PIN ${pin} into a neon database; choose a less guessable ADMIN_PIN`);
  }
  return { username, pin, firstName };
}
