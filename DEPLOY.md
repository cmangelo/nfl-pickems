# Deploying NFL Pick'em (Vercel + Neon)

One-time setup for the owner. Everything runs on free tiers. Nothing here is automated; follow the steps in order.

You need: a GitHub account with this repo, a Vercel account, and Node 22 + npm on your computer (for the one-time database setup commands).

## 1. Create the Vercel project

1. Go to <https://vercel.com/new> and import this GitHub repository.
2. Framework preset: **Next.js** (auto-detected). Leave build and output settings at their defaults.
3. Production branch: choose the branch you want live (usually `main`; merge this work there first).
4. Don't deploy yet if Vercel offers to. If it does deploy, that's fine: the first deploy just won't have a database until step 2.

## 2. Add the Neon Postgres database

1. In the Vercel project, open **Storage** → **Create Database** → **Neon (Serverless Postgres)** → free plan. Pick **US East (N. Virginia)**, the same region Vercel runs the app's functions in by default (`iad1`). Each page makes several database queries, so a mismatched region makes pages noticeably slower. If you'd rather use US West, also set the project's Function Region to match: Vercel → **Settings** → **Functions** → **Function Region**.
2. Connect it to the project for **Production** (and Preview if you like).
3. This automatically adds `DATABASE_URL` (and a few other `PG*`/`POSTGRES_*` variables) to the project's environment variables. The app only needs `DATABASE_URL`.

## 3. Set the other environment variables

Vercel project → **Settings** → **Environment Variables**, scope **Production**:

| Name | Value | Why |
|---|---|---|
| `CRON_SECRET` | a long random string (e.g. output of `openssl rand -hex 32`) | Vercel sends it to the nightly sync job; the endpoint refuses requests without it. |
| `ADMIN_USERNAME` | your username, e.g. `dan` | First admin account (used once by the seed step). |
| `ADMIN_PIN` | 4 digits | First admin's PIN. Change it in the app afterwards. |
| `ADMIN_FIRST_NAME` | e.g. `Dan` | First admin's name. |

Do **not** set `TEST_MODE`, `DB_DRIVER`, `PGLITE_DIR` or `ESPN_MODE` in production. (`TEST_MODE=1` would enable test-only routes and a clock override.)

## 4. Create the tables, the first admin, and the schedule

**This now happens automatically.** Vercel runs `npm run vercel-build` (see `scripts/vercel-build.ts`) on every deploy: it applies migrations, seeds the admin from `ADMIN_*` (idempotent, never overwrites an existing PIN; a missing `ADMIN_*` only warns, invalid or trivial values fail the build), and imports the season schedule from ESPN if the weeks table is empty (an ESPN failure only warns). If the schedule is still empty, an admin can click **Load season schedule from ESPN** on Admin → Games.

The manual commands below are optional, kept as a fallback. Run them from your computer, in a checkout of the repo:

```bash
npm install
# Pull the production env vars (DATABASE_URL etc.) into .env.local
npx vercel login
npx vercel link            # pick this project
npx vercel env pull .env.local --environment=production

npm run db:migrate          # creates the tables in Neon
npm run db:seed             # creates the first admin from ADMIN_* vars
npm run db:import-schedule -- --season 2026   # loads the rest of the season from ESPN, starting at the current week
```

`db:import-schedule` with no `--from` starts at the week containing today (earlier weeks are never loaded). Add `--from N` to start at a specific week.

Delete `.env.local` afterwards if you don't want production credentials on your computer.

## Dev / preview deployments

- Every push to a non-production branch gets its own preview URL.
- With the Neon integration, enable **Create a database branch for each preview deployment** (Neon → Vercel integration settings). Each preview then gets its own `DATABASE_URL`, so previews never touch production data.
- Set `ADMIN_USERNAME`, `ADMIN_PIN`, `ADMIN_FIRST_NAME` (and `CRON_SECRET`) for the **Preview** environment too.
- Migrations, the admin seed and the schedule import run automatically during the build (`vercel-build`). Without a `DATABASE_URL` the DB steps are skipped.
- Crons run only on production; on a preview, use Admin → Games → "Sync from ESPN now".
- `TEST_MODE` is ignored on Vercel (when `VERCEL` is set), so a preview can never expose the test routes or clock override.
- The Vercel connector (<https://claude.ai/customize/connectors> → Vercel) lets Claude list deployments and read build logs.

## 5. Deploy

Trigger a deploy (push to the production branch, or **Deployments** → **Redeploy**). Open the `*.vercel.app` URL, log in with the admin username and PIN, and change the PIN from the avatar menu.

## 6. Check the nightly sync

`vercel.json` schedules one cron job, `/api/cron/sync`, at **08:00 UTC** daily. Vercel's free plan allows one daily job, and cron times are in UTC with no daylight-saving adjustment, so it runs at **midnight PST** in winter and **1 AM PDT** during daylight time. Both are well after Monday night games end. When someone opens the leaderboard, the app also pulls fresh scores if the last sync was more than 5 minutes ago, so results catch up within minutes anyway.

Check it in Vercel → project → **Settings** → **Cron Jobs**. You can click **Run** to trigger it once by hand.

## Day-to-day

- Share the URL with players; they sign up with first name, username and a 4-digit PIN.
- Each week, in **Admin → Payments**, mark entries paid. Only paid entries count.
- **Admin → Games**: "Sync from ESPN now", fix a score if ESPN is wrong, or change a week's lock time. Thanksgiving week already defaults to Thursday 9:00 AM PT.
- **Admin → Players**: reset a forgotten PIN, make someone an admin.

## Optional: rate-limit logins

The app already locks a username after 5 wrong PINs, and lockouts get longer each time, up to 24 hours. For extra protection against someone hammering the login page, add a Vercel Firewall rule: Vercel → project → **Firewall** → **Add Rule** → if Request Path equals `/login` and Method equals `POST`, apply **Rate Limit** (for example 20 requests per minute per IP).

## Admin runbook

- **A game is postponed or cancelled** (ESPN shows it as postponed; the app labels it "Postponed" and treats it as pending, so the week stays Live). Either wait for the rescheduled game to be played (the sync picks up the result and any new kickoff), or open **Admin → Games → Edit → Void game**. A void game counts for nobody (no correct or wrong, left out of the "N of M games final" total), and the week can finish without it. "Clear override" on that game undoes the void.
- **ESPN has a wrong score**: **Admin → Games → Edit** the game, enter the score and winner, Save. It is marked "manual" and syncs won't overwrite it until you "Clear override".
- **Changing the lock time**: **Admin → Games → Change**. The lock can never be later than the week's first kickoff (the app refuses it); an earlier lock is fine. "Reset to default" restores Thursday 12:00 PM PT (Thanksgiving 9:00 AM PT, or the first kickoff if that is earlier, e.g. a Wednesday game).
- **Removing a player** only deactivates them: they are dropped from the currently open week, but their entries in locked and past weeks stay so old results never change, and the username stays taken.
- **Editing a player's picks** (Admin → Payments or Games → Edit picks): before the lock another player's picks stay hidden and saving replaces them; after the lock you can edit anyone except yourself. Edits show up as "Edited by admin <name>" on the player's picks and in Payments.

## Schema changes later

If a future change adds a migration (a new file in `drizzle/`), the next deploy applies it automatically (`vercel-build`). The manual `npm run db:migrate` (step 4) remains a fallback.

Migrations run at the start of the build, while the previous deployment is still live. **Migration 0003 (multiple entries per week)** replaces the one-entry-per-player index, so the still-live old deployment can't save picks from the moment the migration runs until the new deployment is promoted (normally the length of the build, about a minute). Deploy it outside the Tuesday–Thursday pick window, or at least not close to a lock. If the build fails after migrating, redeploy promptly: the migration is safe to re-run.
