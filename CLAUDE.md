# NFL Pick'em: agent guide

Mobile-first NFL weekly pick'em for a small friend group. Requirements: `REQUIREMENTS.md`. Build plan: `docs/IMPLEMENTATION_PROMPT.md`.

## RULES
- **Every UI change ships with a Playwright test. Every logic change ships with unit tests.**
- **Every phase or significant change must update the Playwright tests** (add or adjust specs covering the new or changed behavior) **and rerun the full Playwright suite** (`CI=1 npm run test:e2e`, both projects) before it is considered done. A change is not complete until that suite passes.
- Before committing, ALL of these must be green: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`.
- **Never run `playwright install`.** Chromium is pre-installed (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); `@playwright/test` is pinned to exactly `1.56.1` to match it. If a mismatch ever appears, set `launchOptions.executablePath` to the binary under `/opt/pw-browsers`.
- App code must NEVER call `new Date()` / `Date.now()` for "current time". Use `now()` from `src/lib/time.ts`.
- No network in tests. ESPN is always fixture-backed in tests.

## Stack
Next.js 15 (App Router, TypeScript strict, `src/`), Tailwind CSS v4, Drizzle ORM, Postgres. Production: Neon (`@neondatabase/serverless`, neon-http). Tests and local dev: PGlite (offline, embedded Postgres) with the same schema and the same drizzle-kit SQL migrations. Vitest (unit) and Playwright (e2e).

## Security rules
- **Layouts are not a security boundary.** Next.js skips layouts on partial renders (`RSC: 1` + `Next-Router-State-Tree`), so every `page.tsx` under `(app)` must itself `await requireUser()` first (admin pages: `await requireAdmin()`), every server action re-checks auth, and every `/api/test/*` route calls `testGuard()`. `src/lib/page-auth.test.ts` enforces this; `e2e/rsc-auth.spec.ts` sends the crafted request.
- Server actions validate numeric ids with `isId` (`src/lib/validate.ts`) before touching the DB. Security headers live in `next.config.ts`.

## Layout
- `src/app/`: routes (`/` redirects to `/picks` if logged in, else `/login`; `(app)/` route group = logged-in shell with header + bottom nav; `/api/test/*` are test-only)
- `src/lib/auth.ts`: `signUp`, `login` (atomic attempt reservation; 5 fails -> lock of 15 min x 2^prior lockouts, capped 24 h; counter reset only by success or admin PIN reset), `changePin`, `logout`, `getCurrentUser()`, `requireUser()` (redirects /login), `requireAdmin()` (404 for non-admins), `createSession`/`startSession`. Cookie `session` (httpOnly, lax, secure in prod, 1 yr). `src/lib/pin.ts`: scrypt `hashPin`/`verifyPin` (`scrypt$salt$hash`)
- `src/db/schema.ts`: Drizzle schema. `src/db/index.ts`: driver selection (`getDb`, `resetDb`). `src/db/queries.ts`: query helpers (`seedBase`)
- `drizzle/`: generated SQL migrations (commit them). After editing the schema run `npm run db:generate`
- `src/lib/time.ts`: `now()` plus Pacific Time helpers (week unlock/lock, DST-correct)
- `src/lib/espn/`: `EspnClient` interface, `parseScoreboard`, `RealEspnClient`, `FixtureEspnClient`, `getEspnClient()`
- `fixtures/espn/scoreboard-{season}-w{week}.json`: ESPN fixtures (hand-written in ESPN's real shape; the sandbox cannot reach ESPN)
- `e2e/`: Playwright specs and `helpers.ts`. `scripts/`: `seed.ts`, `reset.ts`, `migrate.ts`

## Commands
| Check | Command |
| --- | --- |
| Dev server | `npm run dev` (pglite at `PGLITE_DIR`, default `.pglite/dev`) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` |
| Production build | `npm run build` (plain `next build`; Vercel runs `npm run vercel-build` = `scripts/vercel-build.ts` then `next build`) |
| E2E (mobile + desktop smoke) | `npm run test:e2e` (builds, starts the server on port 3100, or `E2E_PORT` if set, with a fresh in-memory DB, TEST_MODE=1, ESPN_MODE=fixture) |
| Generate migration | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed admin (local) | `npm run db:seed` (stop the dev server first). Env `ADMIN_USERNAME`/`ADMIN_PIN`/`ADMIN_FIRST_NAME`; defaults admin/1234/Admin for local pglite only; all three required and trivial PINs refused with the neon driver or NODE_ENV=production |

Set `E2E_PORT=3101 CI=1 npm run test:e2e` to run on another port so two worktrees can run e2e concurrently (`playwright.config.ts` and `e2e/helpers.ts` both read it). Note `reuseExistingServer` is off in CI, so a busy port fails fast.

Playwright projects: `mobile` (390x844, touch, DPR 3; primary, runs everything) and `desktop` (1280x800; runs only tests with `@smoke` in the title). Workers = 1 because the single server process owns the DB. Call `resetDb(request)` in `beforeEach`.

## Env vars (see `.env.example`)
- `DATABASE_URL`: Neon connection string (production)
- `DB_DRIVER`: `pglite` | `memory` | `neon`. Default: `neon` if `DATABASE_URL` is set, else `pglite`
- `PGLITE_DIR`: pglite data dir (default `.pglite/dev`)
- `TEST_MODE=1`: enables `/api/test/*` (404 otherwise) and the `x-test-now` override. Never set in production
- `ESPN_MODE=fixture`: use `fixtures/espn/` instead of the live feed
- `THEME_TUNER=1`: staging-only accent color tuner (ignored when `VERCEL_ENV=production`)

PGlite is single-process: the server process owns the DB. Seed/reset while it runs via the `/api/test/*` routes; the scripts are for when it is stopped.

## Time control
`now()` is async (`await now()`). With `TEST_MODE=1` it honors the `x-test-now` cookie or header (ISO string); otherwise real time. In Playwright: `await setNow(context, '2026-10-07T20:00:00Z')` ("it is Wednesday"), later `setNow(context, '2026-10-09T20:00:00Z')` ("Friday"). `GET /api/test/now` echoes the effective time. PT helpers: `weekTuesday`, `weekUnlockAt` (Tue 00:00 PT), `weekLockAt` (Thu 12:00 PT, or `lockHour=9` for Thanksgiving), `formatPT`.

## ESPN fixtures
Use `getEspnClient()`. In fixture mode, fixtures exist for 2026 weeks 5 (mixed final/scheduled, one tie), 6 (all scheduled) and 12 (Thanksgiving); other weeks return `[]`. Add fixtures by dropping a file named `scoreboard-{season}-w{week}.json`. Real URL: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=N`. The parser is unit-tested against the fixture.

## Test helpers
Routes (all POST except `now`, all 404 unless TEST_MODE=1):
- `/api/test/reset`: wipe, migrate, seed admin (username `admin`, PIN `1234`, first name `Admin`)
- `/api/test/seed-week`: `{ season?, weekNumber?, numGames?, results?, tuesday?, lockAt? }` returns `{ weekId, gameIds }`
- `/api/test/set-result`: `{ gameId, winner: 'home'|'away'|'tie'|null, homeScore?, awayScore?, status?: 'postponed'|'void' }` (winner null + status marks it postponed/void)
- `/api/test/login`: `{ username }` creates a `sessions` row and sets the `session` cookie (no PIN check; creates a real session via `createSession`)
- `/api/test/import-fixture-week?week=5[&season=2026]`: imports exactly that week from the ESPN fixture via `importSeason`; returns `{ weekId, gameIds }`
- `/api/test/submit-picks`: `{ username, weekId, picks, tiebreaker, entry? }`; `picks` = `{gameId: side}` map or array of sides in kickoff order; `entry` = `'new'` or an entry_no (default: first entry); uses `submitPicks` with `asAdmin` (works on locked weeks); returns `{ entryId }`
- `/api/test/set-paid`: `{ username, weekId, paid, entryNo? }` (no entryNo = every entry of that user that week)
- `/api/test/create-user`: `{ firstName, username, pin? }` (default PIN 1234), no session
- `/api/test/set-entry-fee`: `{ weekId, cents }` (null clears) sets that week's own entry fee
- `/api/test/now`: effective `now()`

`e2e/helpers.ts` wraps them: `resetDb`, `setNow`, `clearNow`, `loginAs`, `seedWeek`, `setResult`, `importFixtureWeek`, `createUser`, `submitPicksFor`, `setPaid`, `setEntryFee`, plus UI-driven `signUpViaUi`, `loginViaUi`, `logoutViaUi`. After a failed auth server action the PIN input is cleared; wait for the POST response (see `submit` in `e2e/auth.spec.ts`) before asserting on a repeated error message.

## Selected week (`?week=`)
Every app route (`/picks`, `/leaderboard`, `/games`, `/admin/*`) takes `?week=<weekId>`. Default and fallback (unknown or not-yet-visible id) = current week. Server pages call `getSelectedWeek(searchParams.week)` (`src/lib/selected-week.ts`) -> `{ week, games, state, visibleWeeks, currentWeek, now }` (`week` null = no schedule loaded: render `<NoWeeks />`). The client header (`AppHeader`) and `BottomNav` read `?week=` via `useSearchParams` and preserve it in links; client code must import `resolveWeekId` from `src/lib/week-id.ts` (no server imports). `/weeks?week=..&from=/path` is the picker; rows link to `${from}?week=<id>` (`safeFrom` whitelists `from`). Pure view helpers (countdown, PT day grouping, rank labels) live in `src/lib/week-view.ts`. Never render "X of N players"; ranks are "4th" / "T-3rd".
In e2e, seed locked weeks with a `weekNumber` that has no ESPN fixture (e.g. 7): `/picks` and `/weeks` call `maybeRefresh`, which would otherwise merge fixture games into the seeded week.

## Leaderboard and Games views
`/leaderboard` by state: open = `PotCard` (when a fee is set) above `RevealedCard` ("Picks revealed Thu 12:00 PM PT", "N in" + first names); locked = live board (`PotCard` when a fee is set, `RankedTable` with `live` = MAX column + "OUT" tags, `NotCounted`, `RefreshButton` -> `refreshAction` -> `maybeRefresh`; "Updated X min ago · N of M games final"); final = `WeeklyReport` (winner hero + payout, podium, Most correct / Toilet bowl, average, "Games of the week" cards: upset, lock, coin flip, blowout; awards: closest tiebreaker, bad beat, contrarian; from `weekReport` in report.ts) then the standings. `RankedTable` rows: rank, `Avatar` (initial, `avatarColors`), name, "MNF 40 (±4)" (the tiebreaker guess; "TB" when the tiebreaker game isn't on Monday PT, `tiebreakerShortLabel`), a pick strip (`pickResults`, one dot per game) and CORRECT. `/leaderboard/player/[userId]?week=&entry=<entryId>` shows one player's picks (entry tabs when they have several) (reuses `picks/LockedPicks` with `other`; redirects to the board while the week is open). `/games`: open = card with count only; locked/final = per-game split counts per paid entry ("3 entries"; `entryCount`/`splitPercents` in game-view.ts) with a two-segment bar in team colors (`barColors` in team-colors.ts: primaries from `TEAM_COLORS`, lightened in OKLab to >= 2:1 on the card, home then away switch to the secondary when the two are < 15 OKLab Delta E apart; unknown teams = blue/orange; void = grey) and "BUF 40%" / "KC 60%" under its ends, plus the viewer's "Your pick" (from their own entries, even if unpaid), no names. Locked views call `maybeRefresh` on view. Live in-game display (games card and `picks/LockedPicks`, so also /picks and the player drill-down): `LiveBadge` ("Q3 · 4:12", pulsing red), scores from `displayScore` (final once settled, ESPN live fields while live) and, on picks, "Winning" / "Losing" / "Tied" from `liveStanding` (game-view.ts); live data never scores (the pick stays pending). Seed it in e2e with `setLive`. Pure copy helpers (updated-ago, upset phrasing, winner banner) in `src/lib/leaderboard-view.ts`. In e2e use `expectNoPlayerCountOf(page)` (helpers.ts): only "N of M games final" / "N of M correct" may match `\d+ of \d+`. Usernames must be 3+ chars.

## Theme
Dark, gold accent (picked with the theme tuner; `DEFAULT_THEME` in theme-tuner.ts must match). CSS variables in `src/app/globals.css`: `--bg #0f1115`, `--accent #eab308` (fills; text on it uses `text-on-accent` = `#171201`), `--accent-bright #efc646` (accent text on dark), `--on-accent #171201`, `--correct #22c55e`, `--wrong #ef4444`.
Never hard-code accent colors in components: use the Tailwind tokens or `var(--accent)` / `color-mix(in srgb, var(--accent) N%, transparent)`, so the theme tuner can restyle everything.
Theme tuner (staging only): with `THEME_TUNER=1` and `VERCEL_ENV` != `production` (`isThemeTunerEnabled`, theme-tuner.ts) the root layout marks `<html data-theme-tuner="1">`, adds `THEME_BOOT_SCRIPT` (applies a saved accent before paint) and renders `ThemeTuner` (bottom sheet opened from the account menu "Theme tuner": presets, hex/picker, auto-derived `--accent-bright`/`--on-accent` via `deriveTheme`, WCAG contrast checks, "Copy CSS" for globals.css, Reset). Saved in localStorage on that device only. The e2e server sets `THEME_TUNER=1`.

## Game statuses, lock rules, integrity helpers
- Game status: `scheduled | final | postponed | void`. ESPN parser maps STATUS_POSTPONED/CANCELED/SUSPENDED to `postponed` (counts as pending); in-progress stays `scheduled`; a "completed" event with a missing score stays `scheduled`. `void` is admin-only (`voidGame`, sets `manual_override`; "Clear override" restores): it counts for nobody and is excluded from `gamesTotal`/correct/wrong, splits still shown greyed. A week is `final` when every game is `final` or `void`.
- ESPN responses are validated (`parseScoreboardFor`/`validateScoreboardMeta`, throws `EspnMismatchError`) against the requested season, season type (default 2) and week; the fixture client goes through the same path. `RealEspnClient` has a 4 s fetch timeout. A malformed event is skipped with `console.warn`.
- `upsertScoreboardGames` never moves a game into a different season's week; same-season moves (flex) are allowed and logged.
- Lock rules: `importSeason` sets default lock = min(Thu 12 PT / Thanksgiving 9 AM PT, earliest kickoff). `setWeekLockOverride` returns `{ok}|{ok:false,error}` and refuses a lock later than the first kickoff. Non-admin `submitPicks` can't add/change a pick for a game with kickoff <= now (`game_started`).
- `submitPicks` writes the entry + picks in ONE CTE statement (atomic on neon-http and pglite). `asAdmin` + `actorId`: edits of another player's entry, or of the admin's own entry after the lock, set `entries.edited_by_admin_id/admin_edited_at` (shown by `adminEditLabel`). Admin edit-picks page hides other players' picks while the week is open.
- `resolveTiebreakerGame(week, games, now)` (weeks.ts): live before the lock, then persisted in `weeks.tiebreaker_game_id` and used from then on. `weekSummary(..., { tiebreakerGameId })`; `loadWeekSummary(week, games, now)` wires it.
- `refreshWithBudget(now, ms = 2500)` (sync.ts): pages use it instead of `maybeRefresh` so a slow ESPN never blocks rendering. `syncScores` syncs the current week plus every visible non-final week of that season (`force` also the previous week).
- `removeUser(actorId, userId, at)` soft-deletes (`users.deactivated_at`), deletes sessions and the open week's entry; past/locked entries stay. `listUsers({ includeDeactivated })`. Login/signup in `auth.ts` must reject deactivated users (wired separately).

## Domain logic (src/lib)
- `weeks.ts`: `weekState` (hidden/open/locked/final), `effectiveLock`, `defaultLockAt` (Thanksgiving = Thu 9 AM PT), `getCurrentWeek`, `getVisibleWeeks`, `setWeekLockOverride`.
- `schedule.ts`: `importSeason` (upsert weeks/games by espn_id; respects manual overrides). Script: `npm run db:import-schedule -- --season 2026 --from N`.
- `sync.ts`: `syncScores`, `maybeRefresh` (5-min throttle, never throws), `adminOverrideGame`, `clearOverride`. Cron: `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET`.
- `picks.ts`: `submitPicks` (complete form only; error codes `week_not_found|week_not_open|incomplete|invalid_pick|invalid_tiebreaker|game_started|entry_not_found|entry_limit`), `getEntries`, `getEntry` (= first entry), `listEntries` (adds `entryIndex`, `entryCount`, `label`), `deleteEntry`.
- Multiple entries: `entries.entry_no` (1..`MAX_ENTRIES_PER_WEEK` = 10, `picks-limits.ts` + DB CHECK), unique `(week_id, user_id, entry_no)`; numbers are never renumbered and labels are positional (`entryLabel` in week-view.ts: "Ann", or "Ann (1)", "Ann (2)"). `submitPicks` target: `entryId` (must be that user's entry in that week) | `newEntry` (lowest free slot, race-safe) | neither = first entry (created as 1). Paid, ranking, splits and the "N in" count are per entry; `ScoringEntry` carries `entryId`. Pages pick the entry with `selectEntry` (entry-select.ts) from `?entry=<entryId>|new&copy=<entryId>`; client forms send the target, validated by `parseEntryTarget` (validate.ts). `setPaid(entryId, paid)`.
- `scoring.ts` (pure): `scoreEntry`, `rankEntries`, `weekSummary`, `tiebreakerGame`, `eliminatedEntryIds` (paid entries that can't finish 1st or tie for it even if every pending game goes their way; a level rival only knocks one out once the tiebreaker game is final; `summary.eliminated`, empty once final; the live board tags them "OUT"). Compute on the fly; no stats table.
- `pot.ts` (pure, client-safe): `weeks.entry_fee_cents` is set per week and carries over to later weeks (`effectiveEntryFee`; `loadEntryFee(week)` in week-data.ts); pot = fee x paid entries (`computePot`, `potLine` (admin), `potDetail` (`PotCard`), `payoutLine`: co-winners split, rounded down to the cent). $0 or no fee = no pot shown. Admin sets it on Payments (`EntryFeePanel`, `setEntryFeeAction`, `admin.setEntryFee`).
- `picks-draft.ts` (client-safe): unsaved picks are kept in localStorage per user/week/entry target (`draftKey`) on the player's own `/picks` form only (`PicksForm` prop `draft`; admin edit-picks has none). A draft fills the form back in automatically on return (notice `draft-restored`; never submitted on its own) and is dropped when the saved entry changed since it started (`base`). While the form differs from the saved entry a reset button shows: "Undo changes" (back to the submitted picks) or, with nothing submitted, "Clear picks" (two taps). Cleared on a successful save; other weeks' drafts are removed on load.
- `admin.ts`: `setPaid`, `resetPin`, `setAdmin`/`removeUser` (both refuse to act on self), `toPtInputValue`/`fromPtInputValue` (datetime-local in PT <-> UTC), `listUsers`.

## Admin (`src/app/(app)/admin/**`)
`/admin` redirects to `/admin/payments` (keeps `?week=`); tabs Payments, Games, Players (`AdminTabs`). Players hides the week picker (header shows "Admin"). `admin/layout.tsx` calls `requireAdmin()` and EVERY server action in `admin/actions.ts` calls it again. Payments: one row per player, one paid switch per entry (`paid-<entryId>`, aria-label "<label> paid"). Edit picks page has entry tabs, add-entry (blank/copy; copy hidden while another player's picks are hidden) and delete-entry (any time). Games tab: sync button (`importSeason` for the selected week, then forced `syncScores`), lock override, per-game override editor. `/admin/picks/[userId]?week=` reuses `PicksForm` (props `submitAction`, `savedMessage`) and saves via `submitPicks(..., { asAdmin: true })`. In e2e the status pill for a locked, unfinished week reads "Live".

## Vercel deploys
`scripts/vercel-build.ts` (`runVercelBuild(deps)`, unit-tested) runs only with the neon driver: migrate (`scripts/migrate-lib.ts`, failure fails the deploy), seed admin if `ADMIN_*` all set (invalid = fail, unset = warn), import schedule if no weeks (ESPN failure = warn). Build scripts may use the real clock. `loadSeasonSchedule` (schedule.ts) backs both that and the admin "Load season schedule from ESPN" button (`loadScheduleAction`, shown by `NoWeeks` to admins). `isTestMode()` is false whenever `VERCEL` is set. See DEPLOY.md.
