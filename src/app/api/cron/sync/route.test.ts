import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { games, weeks } from '@/db/schema';
import { freshDb } from '@/lib/testing/helpers';
import { GET } from './route';

vi.mock('@/lib/time', async (orig) => ({
  ...(await orig<typeof import('@/lib/time')>()),
  now: async () => new Date('2026-10-07T20:00:00Z'),
}));

process.env.DB_DRIVER = 'memory';
process.env.ESPN_MODE = 'fixture';

const req = (auth?: string) => new Request('http://x/api/cron/sync', { headers: auth ? { authorization: auth } : {} });

describe('GET /api/cron/sync', () => {
  beforeEach(async () => {
    await freshDb();
    process.env.CRON_SECRET = 's3cret';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('401 without or with a wrong bearer token', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer nope'))).status).toBe(401);
  });

  it('fails closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req('Bearer undefined'))).status).toBe(401);
    expect((await GET(req('Bearer '))).status).toBe(401);
  });

  it('with the right secret imports the schedule and syncs (fixture mode)', async () => {
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imports[0]).toMatchObject({ season: 2026, fromWeek: 5 });
    const db = await getDb();
    expect((await db.select().from(weeks)).length).toBeGreaterThan(0);
    expect((await db.select().from(games)).length).toBeGreaterThan(0);
  });
});
