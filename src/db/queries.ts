import { sql } from 'drizzle-orm';
import type { Db } from './index';
import { users } from './schema';
import { hashPin } from '../lib/pin';

export interface AdminSeed {
  username: string;
  pin: string;
  firstName: string;
}

export const DEFAULT_ADMIN: AdminSeed = { username: 'admin', pin: '1234', firstName: 'Admin' };

/** Creates the admin user if no user with that username exists (idempotent). */
export async function seedAdmin(db: Db, admin: AdminSeed = DEFAULT_ADMIN) {
  const username = admin.username.toLowerCase();
  const existing = await db.select().from(users).where(sql`lower(${users.username}) = ${username}`);
  if (existing.length) return existing[0];
  const [created] = await db
    .insert(users)
    .values({ firstName: admin.firstName, username, pinHash: await hashPin(admin.pin), isAdmin: true })
    .returning();
  return created;
}

export async function seedBase(db: Db) {
  return seedAdmin(db, DEFAULT_ADMIN);
}
