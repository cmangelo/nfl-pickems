import './_env';
import { getDb } from '../src/db';
import { getEspnClient } from '../src/lib/espn';
import { findStartWeek, importSeason, seasonOf } from '../src/lib/schedule';

// Usage: npm run db:import-schedule -- --season 2026 --from 5
// Without --from, starts at the week containing today (no backfill). Stop the dev server first (pglite is single-process).
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  await getDb();
  const client = getEspnClient();
  const season = Number(arg('season') ?? seasonOf(new Date()));
  let fromWeek = arg('from') ? Number(arg('from')) : null;
  if (fromWeek === null) fromWeek = await findStartWeek(client, season, new Date());
  if (fromWeek === null) {
    console.log(`no remaining weeks found for season ${season}`);
    return;
  }
  const res = await importSeason({ season, fromWeek, client });
  console.log(`imported season ${season} from week ${fromWeek}: ${res.weeks} weeks, ${res.games} games`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
