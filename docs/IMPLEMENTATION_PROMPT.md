# Implementation kickoff prompt

Paste everything below the line into a new Claude Code session (Opus) on this repo.

---

You are the **coordinator** for building the NFL Pick'em web app in this repo. You plan, delegate, review, integrate, and verify. You do **not** write most of the code yourself.

## How to work

- **Delegate coding to sub-agents.** Use the Agent tool with `model: "sonnet"`. Give each sub-agent one well-scoped task: the files it owns, the acceptance criteria, and the exact commands that must pass.
- **Run sub-agents in parallel** only when their tasks touch different files.
- **Review every sub-agent's result yourself.** Read the diff and run the checks. Don't trust its report alone. Send fixes back to a sub-agent rather than accepting broken work.
- **Commit after each completed, green step**, with clear messages. Push to the current branch. Don't open a PR unless asked.
- When something in the spec is ambiguous, pick the simplest reasonable option, note it in `docs/DECISIONS.md`, and keep going.

## Read first

1. `REQUIREMENTS.md` is the source of truth for behavior.
2. `docs/wireframes/*.dc.html` are the approved mobile wireframes, written as HTML with inline styles. Use them as the layout and navigation reference. The data in them is fake.

   The wireframes are out of date in four ways. Follow the requirements instead:
   - The accent color will be **teal**, not the orange in the mocks. Dark theme stays.
   - The **Games tab shows counts only**, not name lists, with the logged-in user's side highlighted.
   - **Never show "X of N" counts of players.** Participation is opt-in each week.
   - **Admin Payments** shows "N paid · M unpaid" and has no "didn't submit" list.

## Phase 0: testing harness (do this first, before any features)

The goal: any agent can prove a change works in a real browser, with no external services.

- **App:** a Next.js app with the App Router and TypeScript, deployed later on Vercel.
  - **Styling:** your choice; Tailwind is fine.
  - **ORM:** Drizzle, or something similarly light.
- **Database:** Postgres.
  - **Production:** Neon through the Vercel integration.
  - **Tests and local dev:** must run offline. Use something like PGlite or a local Postgres, behind the same schema and migrations.
  - **Scale is tiny:** about 30 users, 16 picks a week each, plus game results. Compute stats and leaderboards on the fly. No stats table.
- **Playwright e2e:**
  - **Browser:** Chromium is pre-installed. `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set. **Never run `playwright install`**. If the pinned version mismatches, launch with `executablePath` pointing at the binary under `/opt/pw-browsers`.
  - **Viewport:** the primary project is a phone (390×844, touch). Add one desktop project as a smoke check.
  - **Server:** use the `webServer` config so `npm run test:e2e` starts the app against a fresh, seeded test database.
- **Controllable time.** The app is time-driven: weeks unlock Tuesday 12:00 AM PT and lock Thursday 12:00 PM PT. Route all "now" reads through one `now()` helper, which test mode can override per request (for example via a test-only cookie or header that is ignored in production). Tests must be able to say "it is Wednesday" and then "it is Friday".
- **ESPN feed is mocked in tests.** Build an adapter interface for `site.api.espn.com` (scoreboard, no API key). Tests use JSON fixtures and never touch the network. If the network allows, capture one real response as a fixture to lock down its shape.
- **Fixtures and helpers:** seed and reset scripts; log in as a player or admin; create a week with games; set game results.
- **Scripts:** `dev`, `build`, `lint`, `typecheck`, `test` (unit tests, for example Vitest), and `test:e2e`.
- **First tests:** a smoke e2e test (login page renders on mobile) plus one unit test, both passing.
- **CLAUDE.md:** document exactly how to run each check and the rule that every UI change ships with a Playwright test. Consider adding a SessionStart hook that installs dependencies.

## Phases 1+: features (each with unit tests for logic and Playwright tests for UI)

Build in this order:

1. **Auth.**
   - Sign up with first name, username and a 4-digit PIN.
   - Hash PINs.
   - Lock an account for 15 minutes after 5 failed attempts.
   - Long-lived session cookie.
   - Player and admin roles. Seed the first admin.
2. **Schedule and week logic.**
   - Import the rest of the 2026 season from ESPN, starting at the current week. No backfill.
   - Week state machine: hidden, then open, then locked (in progress), then final.
   - Per-week lock override. The Thanksgiving week locks Thursday at 9 AM PT.
   - Only the current and past weeks are visible.
3. **My Picks.**
   - Pick a winner for every game plus the tiebreaker, submitted only as a complete form.
   - Edit until the lock.
   - After the lock it's read-only, with right, wrong and pending marks.
4. **Score sync.**
   - Nightly Vercel cron around 12 AM PT. The free plan allows one cron a day, and cron times are in UTC, so watch the daylight-saving shift.
   - Refresh when someone opens the page, at most once every 5 minutes.
   - Admin "sync now" button and manual score override.
   - A tie game gives nobody the point.
5. **Leaderboard and Games.**
   - Before the lock: "revealed Thu 12 PM" plus the names of who's in, shown as a count only.
   - In progress: live ranking with shared ranks. Tap a player to see their picks. Unpaid entries are listed as "not counted".
   - Final: winner banner, stats, rankings and upset of the week. The tiebreaker uses the absolute difference from the Monday night total. Players still tied after the tiebreaker are co-winners.
   - Games tab: each game's split as counts, with your side highlighted.
6. **Week picker and avatar menu.**
   - The week picker doubles as history.
   - The avatar menu has Change PIN and Log out.
7. **Admin.**
   - Payments: per week, editable anytime. Every entry starts unpaid, and only paid entries count.
   - Games: sync, lock time, score edits, and editing a user's picks.
   - Players: not tied to a week. Reset PIN, grant or revoke admin, remove a player.
8. **`DEPLOY.md`:** step-by-step instructions for the owner to connect Vercel and Neon, set env vars, run migrations and seed an admin. Don't deploy yourself.

Before every commit, run lint, typecheck, unit tests and e2e tests, and all must be green. Finish with a short summary of what was built, decisions made, and anything the owner must do.
