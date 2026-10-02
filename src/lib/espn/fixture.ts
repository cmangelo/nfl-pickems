import fs from 'fs/promises';
import path from 'path';
import { parseScoreboardFor } from './parse';
import type { EspnClient, ScoreboardParams } from './types';

export const FIXTURE_DIR = path.join(process.cwd(), 'fixtures', 'espn');

/** Reads fixtures/espn/scoreboard-{season}-w{week}.json. Missing file => empty week. */
export class FixtureEspnClient implements EspnClient {
  constructor(private dir: string = FIXTURE_DIR) {}

  async getScoreboard(params: ScoreboardParams) {
    const { season, week } = params;
    const file = path.join(this.dir, `scoreboard-${season}-w${week}.json`);
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    return parseScoreboardFor(JSON.parse(text), params);
  }
}
