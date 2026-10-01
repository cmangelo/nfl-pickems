import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games } from '@/db/schema';
import { adminOverrideGame, clearOverride, getLastSyncedAt, maybeRefresh, syncScores } from './sync';
import { freshDb, makeWeek, sbGame, StubEspnClient } from './testing/helpers';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);
const W4 = { weekNumber: 4, unlockAt: d('2026-09-29T07:00:00Z'), lockAt: d('2026-10-01T19:00:00Z') };
const W5 = { weekNumber: 5, unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') };
const NOW = d('2026-10-12T20:00:00Z'); // Sunday of week 5

async function game(id: number) {
  const db = await getDb();
  return (await db.select().from(games).where(eq(games.id, id)))[0];
}

describe('syncScores', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('writes finals, winner (incl. tie) and kickoff changes for current and previous week', async () => {
    const prev = await makeWeek(W4, [{ espnId: 'p1', status: 'scheduled' }]);
    const cur = await makeWeek(W5, [{ espnId: 'c1' }, { espnId: 'c2' }, { espnId: 'c3' }]);
    const client = new StubEspnClient({
      '2026-4': [sbGame('p1', '2026-10-02T00:15:00Z', { homeScore: 9, awayScore: 6, status: 'final', winner: 'home' })],
      '2026-5': [
        sbGame('c1', '2026-10-11T17:00:00Z', { homeScore: 20, awayScore: 24, status: 'final', winner: 'away' }),
        sbGame('c2', '2026-10-11T18:00:00Z', { homeScore: 17, awayScore: 17, status: 'final', winner: 'tie' }),
        sbGame('c3', '2026-10-13T01:15:00Z'), // flexed, still scheduled
      ],
    });
    const out = await syncScores({ client, now: NOW });
    expect(out.weeksSynced).toEqual([5, 4]);
    expect(await game(prev.games[0].id)).toMatchObject({ status: 'final', winner: 'home', homeScore: 9 });
    expect(await game(cur.games[0].id)).toMatchObject({ status: 'final', winner: 'away', awayScore: 24 });
    expect(await game(cur.games[1].id)).toMatchObject({ winner: 'tie' });
    expect(await game(cur.games[2].id)).toMatchObject({ status: 'scheduled', kickoffAt: d('2026-10-13T01:15:00Z') });
    expect(await getLastSyncedAt()).toEqual(NOW);
  });

  it('skips the previous week when it is already final (unless force)', async () => {
    await makeWeek(W4, [{ espnId: 'p1', status: 'final', winner: 'home', homeScore: 1, awayScore: 0 }]);
    await makeWeek(W5, [{ espnId: 'c1' }]);
    const client = new StubEspnClient();
    expect((await syncScores({ client, now: NOW })).weeksSynced).toEqual([5]);
    expect((await syncScores({ client, now: NOW, force: true })).weeksSynced).toEqual([5, 4]);
  });

  it('never overwrites a manual override', async () => {
    const cur = await makeWeek(W5, [{ espnId: 'c1' }]);
    await adminOverrideGame(cur.games[0].id, { homeScore: 30, awayScore: 3 });
    const client = new StubEspnClient({
      '2026-5': [sbGame('c1', '2026-10-11T17:00:00Z', { homeScore: 0, awayScore: 7, status: 'final', winner: 'away' })],
    });
    await syncScores({ client, now: NOW });
    expect(await game(cur.games[0].id)).toMatchObject({ homeScore: 30, awayScore: 3, winner: 'home', manualOverride: true });
  });

  it('does nothing but record sync when there is no current week', async () => {
    const client = new StubEspnClient();
    expect((await syncScores({ client, now: NOW })).weeksSynced).toEqual([]);
    expect(client.calls).toEqual([]);
  });
});

describe('overrides', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('sets final, derives winner, honors explicit winner, and can be cleared', async () => {
    const { games: gs } = await makeWeek(W5, [{}, {}, {}]);
    await adminOverrideGame(gs[0].id, { homeScore: 3, awayScore: 10 });
    expect(await game(gs[0].id)).toMatchObject({ status: 'final', winner: 'away', manualOverride: true });
    await adminOverrideGame(gs[1].id, { homeScore: 7, awayScore: 7 });
    expect(await game(gs[1].id)).toMatchObject({ winner: 'tie' });
    await adminOverrideGame(gs[2].id, { homeScore: 7, awayScore: 7, winner: 'home' });
    expect(await game(gs[2].id)).toMatchObject({ winner: 'home' });
    await clearOverride(gs[0].id);
    expect(await game(gs[0].id)).toMatchObject({ status: 'scheduled', winner: null, homeScore: null, manualOverride: false });
    await expect(adminOverrideGame(99999, { homeScore: 1, awayScore: 0 })).rejects.toThrow();
    await expect(adminOverrideGame(gs[0].id, { homeScore: -1, awayScore: 0 })).rejects.toThrow();
  });
});

describe('maybeRefresh', () => {
  beforeEach(async () => {
    await freshDb();
    await makeWeek(W5, [{ espnId: 'c1' }]);
  });

  it('runs when never synced, then not again within 5 minutes, then again after', async () => {
    const client = new StubEspnClient();
    const r1 = await maybeRefresh(NOW, client);
    expect(r1.ran).toBe(true);
    expect(r1.lastSyncedAt).toEqual(NOW);
    const r2 = await maybeRefresh(d('2026-10-12T20:04:59Z'), client);
    expect(r2).toMatchObject({ ran: false, lastSyncedAt: NOW });
    const t3 = d('2026-10-12T20:05:00Z');
    const r3 = await maybeRefresh(t3, client);
    expect(r3).toMatchObject({ ran: true, lastSyncedAt: t3 });
  });

  it('dedupes concurrent calls into one sync', async () => {
    const client = new StubEspnClient();
    const results = await Promise.all([maybeRefresh(NOW, client), maybeRefresh(NOW, client), maybeRefresh(NOW, client)]);
    expect(results.every((r) => r.ran)).toBe(true);
    expect(client.calls).toHaveLength(1); // current week only, one fetch
  });

  it('swallows ESPN failures and backs off', async () => {
    const bad = { calls: 0, async getScoreboard(): Promise<never> { this.calls++; throw new Error('espn down'); } };
    const r = await maybeRefresh(NOW, bad);
    expect(r).toMatchObject({ ran: false, error: 'espn down', lastSyncedAt: null });
    await maybeRefresh(d('2026-10-12T20:00:30Z'), bad);
    expect(bad.calls).toBe(1); // backed off
    await maybeRefresh(d('2026-10-12T20:01:30Z'), bad);
    expect(bad.calls).toBe(2);
  });
});
