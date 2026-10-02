import type { LiveState, ScoreboardGame, ScoreboardParams, Winner } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The response is for a different season / season type / week than the one requested. */
export class EspnMismatchError extends Error {
  constructor(
    message: string,
    public readonly requested: { season: number; week: number; seasonType: number },
    public readonly received: { season: unknown; week: unknown; seasonType: unknown },
  ) {
    super(message);
    this.name = 'EspnMismatchError';
  }
}

/**
 * Throws EspnMismatchError unless raw.season.year, raw.season.type and raw.week.number match the
 * request (seasonType defaults to 2 = regular season). ESPN silently serves the current week when
 * a request is off, which would otherwise be imported into the wrong week.
 */
export function validateScoreboardMeta(raw: any, { season, week, seasonType = 2 }: ScoreboardParams): void {
  const got = { season: raw?.season?.year, week: raw?.week?.number, seasonType: raw?.season?.type };
  if (Number(got.season) !== season || Number(got.week) !== week || Number(got.seasonType) !== seasonType) {
    throw new EspnMismatchError(
      `ESPN returned season ${got.season} type ${got.seasonType} week ${got.week}; expected season ${season} type ${seasonType} week ${week}`,
      { season, week, seasonType },
      got,
    );
  }
}

/** Validates the payload against the request, then parses it. Used by every client. */
export function parseScoreboardFor(raw: any, params: ScoreboardParams): ScoreboardGame[] {
  validateScoreboardMeta(raw, params);
  return parseScoreboard(raw);
}

function toScore(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const POSTPONED = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_SUSPENDED']);

function parseEvent(ev: any): ScoreboardGame | null {
  const comp = ev?.competitions?.[0];
  const competitors: any[] = comp?.competitors ?? [];
  const home = competitors.find((c) => c?.homeAway === 'home');
  const away = competitors.find((c) => c?.homeAway === 'away');
  if (!ev?.id || !home || !away) return null;
  const homeTeam = home.team?.abbreviation;
  const awayTeam = away.team?.abbreviation;
  if (typeof homeTeam !== 'string' || typeof awayTeam !== 'string' || !homeTeam || !awayTeam) return null;
  const kickoff = new Date(comp.date ?? ev.date);
  if (Number.isNaN(kickoff.getTime())) return null;

  const statusName = comp.status?.type?.name;
  const flaggedComplete = Boolean(comp.status?.type?.completed) || statusName === 'STATUS_FINAL';
  const rawHome = toScore(home.score);
  const rawAway = toScore(away.score);
  // A "completed" event without both scores is treated as not final yet (never score from a guess).
  const completed = flaggedComplete && rawHome !== null && rawAway !== null;
  const homeScore = completed ? rawHome : null;
  const awayScore = completed ? rawAway : null;

  let winner: Winner | null = null;
  if (completed) {
    if (home.winner === true) winner = 'home';
    else if (away.winner === true) winner = 'away';
    else winner = homeScore === awayScore ? 'tie' : homeScore! > awayScore! ? 'home' : 'away';
  }

  const status = completed ? 'final' : !flaggedComplete && POSTPONED.has(statusName) ? 'postponed' : 'scheduled';
  let live: LiveState | null = null;
  if (status === 'scheduled' && comp.status?.type?.state === 'in') {
    const period = Number(comp.status?.period);
    const clock = comp.status?.displayClock;
    live = {
      homeScore: rawHome,
      awayScore: rawAway,
      period: Number.isInteger(period) && period > 0 ? period : null,
      clock: typeof clock === 'string' && clock ? clock : null,
      status: typeof statusName === 'string' ? statusName : 'STATUS_IN_PROGRESS',
    };
  }

  return {
    espnId: String(ev.id),
    kickoffAt: kickoff,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    status,
    winner,
    live,
  };
}

/**
 * Turns raw ESPN scoreboard JSON into normalized games. A malformed event (missing team or
 * competitors, bad date) is skipped with a console.warn instead of failing the whole sync.
 */
export function parseScoreboard(raw: any): ScoreboardGame[] {
  const out: ScoreboardGame[] = [];
  for (const ev of raw?.events ?? []) {
    let game: ScoreboardGame | null = null;
    try {
      game = parseEvent(ev);
    } catch {
      game = null;
    }
    if (game) out.push(game);
    else console.warn(`ESPN: skipping malformed event ${ev?.id ?? '(no id)'}`);
  }
  return out.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.espnId.localeCompare(b.espnId));
}
