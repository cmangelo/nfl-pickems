import './_env';
import { count } from 'drizzle-orm';
import { getDb, resolveDriver } from '../src/db';
import { seedAdmin } from '../src/db/queries';
import { weeks } from '../src/db/schema';
import { getEspnClient } from '../src/lib/espn';
import { loadSeasonSchedule } from '../src/lib/schedule';
import { runMigrations } from './migrate-lib';
import { resolveSeedConfig, type SeedConfig } from './seed-config';

export interface BuildDeps {
  driver: () => string;
  env: NodeJS.ProcessEnv;
  migrate: () => Promise<void>;
  seedAdmin: (cfg: SeedConfig) => Promise<{ username: string }>;
  countWeeks: () => Promise<number>;
  loadSchedule: () => Promise<{ weeks: number; games: number; fromWeek: number } | null>;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

/** Vercel build-time DB setup. Throws (fails the deploy) on migration failure or invalid admin config; ESPN problems only warn. */
export async function runVercelBuild(d: BuildDeps): Promise<void> {
  if (d.driver() !== 'neon') {
    d.log('[vercel-build] no DATABASE_URL, skipping DB setup');
    return;
  }
  d.log('[vercel-build] 1/3 applying migrations...');
  await d.migrate();
  d.log('[vercel-build] migrations applied');

  const { ADMIN_USERNAME, ADMIN_PIN, ADMIN_FIRST_NAME } = d.env;
  if (ADMIN_USERNAME && ADMIN_PIN && ADMIN_FIRST_NAME) {
    d.log('[vercel-build] 2/3 seeding admin...');
    const admin = await d.seedAdmin(resolveSeedConfig(d.env)); // throws on invalid/trivial values
    d.log(`[vercel-build] admin "${admin.username}" is ready`);
  } else {
    d.warn('[vercel-build] 2/3 ADMIN_USERNAME/ADMIN_PIN/ADMIN_FIRST_NAME not all set; skipping admin seed');
  }

  if ((await d.countWeeks()) > 0) {
    d.log('[vercel-build] 3/3 weeks already exist; skipping schedule import');
    return;
  }
  d.log('[vercel-build] 3/3 no weeks yet; importing schedule from ESPN...');
  try {
    const res = await d.loadSchedule();
    d.log(res ? `[vercel-build] imported from week ${res.fromWeek}: ${res.weeks} weeks, ${res.games} games` : '[vercel-build] ESPN has no remaining weeks this season');
  } catch (e) {
    d.warn(`[vercel-build] schedule import failed (continuing; the nightly cron or Admin > Load schedule will fill it): ${e instanceof Error ? e.message : String(e)}`);
  }
}

const realDeps: BuildDeps = {
  driver: () => resolveDriver(),
  env: process.env,
  migrate: runMigrations,
  seedAdmin: async (cfg) => seedAdmin(await getDb(), cfg),
  countWeeks: async () => {
    const [r] = await (await getDb()).select({ n: count() }).from(weeks);
    return Number(r.n);
  },
  loadSchedule: async () => {
    // Build script, not app code: the real clock is correct here.
    const res = await loadSeasonSchedule(getEspnClient(), new Date());
    return res.ok ? res : null;
  },
  log: (m) => console.log(m),
  warn: (m) => console.warn(m),
};

if (process.argv[1]?.endsWith('vercel-build.ts')) {
  runVercelBuild(realDeps).then(
    () => process.exit(0),
    (e) => {
      console.error(`[vercel-build] FAILED: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
