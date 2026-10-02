import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EspnMismatchError, parseScoreboard, parseScoreboardFor } from './parse';
import { FixtureEspnClient } from './fixture';
import { RealEspnClient, scoreboardUrl } from './real';

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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseScoreboard({ events: [{ id: '1' }, null] })).toEqual([]);
    expect(parseScoreboard(undefined)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

function ev(id: string, over: { status?: string; completed?: boolean; home?: unknown; away?: unknown; teams?: boolean } = {}) {
  const team = (abbr: string) => (over.teams === false ? undefined : { abbreviation: abbr });
  return {
    id,
    date: '2026-10-11T17:00Z',
    competitions: [
      {
        date: '2026-10-11T17:00Z',
        status: { type: { name: over.status ?? 'STATUS_SCHEDULED', completed: over.completed ?? false } },
        competitors: [
          { homeAway: 'home', team: team('KC'), score: '24', ...(over.home as object) },
          { homeAway: 'away', team: team('BUF'), score: '20', ...(over.away as object) },
        ],
      },
    ],
  };
}

describe('statuses and malformed events (M7, L5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps postponed / canceled / suspended to postponed with no result', () => {
    const out = parseScoreboard({
      events: ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED'].map((status, i) => ev(`p${i}`, { status })),
    });
    expect(out.map((g) => g.status)).toEqual(['postponed', 'postponed', 'postponed']);
    for (const g of out) expect(g).toMatchObject({ homeScore: null, awayScore: null, winner: null });
  });

  it('keeps in-progress statuses scheduled', () => {
    for (const status of ['STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD', 'STATUS_DELAYED', 'STATUS_SCHEDULED']) {
      const [g] = parseScoreboard({ events: [ev('x', { status })] });
      expect(g.status).toBe('scheduled');
    }
  });

  it('a completed event with missing scores stays scheduled', () => {
    const [g] = parseScoreboard({
      events: [ev('x', { status: 'STATUS_FINAL', completed: true, home: { score: undefined }, away: { score: '' } })],
    });
    expect(g).toMatchObject({ status: 'scheduled', homeScore: null, awayScore: null, winner: null });
  });

  it('a completed event with both scores is final', () => {
    const [g] = parseScoreboard({ events: [ev('x', { status: 'STATUS_FINAL', completed: true })] });
    expect(g).toMatchObject({ status: 'final', homeScore: 24, awayScore: 20, winner: 'home' });
  });

  it('a malformed event is skipped with a warning and the rest still parse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = parseScoreboard({
      events: [ev('bad-team', { teams: false }), { id: 'no-comp' }, { id: 'no-competitors', competitions: [{}] }, ev('good')],
    });
    expect(out.map((g) => g.espnId)).toEqual(['good']);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe('response validation (M3)', () => {
  const payload = (season: unknown, type: unknown, week: unknown) => ({ season: { year: season, type }, week: { number: week }, events: [ev('a')] });

  it('accepts a matching payload, seasonType defaults to 2', () => {
    expect(parseScoreboardFor(payload(2026, 2, 5), { season: 2026, week: 5 })).toHaveLength(1);
    expect(parseScoreboardFor(payload(2026, 3, 1), { season: 2026, week: 1, seasonType: 3 })).toHaveLength(1);
  });

  it('throws a typed error for another week, season or season type', () => {
    for (const [p, params] of [
      [payload(2026, 2, 6), { season: 2026, week: 5 }],
      [payload(2025, 2, 5), { season: 2026, week: 5 }],
      [payload(2026, 1, 5), { season: 2026, week: 5 }],
      [payload(2026, 2, 5), { season: 2026, week: 5, seasonType: 3 }],
      [{ events: [ev('a')] }, { season: 2026, week: 5 }], // no season/week metadata at all
    ] as const) {
      expect(() => parseScoreboardFor(p, params)).toThrow(EspnMismatchError);
    }
    try {
      parseScoreboardFor(payload(2026, 2, 6), { season: 2026, week: 5 });
    } catch (e) {
      expect(e).toMatchObject({ name: 'EspnMismatchError', requested: { season: 2026, week: 5, seasonType: 2 }, received: { week: 6 } });
    }
  });

  it('the fixture client goes through the same validation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espn-'));
    // A week-6 payload saved under the week-5 file name.
    fs.writeFileSync(path.join(dir, 'scoreboard-2026-w5.json'), JSON.stringify(payload(2026, 2, 6)));
    fs.writeFileSync(path.join(dir, 'scoreboard-2026-w7.json'), JSON.stringify(payload(2026, 2, 7)));
    const c = new FixtureEspnClient(dir);
    await expect(c.getScoreboard({ season: 2026, week: 5 })).rejects.toBeInstanceOf(EspnMismatchError);
    expect(await c.getScoreboard({ season: 2026, week: 7 })).toHaveLength(1);
    fs.rmSync(dir, { recursive: true });
  });

  it('every shipped fixture matches its own season/week', async () => {
    const c = new FixtureEspnClient();
    for (const w of [5, 6, 12]) expect((await c.getScoreboard({ season: 2026, week: w })).length).toBeGreaterThan(0);
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

describe('RealEspnClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes an abort signal (timeout) to fetch and validates the payload', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(raw), { status: 200 }));
    expect(await new RealEspnClient().getScoreboard({ season: 2026, week: 5 })).toHaveLength(raw.events.length);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    await expect(new RealEspnClient().getScoreboard({ season: 2026, week: 6 })).rejects.toBeInstanceOf(EspnMismatchError);
  });
});
