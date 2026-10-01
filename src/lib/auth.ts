import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, users } from '@/db/schema';
import { hashPin, verifyPin } from './pin';
import { isTestMode, now } from './time';

export type User = typeof users.$inferSelect;
export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export const SESSION_COOKIE = 'session';
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
const SESSION_MS = 365 * 24 * 3600 * 1000;

// ---------- validation ----------

export function validateFirstName(raw: string): string | null {
  const v = raw.trim();
  return v.length >= 1 && v.length <= 30 ? null : 'First name must be 1 to 30 characters.';
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(raw))
    ? null
    : 'Username must be 3 to 20 characters: letters, numbers, underscore.';
}

export function validatePin(pin: string): string | null {
  return /^\d{4}$/.test(pin) ? null : 'PIN must be exactly 4 digits.';
}

// ---------- sign up / login ----------

export async function signUp(firstName: string, username: string, pin: string): Promise<AuthResult> {
  const err = validateFirstName(firstName) ?? validateUsername(username) ?? validatePin(pin);
  if (err) return { ok: false, error: err };
  const db = await getDb();
  const uname = normalizeUsername(username);
  const taken = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${uname}`);
  if (taken.length) return { ok: false, error: 'That username is taken.' };
  try {
    const [user] = await db
      .insert(users)
      .values({ firstName: firstName.trim(), username: uname, pinHash: await hashPin(pin) })
      .returning();
    return { ok: true, user };
  } catch {
    return { ok: false, error: 'That username is taken.' };
  }
}

const BAD_LOGIN = 'Wrong username or PIN.';

export async function login(username: string, pin: string): Promise<AuthResult> {
  const db = await getDb();
  const uname = normalizeUsername(username);
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${uname}`);
  if (!user) return { ok: false, error: BAD_LOGIN };

  const t = await now();
  if (user.lockedUntil && user.lockedUntil > t) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - t.getTime()) / 60000));
    return { ok: false, error: `Too many attempts. Try again in ${mins} min.` };
  }
  // A lock that has expired starts a fresh count.
  const priorFails = user.lockedUntil ? 0 : user.failedAttempts;

  if (await verifyPin(pin, user.pinHash)) {
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    return { ok: true, user };
  }

  const fails = priorFails + 1;
  if (fails >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(t.getTime() + LOCKOUT_MINUTES * 60000);
    await db.update(users).set({ failedAttempts: 0, lockedUntil }).where(eq(users.id, user.id));
    return { ok: false, error: `Too many attempts. Try again in ${LOCKOUT_MINUTES} min.` };
  }
  await db.update(users).set({ failedAttempts: fails, lockedUntil: null }).where(eq(users.id, user.id));
  return { ok: false, error: BAD_LOGIN };
}

export async function changePin(
  user: User,
  currentPin: string,
  newPin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const err = validatePin(newPin);
  if (err) return { ok: false, error: `New ${err.charAt(0).toLowerCase()}${err.slice(1)}` };
  if (!(await verifyPin(currentPin, user.pinHash))) return { ok: false, error: 'Current PIN is incorrect.' };
  const db = await getDb();
  await db.update(users).set({ pinHash: await hashPin(newPin) }).where(eq(users.id, user.id));
  return { ok: true };
}

// ---------- sessions ----------

/** Inserts a sessions row (no cookie). Used by startSession and the test login route. */
export async function createSession(userId: number) {
  const db = await getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date((await now()).getTime() + SESSION_MS);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return { token, expiresAt };
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && !isTestMode(),
    path: '/',
    expires,
  };
}

/** Creates a session and sets the cookie (server actions / route handlers only). */
export async function startSession(userId: number) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const t = await now();
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, t)));
  return rows[0]?.user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Non-admins get a 404 (the admin area is not advertised). */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}
