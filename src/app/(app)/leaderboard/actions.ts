'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { maybeRefresh } from '@/lib/sync';
import { now } from '@/lib/time';

export type RefreshState = 'updated' | 'fresh' | 'error';

/** "Refresh" button: same 5-minute throttle as refresh-on-view (maybeRefresh). */
export async function refreshAction(): Promise<RefreshState> {
  await requireUser();
  const res = await maybeRefresh(await now());
  revalidatePath('/leaderboard');
  revalidatePath('/games');
  if (res.error) return 'error';
  return res.ran ? 'updated' : 'fresh';
}
