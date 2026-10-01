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

## Layout
- `src/app/`: routes (`/` redirects to `/picks` if logged in, else `/login`; `(app)/` route group = logged-in shell with header + bottom nav; `/api/test/*` are test-only)
- `src/lib/auth.ts`: `signUp`, `login` (5 fails -> 15 min lock), `changePin`, `logout`, `getCurrentUser()`, `requireUser()` (redirects /login), `requireAdmin()` (404 for non-admins), `createSession`/`startSession`. Cookie `session` (httpOnly, lax, secure in prod, 1 yr). `src/lib/pin.ts`: scrypt `hashPin`/`verifyPin` (`scrypt$salt$hash`)
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
| Production build | `npm run build` |
| E2E (mobile + desktop smoke) | `npm run test:e2e` (builds, starts the server on port 3100, or `E2E_PORT` if set, with a fresh in-memory DB, TEST_MODE=1, ESPN_MODE=fixture) |
| Generate migration | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed admin (local) | `npm run db:seed` (stop the dev server first). Env `ADMIN_USERNAME`/`ADMIN_PIN`/`ADMIN_FIRST_NAME`; defaults admin/1234/Admin in dev only, required in production |

Set `E2E_PORT=3101 CI=1 npm run test:e2e` to run on another port so two worktrees can run e2e concurrently (`playwright.config.ts` and `e2e/helpers.ts` both read it). Note `reuseExistingServer` is off in CI, so a busy port fails fast.

Playwright projects: `mobile` (390x844, touch, DPR 3; primary, runs everything) and `desktop` (1280x800; runs only tests with `@smoke` in the title). Workers = 1 because the single server process owns the DB. Call `resetDb(request)` in `beforeEach`.

## Env vars (see `.env.example`)
- `DATABASE_URL`: Neon connection string (production)
- `DB_DRIVER`: `pglite` | `memory` | `neon`. Default: `neon` if `DATABASE_URL` is set, else `pglite`
- `PGLITE_DIR`: pglite data dir (default `.pglite/dev`)
- `TEST_MODE=1`: enables `/api/test/*` (404 otherwise) and the `x-test-now` override. Never set in production
- `ESPN_MODE=fixture`: use `fixtures/espn/` instead of the live feed

PGlite is single-process: the server process owns the DB. Seed/reset while it runs via the `/api/test/*` routes; the scripts are for when it is stopped.

## Time control
`now()` is async (`await now()`). With `TEST_MODE=1` it honors the `x-test-now` cookie or header (ISO string); otherwise real time. In Playwright: `await setNow(context, '2026-10-07T20:00:00Z')` ("it is Wednesday"), later `setNow(context, '2026-10-09T20:00:00Z')` ("Friday"). `GET /api/test/now` echoes the effective time. PT helpers: `weekTuesday`, `weekUnlockAt` (Tue 00:00 PT), `weekLockAt` (Thu 12:00 PT, or `lockHour=9` for Thanksgiving), `formatPT`.

## ESPN fixtures
Use `getEspnClient()`. In fixture mode, fixtures exist for 2026 weeks 5 (mixed final/scheduled, one tie), 6 (all scheduled) and 12 (Thanksgiving); other weeks return `[]`. Add fixtures by dropping a file named `scoreboard-{season}-w{week}.json`. Real URL: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=N`. The parser is unit-tested against the fixture.

## Test helpers
Routes (all POST except `now`, all 404 unless TEST_MODE=1):
- `/api/test/reset`: wipe, migrate, seed admin (username `admin`, PIN `1234`, first name `Admin`)
- `/api/test/seed-week`: `{ season?, weekNumber?, numGames?, results?, tuesday?, lockAt? }` returns `{ weekId, gameIds }`
- `/api/test/set-result`: `{ gameId, winner: 'home'|'away'|'tie'|null, homeScore?, awayScore? }`
- `/api/test/login`: `{ username }` creates a `sessions` row and sets the `session` cookie (no PIN check; creates a real session via `createSession`)
- `/api/test/import-fixture-week?week=5[&season=2026]`: imports exactly that week from the ESPN fixture via `importSeason`; returns `{ weekId, gameIds }`
- `/api/test/submit-picks`: `{ username, weekId, picks, tiebreaker }`; `picks` = `{gameId: side}` map or array of sides in kickoff order; uses `submitPicks` with `asAdmin` (works on locked weeks)
- `/api/test/set-paid`: `{ username, weekId, paid }`
- `/api/test/create-user`: `{ firstName, username, pin? }` (default PIN 1234), no session
- `/api/test/now`: effective `now()`

`e2e/helpers.ts` wraps them: `resetDb`, `setNow`, `clearNow`, `loginAs`, `seedWeek`, `setResult`, `importFixtureWeek`, `createUser`, `submitPicksFor`, `setPaid`, plus UI-driven `signUpViaUi`, `loginViaUi`, `logoutViaUi`. After a failed auth server action the PIN input is cleared; wait for the POST response (see `submit` in `e2e/auth.spec.ts`) before asserting on a repeated error message.

## Selected week (`?week=`)
Every app route (`/picks`, `/leaderboard`, `/games`, `/admin/*`) takes `?week=<weekId>`. Default and fallback (unknown or not-yet-visible id) = current week. Server pages call `getSelectedWeek(searchParams.week)` (`src/lib/selected-week.ts`) -> `{ week, games, state, visibleWeeks, currentWeek, now }` (`week` null = no schedule loaded: render `<NoWeeks />`). The client header (`AppHeader`) and `BottomNav` read `?week=` via `useSearchParams` and preserve it in links; client code must import `resolveWeekId` from `src/lib/week-id.ts` (no server imports). `/weeks?week=..&from=/path` is the picker; rows link to `${from}?week=<id>` (`safeFrom` whitelists `from`). Pure view helpers (countdown, PT day grouping, rank labels) live in `src/lib/week-view.ts`. Never render "X of N players"; ranks are "4th" / "T-3rd".
In e2e, seed locked weeks with a `weekNumber` that has no ESPN fixture (e.g. 7): `/picks` and `/weeks` call `maybeRefresh`, which would otherwise merge fixture games into the seeded week.

## Theme
Dark, teal accent. CSS variables in `src/app/globals.css`: `--bg #0f1115`, `--accent #14b8a6`, `--accent-bright #2dd4bf`, `--correct #22c55e`, `--wrong #ef4444`.

## Domain logic (src/lib)
- `weeks.ts`: `weekState` (hidden/open/locked/final), `effectiveLock`, `defaultLockAt` (Thanksgiving = Thu 9 AM PT), `getCurrentWeek`, `getVisibleWeeks`, `setWeekLockOverride`.
- `schedule.ts`: `importSeason` (upsert weeks/games by espn_id; respects manual overrides). Script: `npm run db:import-schedule -- --season 2026 --from N`.
- `sync.ts`: `syncScores`, `maybeRefresh` (5-min throttle, never throws), `adminOverrideGame`, `clearOverride`. Cron: `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET`.
- `picks.ts`: `submitPicks` (complete form only; error codes `week_not_found|week_not_open|incomplete|invalid_pick|invalid_tiebreaker`), `getEntry`, `listEntries`.
- `scoring.ts` (pure): `scoreEntry`, `rankEntries`, `weekSummary`, `tiebreakerGame`. Compute on the fly; no stats table.
- `admin.ts`: `setPaid`, `resetPin`, `setAdmin`/`removeUser` (both refuse to act on self), `toPtInputValue`/`fromPtInputValue` (datetime-local in PT <-> UTC), `listUsers`.

## Admin (`src/app/(app)/admin/**`)
`/admin` redirects to `/admin/payments` (keeps `?week=`); tabs Payments, Games, Players (`AdminTabs`). Players hides the week picker (header shows "Admin"). `admin/layout.tsx` calls `requireAdmin()` and EVERY server action in `admin/actions.ts` calls it again. Games tab: sync button (`importSeason` for the selected week, then forced `syncScores`), lock override, per-game override editor. `/admin/picks/[userId]?week=` reuses `PicksForm` (props `submitAction`, `savedMessage`) and saves via `submitPicks(..., { asAdmin: true })`. In e2e the status pill for a locked, unfinished week reads "Live".
