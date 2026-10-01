import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { Db } from './index';
import { users } from './schema';

/**
 * PLACEHOLDER hashing for Phase 0 only. Real auth (Phase 1) replaces this with
 * a proper salted hash (e.g. scrypt/bcrypt).
 */
export function placeholderPinHash(pin: string): string {
  return 'sha256:' + createHash('sha256').update(pin).digest('hex');
}

export async function seedBase(db: Db) {
  const existing = await db.select().from(users).where(eq(users.username, 'admin'));
  if (existing.length) return existing[0];
  const [admin] = await db
    .insert(users)
    .values({ firstName: 'Admin', username: 'admin', pinHash: placeholderPinHash('1234'), isAdmin: true })
    .returning();
  return admin;
}
