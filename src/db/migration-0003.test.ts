/** Migration 0003 (multiple entries) must apply over existing rows and be safe to re-run after a partial apply. */
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';
it('0003 applies on existing data and re-runs cleanly', async () => {
  const db = new PGlite();
  for (const f of ['0000_naive_lethal_legion', '0001_windy_frightful_four', '0002_tidy_reptil']) {
    for (const s of readFileSync(`drizzle/${f}.sql`, 'utf8').split('--> statement-breakpoint')) if (s.trim()) await db.exec(s);
  }
  await db.exec(`INSERT INTO users (first_name, username, pin_hash) VALUES ('A','aaa','x');
    INSERT INTO weeks (season, week_number, unlock_at, lock_at) VALUES (2026,5,now(),now());
    INSERT INTO entries (week_id, user_id, tiebreaker) VALUES (1,1,40);`);
  const sql = readFileSync('drizzle/0003_deep_moon_knight.sql', 'utf8').split('--> statement-breakpoint');
  for (const s of sql) await db.exec(s);
  // A partial earlier run (first two statements) followed by a full re-run must also succeed.
  for (const s of sql) await db.exec(s);
  const r = await db.query<{ entry_no: number }>('SELECT entry_no FROM entries');
  expect(r.rows).toEqual([{ entry_no: 1 }]);
  await db.exec(`INSERT INTO entries (week_id, user_id, entry_no, tiebreaker) VALUES (1,1,2,41)`);
  await expect(db.exec(`INSERT INTO entries (week_id, user_id, entry_no, tiebreaker) VALUES (1,1,2,41)`)).rejects.toThrow();
  await expect(db.exec(`INSERT INTO entries (week_id, user_id, entry_no, tiebreaker) VALUES (1,1,11,41)`)).rejects.toThrow();
});
