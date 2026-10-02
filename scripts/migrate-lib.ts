import path from 'path';
import { databaseUrl, getDb, resolveDriver } from '../src/db';

/** Applies drizzle migrations: neon-http migrator for neon, open-time migration for pglite. */
export async function runMigrations(): Promise<void> {
  if (resolveDriver() === 'neon') {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    await migrate(drizzle(neon(databaseUrl()!)), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  } else {
    await getDb(); // pglite: migrations are applied on open
  }
  console.log('migrations applied');
}
