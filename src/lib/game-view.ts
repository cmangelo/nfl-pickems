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

/** ESPN's public CDN. Abbreviations come from ESPN, so its lowercase file names match (kc, wsh, lar, ...). */
export const ESPN_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl';

/** `500-dark` is ESPN's variant for dark backgrounds (better for navy/black logos); `500` is the standard one. */
export type LogoVariant = '500-dark' | '500';
export const LOGO_VARIANTS: LogoVariant[] = ['500-dark', '500'];

export function teamLogoUrl(abbr: string, variant: LogoVariant = '500-dark', base: string = ESPN_LOGO_BASE): string {
  return `${base}/${variant}/${encodeURIComponent(abbr.toLowerCase())}.png`;
}
