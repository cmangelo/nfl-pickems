import { formatPT } from './time';

/** Pure view helpers for the week UI (no DB, no clock reads). */

export { resolveWeekId } from './week-id';
export { formatCountdown } from './countdown';

export interface DayGroup<T> {
  /** PT calendar day, yyyy-MM-dd. */
  key: string;
  /** "Thursday" */
  label: string;
  games: T[];
}

/** Groups games by their Pacific Time calendar day, in kickoff order. */
export function groupGamesByPtDay<T extends { id: number; kickoffAt: Date }>(games: T[]): DayGroup<T>[] {
  const sorted = [...games].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.id - b.id);
  const groups: DayGroup<T>[] = [];
  for (const g of sorted) {
    const key = formatPT(g.kickoffAt, 'yyyy-MM-dd');
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.games.push(g);
    else groups.push({ key, label: formatPT(g.kickoffAt, 'EEEE'), games: [g] });
  }
  return groups;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** "4th" or "T-3rd" (never "of N"). */
export function rankLabel(rank: number, tied: boolean): string {
  return `${tied ? 'T-' : ''}${ordinal(rank)}`;
}

export { safeFrom } from './week-id';

export const NO_GAMES_MESSAGE = "No games yet — the season schedule hasn't been loaded.";

/** Audit line for an entry an admin edited on the player's behalf: "Edited by admin Ann · Thu 3:10 PM PT". */
export function adminEditLabel(editedByName: string | null, editedAt: Date | null): string | null {
  if (!editedAt) return null;
  return `Edited by admin ${editedByName ?? 'unknown'} · ${formatPT(editedAt, "EEE h:mm a 'PT'")}`;
}

/** "Postponed" / "Void" for games that aren't going to be scored normally; null otherwise. */
export function gameStatusLabel(status: 'scheduled' | 'final' | 'postponed' | 'void'): string | null {
  return status === 'postponed' ? 'Postponed' : status === 'void' ? 'Void' : null;
}
