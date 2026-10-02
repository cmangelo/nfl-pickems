# Decisions

Ambiguities resolved during implementation (simplest reasonable option).

- **Next.js 15.5** (App Router) rather than 16, for stability; Tailwind v4; Drizzle ORM.
- **DB drivers:** `neon` (neon-http) in production; `pglite` (on-disk) for local dev; `memory` pglite for e2e. Same drizzle migrations for all.
- **`now()` is async** because Next 15 `headers()`/`cookies()` are async. Test override via `x-test-now` header or cookie, only when `TEST_MODE=1`.
- **ESPN fixture is hand-written** in ESPN's scoreboard shape: outbound network to site.api.espn.com is blocked in the build environment, so no real response could be captured.
- **Playwright pinned to 1.56.1** to match the pre-installed Chromium build (1194).
- **E2E runs with 1 worker:** the single server process owns the in-memory DB.
- **Week picker list shows rank without "of N"** (wireframe shows "4th of 9"); dropped to honor the "never show X of N" rule.
- **Nightly cron is `0 8 * * *` UTC** (vercel.json): Vercel cron is UTC-only with no DST. 08:00 UTC = 00:00 PST / 01:00 PDT, the earliest fixed time never before PT midnight, still hours after Monday night ends. Refresh-on-view covers the gap. `/api/cron/sync` requires `Authorization: Bearer $CRON_SECRET` and fails closed if unset.
- **Scoring:** a pick on an NFL tie counts as settled-wrong (no point). A week with no games is never `final`. Stats, splits, ranking and upset use paid entries only; unpaid appear only under "not counted".
- **Tiebreaker** applies only once the tiebreaker game (last Monday PT kickoff, else last game) is final.
- **Upset of the week:** final non-tie game with the most counted players wrong; ties broken by highest wrong fraction, then latest kickoff. Names of correct pickers shown only when ≤3.
- **ESPN failures on refresh-on-view** never throw; a 60 s in-process backoff applies. `clearOverride` resets the game to scheduled for the next sync to refill.
- **Schedule re-import** updates kickoffs/teams/unlock/lock but never an admin lock override or a manually overridden game's score.
- **Selected week** is the `?week=<id>` search param on every app route; unknown/future ids fall back to the current week.
- **Pre-lock "N in"** counts every submitted entry (paid or not) and lists first names only; no "not yet" list. Player drill-down redirects to the leaderboard until the lock.
- **Games tab "Your pick"** marker comes from the viewer's own entry even if unpaid; the split counts use paid entries only.
- **Admin score override** always marks the game final (and `manual`, so sync won't overwrite it until "Clear override").
- **Admins can't demote or remove themselves**, which guarantees at least one admin remains.
- **Countdown** on My Picks is rendered server-side (doesn't tick live).
- **Pre-launch integrity fixes:** default lock = min(Thu 12 PT, first kickoff) and admin lock overrides can't exceed the first kickoff; non-admin saves can't touch a started game; entry+picks written in one CTE statement (works on neon-http without transactions); ESPN payloads must match the requested season/type/week; users are soft-deleted (open-week entry dropped, past results kept, username reserved); admin edits are audited on the entry and an admin can't edit their own entry after the lock or see others' picks before it; postponed = pending, void = counts for nobody (week final when all games are final or void); the tiebreaker game is frozen at the lock (stays void-less: a voided tiebreaker game means the tiebreaker never applies); `syncScores` also syncs older non-final visible weeks of the season.
