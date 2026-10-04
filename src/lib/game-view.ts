/** Pure display helpers for a single game (live clock label, team logo URL). Safe to import from client code. */

export interface LiveFields {
  status: 'scheduled' | 'final' | 'postponed' | 'void';
  liveStatus: string | null;
  livePeriod: number | null;
  liveClock: string | null;
}

/** "Q1".."Q4", "OT", "2OT", ... */
export function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? 'OT' : `${period - 4}OT`;
}

/**
 * "Q3 · 4:12", "Halftime", "End of Q1", "OT · 2:00", "Delayed"; null when the game is not live
 * (only a game still `scheduled` with ESPN live data is live; final/postponed/void never are).
 */
export function liveLabel(g: LiveFields): string | null {
  if (g.status !== 'scheduled' || !g.liveStatus) return null;
  if (g.liveStatus === 'STATUS_HALFTIME') return 'Halftime';
  if (g.liveStatus === 'STATUS_DELAYED') return 'Delayed';
  const p = g.livePeriod;
  if (p === null) return 'Live';
  if (g.liveStatus === 'STATUS_END_PERIOD') return `End of ${periodLabel(p)}`;
  return g.liveClock ? `${periodLabel(p)} · ${g.liveClock}` : periodLabel(p);
}

export interface ScoreFields extends LiveFields {
  winner: 'home' | 'away' | 'tie' | null;
  homeScore: number | null;
  awayScore: number | null;
  liveHomeScore: number | null;
  liveAwayScore: number | null;
}

export interface DisplayScore {
  home: number;
  away: number;
  /** True for ESPN's in-game score (display only, never scored). */
  live: boolean;
}

/** The score to show: the final score once settled, ESPN's in-game score while live, otherwise null. */
export function displayScore(g: ScoreFields): DisplayScore | null {
  if (g.status === 'final' && g.winner !== null) {
    return g.homeScore !== null && g.awayScore !== null ? { home: g.homeScore, away: g.awayScore, live: false } : null;
  }
  if (liveLabel(g) === null || g.liveHomeScore === null || g.liveAwayScore === null) return null;
  return { home: g.liveHomeScore, away: g.liveAwayScore, live: true };
}

export type LiveStanding = 'leading' | 'trailing' | 'tied';

/** How a pick is doing in a live game; null when the game isn't live or there is no pick. */
export function liveStanding(pick: 'home' | 'away' | undefined, score: DisplayScore | null): LiveStanding | null {
  if (!pick || !score?.live) return null;
  const mine = score[pick];
  const theirs = score[pick === 'home' ? 'away' : 'home'];
  return mine > theirs ? 'leading' : mine < theirs ? 'trailing' : 'tied';
}

/** ESPN's public CDN. Abbreviations come from ESPN, so its lowercase file names match (kc, wsh, lar, ...). */
export const ESPN_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl';

/** `500-dark` is ESPN's variant for dark backgrounds (better for navy/black logos); `500` is the standard one. */
export type LogoVariant = '500-dark' | '500';
export const LOGO_VARIANTS: LogoVariant[] = ['500-dark', '500'];

/** Fallback order of logo variants: standard first on a light surface (e.g. a selected pick), dark first otherwise. */
export function logoVariants(onLight: boolean): LogoVariant[] {
  return onLight ? ['500', '500-dark'] : LOGO_VARIANTS;
}

export function teamLogoUrl(abbr: string, variant: LogoVariant = '500-dark', base: string = ESPN_LOGO_BASE): string {
  return `${base}/${variant}/${encodeURIComponent(abbr.toLowerCase())}.png`;
}

/** "1 entry" / "3 entries": pick splits count entries (a player may have several). */
export const entryCount = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/**
 * Whole-number percentages of a two-way pick split that always add up to 100 (the away share is
 * rounded, home takes the rest). Null when nobody is counted (no split to show).
 */
export function splitPercents(away: number, home: number): { away: number; home: number } | null {
  const total = away + home;
  if (total <= 0) return null;
  const a = Math.round((away / total) * 100);
  return { away: a, home: 100 - a };
}
