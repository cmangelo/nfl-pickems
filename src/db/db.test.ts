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
