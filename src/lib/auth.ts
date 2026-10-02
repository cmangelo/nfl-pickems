import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, users } from '@/db/schema';
import { hashPin, verifyPin } from './pin';
import { isTestMode, now } from './time';

export type User = typeof users.$inferSelect;
export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export const SESSION_COOKIE = 'session';
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const MAX_LOCKOUT_MINUTES = 24 * 60;
/** 15 x 2^7 = 1920 min is already past the 24 h cap. */
const MAX_LOCKOUT_DOUBLINGS = 7;
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

/** A well-formed hash nobody can match: unknown usernames still pay for one scrypt so timing doesn't reveal them. */
const DUMMY_PIN_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(32)}`;

/**
 * Lock duration for the lockout that starts when `fails` total failures have been recorded (a multiple of
 * MAX_FAILED_ATTEMPTS): 15 min x 2^(prior lockouts), capped at 24 h. The counter is never reset by a lock
 * expiring, so prior lockouts = floor(fails / 5) - 1. Keep in sync with the SQL in `login`.
 */
export function lockoutMinutes(fails: number): number {
  const prior = Math.max(0, Math.floor(fails / MAX_FAILED_ATTEMPTS) - 1);
  return Math.min(LOCKOUT_MINUTES * 2 ** Math.min(prior, MAX_LOCKOUT_DOUBLINGS), MAX_LOCKOUT_MINUTES);
}

export function formatLockMessage(minutes: number): string {
  const m = Math.max(1, Math.ceil(minutes));
  const wait = m >= 60 ? `${Math.ceil(m / 60)} hr` : `${m} min`;
  return `Too many attempts. Try again in ${wait}.`;
}

const lockMessage = (lockedUntil: Date, t: Date) => formatLockMessage((lockedUntil.getTime() - t.getTime()) / 60000);

/**
 * Brute-force protection that holds under parallel requests. An attempt is RESERVED before the PIN is verified,
 * by one conditional UPDATE (a single statement, so it works on neon-http and pglite alike):
 * `failed_attempts + 1` only while the account is not locked, and the lock is set by that same statement when
 * the count reaches a multiple of 5. The database serializes the row updates, so at most 5 attempts per lockout
 * ever reach scrypt no matter how many requests are in flight; every other request is rejected without hashing.
 * A success resets the counter and the lock.
 */
export async function login(username: string, pin: string): Promise<AuthResult> {
  const db = await getDb();
  const uname = normalizeUsername(username);
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${uname}`);
  if (!user) {
    await verifyPin(pin, DUMMY_PIN_HASH);
    return { ok: false, error: BAD_LOGIN };
  }

  const t = await now();
  const nextCount = sql`${users.failedAttempts} + 1`;
  const lockMins = sql`least(${LOCKOUT_MINUTES}::float8 * power(2::float8, least((${nextCount}) / ${MAX_FAILED_ATTEMPTS} - 1, ${MAX_LOCKOUT_DOUBLINGS})), ${MAX_LOCKOUT_MINUTES}::float8)`;
  const [reserved] = await db
    .update(users)
    .set({
      failedAttempts: nextCount,
      lockedUntil: sql`case when (${nextCount}) % ${MAX_FAILED_ATTEMPTS} = 0 then ${t.toISOString()}::timestamptz + (${lockMins}) * interval '1 minute' else ${users.lockedUntil} end`,
    })
    .where(and(eq(users.id, user.id), or(isNull(users.lockedUntil), lte(users.lockedUntil, t))))
    .returning({ failedAttempts: users.failedAttempts, lockedUntil: users.lockedUntil });

  if (!reserved) {
    // Locked (possibly by a request that raced us): reject without running scrypt.
    const [fresh] = await db.select({ lockedUntil: users.lockedUntil }).from(users).where(eq(users.id, user.id));
    if (fresh?.lockedUntil && fresh.lockedUntil > t) return { ok: false, error: lockMessage(fresh.lockedUntil, t) };
    return { ok: false, error: BAD_LOGIN };
  }

  if (await verifyPin(pin, user.pinHash)) {
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    return { ok: true, user };
  }
  if (reserved.failedAttempts % MAX_FAILED_ATTEMPTS === 0 && reserved.lockedUntil) {
    return { ok: false, error: lockMessage(reserved.lockedUntil, t) };
  }
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
