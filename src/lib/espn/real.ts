import { parseScoreboardFor } from './parse';
import type { EspnClient, ScoreboardParams } from './types';

export const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
/** Hard cap on one ESPN request so a hung feed can never block a page for long. */
export const ESPN_TIMEOUT_MS = 4000;

export function scoreboardUrl({ season, week, seasonType = 2 }: ScoreboardParams): string {
  return `${ESPN_SCOREBOARD_URL}?dates=${season}&seasontype=${seasonType}&week=${week}`;
}

export class RealEspnClient implements EspnClient {
  async getScoreboard(params: ScoreboardParams) {
    const res = await fetch(scoreboardUrl(params), { cache: 'no-store', signal: AbortSignal.timeout(ESPN_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ESPN scoreboard request failed: ${res.status}`);
    return parseScoreboardFor(await res.json(), params);
  }
}
