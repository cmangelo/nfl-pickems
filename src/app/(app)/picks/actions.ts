'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { deleteEntry, submitPicks } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { now } from '@/lib/time';
import { isId, parseEntryTarget } from '@/lib/validate';

export type SubmitState = { ok: true; entryId?: number } | { ok: false; error: string };

/** Saves the player's picks: their first entry by default, `{ entryId }` for another, `{ newEntry: true }` to add one. */
export async function submitPicksAction(
  weekId: number,
  picks: Record<number, Side>,
  tiebreaker: number,
  target?: { entryId?: number; newEntry?: boolean },
): Promise<SubmitState> {
  const user = await requireUser();
  const t = parseEntryTarget(target);
  if (!isId(weekId) || !picks || typeof picks !== 'object' || !t) return { ok: false, error: 'Invalid request.' };
  const res = await submitPicks(user.id, Number(weekId), { picks, tiebreaker: Number(tiebreaker) }, { now: await now(), ...t });
  if (!res.ok) return { ok: false, error: res.message };
  revalidatePath('/picks');
  return { ok: true, entryId: res.entryId };
}

/** Removes one of the player's extra entries (open weeks only; their last entry stays). */
export async function deleteEntryAction(entryId: number): Promise<SubmitState> {
  const user = await requireUser();
  if (!isId(entryId)) return { ok: false, error: 'Invalid request.' };
  const res = await deleteEntry(Number(entryId), { now: await now(), userId: user.id });
  if (!res.ok) return res;
  revalidatePath('/picks');
  return { ok: true };
}
