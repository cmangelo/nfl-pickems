import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseScoreboard } from './parse';
import { FixtureEspnClient } from './fixture';
import { scoreboardUrl } from './real';

const raw = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'fixtures/espn/scoreboard-2026-w5.json'), 'utf8'),
);

describe('parseScoreboard', () => {
  const games = parseScoreboard(raw);

  it('parses every event, ordered by kickoff', () => {
    expect(games).toHaveLength(raw.events.length);
    for (let i = 1; i < games.length; i++) {
      expect(games[i].kickoffAt.getTime()).toBeGreaterThanOrEqual(games[i - 1].kickoffAt.getTime());
    }
  });

  it('normalizes a final game', () => {
    const g = games[0];
    expect(g).toMatchObject({ homeTeam: 'KC', awayTeam: 'BUF', homeScore: 27, awayScore: 24, status: 'final', winner: 'home' });
    expect(g.kickoffAt.toISOString()).toBe('2026-10-09T00:15:00.000Z');
  });

  it('handles scheduled games with no scores or winner', () => {
    const scheduled = games.filter((g) => g.status === 'scheduled');
    expect(scheduled.length).toBeGreaterThan(0);
    for (const g of scheduled) expect(g).toMatchObject({ homeScore: null, awayScore: null, winner: null });
  });

  it('detects a tie', () => {
    const ties = games.filter((g) => g.winner === 'tie');
    expect(ties).toHaveLength(1);
    expect(ties[0].homeScore).toBe(ties[0].awayScore);
  });

  it('includes a Monday night game (PT)', () => {
    const last = games[games.length - 1];
    expect(last.kickoffAt.toISOString()).toBe('2026-10-13T00:15:00.000Z'); // Mon 5:15 PM PT
  });

  it('skips malformed events', () => {
    expect(parseScoreboard({ events: [{ id: '1' }, null] })).toEqual([]);
    expect(parseScoreboard(undefined)).toEqual([]);
  });
});

describe('FixtureEspnClient', () => {
  it('serves the fixture for week 5 and empty for weeks without a fixture', async () => {
    const c = new FixtureEspnClient();
    expect(await c.getScoreboard({ season: 2026, week: 5 })).toHaveLength(raw.events.length);
    expect(await c.getScoreboard({ season: 2026, week: 7 })).toEqual([]);
  });
});

describe('scoreboardUrl', () => {
  it('builds the ESPN url', () => {
    expect(scoreboardUrl({ season: 2026, week: 5 })).toBe(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=5',
    );
  });
});
