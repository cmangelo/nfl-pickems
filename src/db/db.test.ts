import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env.DB_DRIVER = 'memory';

describe('db (pglite memory + drizzle migrations)', () => {
  let mod: typeof import('./index');
  beforeAll(async () => {
    mod = await import('./index');
  });

  it('applies migrations and seeds the admin', async () => {
    const { resetDb } = mod;
    const { seedBase } = await import('./queries');
    const db = await resetDb();
    const admin = await seedBase(db);
    expect(admin).toMatchObject({ username: 'admin', firstName: 'Admin', isAdmin: true });
    expect((await seedBase(db)).id).toBe(admin.id); // idempotent
  });

  it('enforces case-insensitive unique usernames', async () => {
    const db = await mod.getDb();
    const { users } = await import('./schema');
    await expect(
      db.insert(users).values({ firstName: 'X', username: 'ADMIN', pinHash: 'x' }),
    ).rejects.toThrow();
    const rows = await db.execute(sql`select count(*)::int as n from users`);
    expect((rows as unknown as { rows: { n: number }[] }).rows[0].n).toBe(1);
  });
});

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('database URL and driver resolution', () => {
  it('prefers DATABASE_URL, then POSTGRES_URL, then a prefixed *_DATABASE_URL', async () => {
    const { databaseUrl } = await import('./index');
    expect(databaseUrl(env({ DATABASE_URL: 'a', POSTGRES_URL: 'b' }))).toBe('a');
    expect(databaseUrl(env({ POSTGRES_URL: 'b' }))).toBe('b');
    expect(databaseUrl(env({ STORAGE_DATABASE_URL: 'c' }))).toBe('c');
    expect(databaseUrl(env({ NEON_POSTGRES_URL: 'd' }))).toBe('d');
    expect(databaseUrl(env({ DATABASE_URL_UNPOOLED: 'x' }))).toBeUndefined();
    expect(databaseUrl(env({}))).toBeUndefined();
  });

  it('uses neon when any database URL is present', async () => {
    const { resolveDriver } = await import('./index');
    expect(resolveDriver(env({ STORAGE_DATABASE_URL: 'postgres://x' }))).toBe('neon');
    expect(resolveDriver(env({}))).toBe('pglite');
  });

  it('refuses the embedded database on Vercel with a clear message', async () => {
    const { resolveDriver } = await import('./index');
    expect(() => resolveDriver(env({ VERCEL: '1' }))).toThrow(/No database URL found/);
    expect(resolveDriver(env({ VERCEL: '1', DATABASE_URL: 'postgres://x' }))).toBe('neon');
  });
});
