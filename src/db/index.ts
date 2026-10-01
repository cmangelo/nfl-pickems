import path from 'path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DriverName = 'pglite' | 'memory' | 'neon';

export function resolveDriver(env: NodeJS.ProcessEnv = process.env): DriverName {
  const d = env.DB_DRIVER;
  if (d === 'pglite' || d === 'memory' || d === 'neon') return d;
  return env.DATABASE_URL ? 'neon' : 'pglite';
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

type Holder = { db?: Promise<Db>; pglite?: { close(): Promise<void> } };
const g = globalThis as unknown as { __nflDb?: Holder };
const holder: Holder = (g.__nflDb ??= {});

async function create(): Promise<Db> {
  const driver = resolveDriver();
  if (driver === 'neon') {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required for the neon driver');
    return drizzle(neon(url), { schema }) as unknown as Db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = driver === 'memory' ? undefined : (process.env.PGLITE_DIR ?? '.pglite/dev');
  const client = new PGlite(dir);
  holder.pglite = client;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

/** Returns the process-wide database (pglite is single-process, so it is cached on globalThis). */
export function getDb(): Promise<Db> {
  return (holder.db ??= create());
}

/** Wipes all data and re-applies migrations. pglite only. */
export async function resetDb(): Promise<Db> {
  const driver = resolveDriver();
  if (driver === 'neon') throw new Error('resetDb is not allowed with the neon driver');
  const db = await getDb();
  await db.execute('DROP SCHEMA IF EXISTS public CASCADE' as never);
  await db.execute('DROP SCHEMA IF EXISTS drizzle CASCADE' as never);
  await db.execute('CREATE SCHEMA public' as never);
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export { schema };
