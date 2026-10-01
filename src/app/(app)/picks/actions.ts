'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { submitPicks } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { now } from '@/lib/time';

export type SubmitState = { ok: true } | { ok: false; error: string };

export async function submitPicksAction(
  weekId: number,
  picks: Record<number, Side>,
  tiebreaker: number,
): Promise<SubmitState> {
  const user = await requireUser();
  const res = await submitPicks(user.id, Number(weekId), { picks, tiebreaker: Number(tiebreaker) }, { now: await now() });
  if (!res.ok) return { ok: false, error: res.message };
  revalidatePath('/picks');
  return { ok: true };
}
