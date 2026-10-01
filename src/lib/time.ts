import { cookies, headers } from 'next/headers';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const PT = 'America/Los_Angeles';
export const TEST_NOW_KEY = 'x-test-now';

export function isTestMode(): boolean {
  return process.env.TEST_MODE === '1';
}

function parseIso(v: string | undefined | null): Date | null {
  if (!v) return null;
  const d = new Date(decodeURIComponent(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The ONLY way app code may read the current time.
 * In TEST_MODE=1 a per-request override (cookie or header `x-test-now`, ISO string) is honored.
 * Outside a request (or when not in test mode) this is the real clock.
 */
export async function now(): Promise<Date> {
  if (isTestMode()) {
    try {
      const h = await headers();
      const fromHeader = parseIso(h.get(TEST_NOW_KEY));
      if (fromHeader) return fromHeader;
      const c = await cookies();
      const fromCookie = parseIso(c.get(TEST_NOW_KEY)?.value);
      if (fromCookie) return fromCookie;
    } catch {
      // not in a request scope: fall through to real time
    }
  }
  return new Date();
}

// ---------- Pacific Time helpers (pure; no clock reads) ----------

export type YMD = { year: number; month: number; day: number };

/** Calendar date of an instant, as seen in Pacific Time. */
export function ptDate(instant: Date): YMD {
  const [year, month, day] = formatInTimeZone(instant, PT, 'yyyy-MM-dd').split('-').map(Number);
  return { year, month, day };
}

/** Day of week in PT: 0 = Sunday ... 6 = Saturday. */
export function ptDayOfWeek(instant: Date): number {
  return Number(formatInTimeZone(instant, PT, 'i')) % 7;
}

/** The instant corresponding to a wall-clock time in Pacific Time (DST-correct). */
export function ptWallTimeToUtc(ymd: YMD, hour = 0, minute = 0): Date {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return fromZonedTime(`${p(ymd.year, 4)}-${p(ymd.month)}-${p(ymd.day)}T${p(hour)}:${p(minute)}:00`, PT);
}

function addDays(ymd: YMD, days: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** The Tuesday (PT calendar date) that starts the pick'em week containing `instant`. */
export function weekTuesday(instant: Date): YMD {
  const dow = ptDayOfWeek(instant);
  return addDays(ptDate(instant), -((dow + 5) % 7)); // Tue=2 -> 0, Wed -> 1, ..., Mon -> 6
}

/** Week unlock: Tuesday 00:00 PT. */
export function weekUnlockAt(tuesday: YMD): Date {
  return ptWallTimeToUtc(tuesday, 0, 0);
}

/** Default week lock: Thursday 12:00 PT (Thanksgiving: pass lockHour = 9). */
export function weekLockAt(tuesday: YMD, lockHour = 12): Date {
  return ptWallTimeToUtc(addDays(tuesday, 2), lockHour, 0);
}

export function formatPT(instant: Date, fmt = "EEE MMM d, h:mm a 'PT'"): string {
  return formatInTimeZone(instant, PT, fmt);
}
