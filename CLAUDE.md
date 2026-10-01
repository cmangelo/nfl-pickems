# NFL Pick'em: agent guide

Mobile-first NFL weekly pick'em for a small friend group. Requirements: `REQUIREMENTS.md`. Build plan: `docs/IMPLEMENTATION_PROMPT.md`.

## RULES
- **Every UI change ships with a Playwright test. Every logic change ships with unit tests.**
- Before committing, ALL of these must be green: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`.
- **Never run `playwright install`.** Chromium is pre-installed (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); `@playwright/test` is pinned to exactly `1.56.1` to match it. If a mismatch ever appears, set `launchOptions.executablePath` to the binary under `/opt/pw-browsers`.
- App code must NEVER call `new Date()` / `Date.now()` for "current time". Use `now()` from `src/lib/time.ts`.
- No network in tests. ESPN is always fixture-backed in tests.

## Stack
Next.js 15 (App Router, TypeScript strict, `src/`), Tailwind CSS v4, Drizzle ORM, Postgres. Production: Neon (`@neondatabase/serverless`, neon-http). Tests and local dev: PGlite (offline, embedded Postgres) with the same schema and the same drizzle-kit SQL migrations. Vitest (unit) and Playwright (e2e).

## Layout
- `src/app/`: routes (`/` redirects to `/login`; `/api/test/*` are test-only)
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
| E2E (mobile + desktop smoke) | `npm run test:e2e` (builds, starts the server on port 3100 with a fresh in-memory DB, TEST_MODE=1, ESPN_MODE=fixture) |
| Generate migration | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed admin (local) | `npm run db:seed` (stop the dev server first) |

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
Use `getEspnClient()`. In fixture mode, `scoreboard-2026-w5.json` is served for season 2026 week 5; other weeks return `[]`. Add fixtures by dropping a file named `scoreboard-{season}-w{week}.json`. Real URL: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=N`. The parser is unit-tested against the fixture.

## Test helpers
Routes (all POST except `now`, all 404 unless TEST_MODE=1):
- `/api/test/reset`: wipe, migrate, seed admin (username `admin`, PIN `1234`, first name `Admin`)
- `/api/test/seed-week`: `{ season?, weekNumber?, numGames?, results?, tuesday?, lockAt? }` returns `{ weekId, gameIds }`
- `/api/test/set-result`: `{ gameId, winner: 'home'|'away'|'tie'|null, homeScore?, awayScore? }`
- `/api/test/login`: `{ username }` creates a `sessions` row and sets the `session` cookie (no PIN check; real auth is Phase 1)
- `/api/test/now`: effective `now()`

`e2e/helpers.ts` wraps them: `resetDb`, `setNow`, `clearNow`, `loginAs`, `seedWeek`, `setResult`.

## Theme
Dark, teal accent. CSS variables in `src/app/globals.css`: `--bg #0f1115`, `--accent #14b8a6`, `--accent-bright #2dd4bf`, `--correct #22c55e`, `--wrong #ef4444`.

## Known placeholders
`placeholderPinHash` in `src/db/queries.ts` is a Phase 0 stand-in; Phase 1 auth must replace it with a proper hash.
