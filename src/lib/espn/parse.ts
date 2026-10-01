import type { ScoreboardGame, Winner } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function toScore(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Turns raw ESPN scoreboard JSON into normalized games. Unknown/malformed events are skipped. */
export function parseScoreboard(raw: any): ScoreboardGame[] {
  const out: ScoreboardGame[] = [];
  for (const ev of raw?.events ?? []) {
    const comp = ev?.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    if (!ev?.id || !home || !away) continue;
    const kickoff = new Date(comp.date ?? ev.date);
    if (Number.isNaN(kickoff.getTime())) continue;

    const completed = Boolean(comp.status?.type?.completed) || comp.status?.type?.name === 'STATUS_FINAL';
    const homeScore = completed ? toScore(home.score) : null;
    const awayScore = completed ? toScore(away.score) : null;

    let winner: Winner | null = null;
    if (completed) {
      if (home.winner === true) winner = 'home';
      else if (away.winner === true) winner = 'away';
      else if (homeScore !== null && awayScore !== null) {
        winner = homeScore === awayScore ? 'tie' : homeScore > awayScore ? 'home' : 'away';
      }
    }

    out.push({
      espnId: String(ev.id),
      kickoffAt: kickoff,
      homeTeam: home.team.abbreviation,
      awayTeam: away.team.abbreviation,
      homeScore,
      awayScore,
      status: completed ? 'final' : 'scheduled',
      winner,
    });
  }
  return out.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.espnId.localeCompare(b.espnId));
}
