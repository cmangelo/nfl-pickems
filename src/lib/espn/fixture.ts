import fs from 'fs/promises';
import path from 'path';
import { parseScoreboard } from './parse';
import type { EspnClient, ScoreboardParams } from './types';

export const FIXTURE_DIR = path.join(process.cwd(), 'fixtures', 'espn');

/** Reads fixtures/espn/scoreboard-{season}-w{week}.json. Missing file => empty week. */
export class FixtureEspnClient implements EspnClient {
  constructor(private dir: string = FIXTURE_DIR) {}

  async getScoreboard({ season, week }: ScoreboardParams) {
    const file = path.join(this.dir, `scoreboard-${season}-w${week}.json`);
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    return parseScoreboard(JSON.parse(text));
  }
}
