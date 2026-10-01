import { parseScoreboard } from './parse';
import type { EspnClient, ScoreboardParams } from './types';

export const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export function scoreboardUrl({ season, week, seasonType = 2 }: ScoreboardParams): string {
  return `${ESPN_SCOREBOARD_URL}?dates=${season}&seasontype=${seasonType}&week=${week}`;
}

export class RealEspnClient implements EspnClient {
  async getScoreboard(params: ScoreboardParams) {
    const res = await fetch(scoreboardUrl(params), { cache: 'no-store' });
    if (!res.ok) throw new Error(`ESPN scoreboard request failed: ${res.status}`);
    return parseScoreboard(await res.json());
  }
}
