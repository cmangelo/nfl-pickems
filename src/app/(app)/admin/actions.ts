'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { weeks } from '@/db/schema';
import * as admin from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { getEspnClient } from '@/lib/espn';
import { isId, parseEntryTarget } from '@/lib/validate';
import { deleteEntry, submitPicks } from '@/lib/picks';
import { parseFeeInput } from '@/lib/pot';
import { importSeason, loadSeasonSchedule } from '@/lib/schedule';
import type { Side } from '@/lib/scoring';
import { adminOverrideGame, clearOverride, syncScores, voidGame } from '@/lib/sync';
import { now } from '@/lib/time';
import { setWeekLockOverride } from '@/lib/weeks';

export type ActionResult = { ok: true; message?: string; entryId?: number } | { ok: false; error: string };

const bad = (error: string): ActionResult => ({ ok: false, error });
const INVALID = 'Invalid request.';

function refresh() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/picks');
  revalidatePath('/games');
  revalidatePath('/leaderboard');
}

export async function setPaidAction(entryId: number, paid: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(entryId)) return bad(INVALID);
  if (!(await admin.setPaid(Number(entryId), !!paid))) return bad('Entry not found.');
  refresh();
  return { ok: true };
}

/** Sets the week's entry fee from the admin's input ("10", "12.50"); empty carries over the earlier week's fee. */
export async function setEntryFeeAction(weekId: number, value: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(weekId) || typeof value !== 'string' || value.length > 20) return bad(INVALID);
  const parsed = parseFeeInput(value);
  if (!parsed.ok) return bad(parsed.error);
  if (!(await admin.setEntryFee(Number(weekId), parsed.cents))) return bad('Week not found.');
  refresh();
  return { ok: true };
}

/** Deletes any entry (and its picks), at any time. */
export async function adminDeleteEntryAction(entryId: number): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(entryId)) return bad(INVALID);
  const res = await deleteEntry(Number(entryId), { now: await now(), asAdmin: true });
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function syncNowAction(weekId: number): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(weekId)) return bad(INVALID);
  try {
    const db = await getDb();
    const [week] = await db.select().from(weeks).where(eq(weeks.id, Number(weekId)));
    const base = getEspnClient();
    if (week) {
      // importSeason imports fromWeek..18; restrict it to the selected week.
      const only = {
        getScoreboard: (p: { season: number; week: number }) =>
          p.week === week.weekNumber ? base.getScoreboard(p) : Promise.resolve([]),
      };
      await importSeason({ season: week.season, fromWeek: week.weekNumber, client: only });
    }
    const res = await syncScores({ client: base, now: await now(), force: true });
    refresh();
    return { ok: true, message: `Synced ${res.games} games from ESPN.` };
  } catch (e) {
    return bad(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** `ptValue` is a datetime-local string in Pacific Time; null resets to the default lock. */
export async function setLockAction(weekId: number, ptValue: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(weekId)) return bad(INVALID);
  let at: Date | null = null;
  if (ptValue !== null) {
    at = admin.fromPtInputValue(String(ptValue));
    if (!at) return bad('Enter a valid date and time.');
  }
  const res = await setWeekLockOverride(Number(weekId), at);
  if (!res.ok) return bad(res.error);
  refresh();
  return { ok: true };
}

export async function overrideGameAction(
  gameId: number,
  homeScore: number,
  awayScore: number,
  winner: 'home' | 'away' | 'tie',
): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(gameId)) return bad(INVALID);
  if (winner !== 'home' && winner !== 'away' && winner !== 'tie') return bad('Pick a winner.');
  try {
    await adminOverrideGame(Number(gameId), { homeScore: Number(homeScore), awayScore: Number(awayScore), winner });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Could not save.');
  }
  refresh();
  return { ok: true };
}

export async function voidGameAction(gameId: number): Promise<ActionResult> {
  await requireAdmin();
  try {
    await voidGame(Number(gameId));
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Could not void the game.');
  }
  refresh();
  return { ok: true };
}

export async function clearOverrideAction(gameId: number): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(gameId)) return bad(INVALID);
  await clearOverride(Number(gameId));
  refresh();
  return { ok: true };
}

/** `target`: omitted = the player's first entry, `{ entryId }` = that entry, `{ newEntry: true }` = add one. */
export async function adminSubmitPicksAction(
  userId: number,
  weekId: number,
  target: { entryId?: number; newEntry?: boolean } | undefined,
  picks: Record<number, Side>,
  tiebreaker: number,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = parseEntryTarget(target);
  if (!isId(userId) || !isId(weekId) || !picks || typeof picks !== 'object' || !t) return bad(INVALID);
  const res = await submitPicks(
    Number(userId),
    Number(weekId),
    { picks, tiebreaker: Number(tiebreaker) },
    { now: await now(), asAdmin: true, actorId: me.id, ...t },
  );
  if (!res.ok) return bad(res.message);
  refresh();
  return { ok: true, entryId: res.entryId };
}

export async function resetPinAction(userId: number, pin: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isId(userId)) return bad(INVALID);
  const res = await admin.resetPin(Number(userId), String(pin));
  return res.ok ? { ok: true } : bad(res.error);
}

export async function setAdminAction(userId: number, isAdmin: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isId(userId)) return bad(INVALID);
  const res = await admin.setAdmin(me.id, Number(userId), !!isAdmin);
  if (!res.ok) return bad(res.error);
  refresh();
  return { ok: true };
}

export async function removeUserAction(userId: number): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isId(userId)) return bad(INVALID);
  const res = await admin.removeUser(me.id, Number(userId), await now());
  if (!res.ok) return bad(res.error);
  refresh();
  return { ok: true };
}

export async function loadScheduleAction(): Promise<ActionResult> {
  await requireAdmin();
  try {
    const res = await loadSeasonSchedule(getEspnClient(), await now());
    if (!res.ok) return bad('ESPN has no remaining weeks for this season.');
    refresh();
    return { ok: true, message: `Loaded ${res.weeks} weeks (${res.games} games) from week ${res.fromWeek}.` };
  } catch (e) {
    return bad(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
