# NFL Pick'em — Requirements

A lightweight, mobile-first website for a small group of friends to make weekly NFL picks.
Each week stands alone: there is no season-long standings table.

All times are **Pacific Time** (with daylight saving handled automatically).

---

## 1. Accounts

- **Sign up:** first name, username, 4-digit PIN. No email, no invite code.
- **Log in:** username + PIN. Stays logged in on the device (long-lived session cookie).
- **Forgot PIN:** an admin resets it.
- **Brute-force protection:** a username is locked for 15 minutes after 5 failed PIN attempts (a 4-digit PIN is otherwise easy to guess).
- **Roles:** regular user or admin. There can be several admins.

## 2. Weekly cycle

| When (PT)                | What happens                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| Tuesday 12:00 AM         | New week opens for picks.                                        |
| Tue → Thu 12:00 PM       | Users submit and edit picks.                                     |
| **Thursday 12:00 PM**    | Week locks. No more edits. Everyone's picks are revealed.        |
| Following Tue 12:00 AM   | Monday's scores are in (from the nightly sync); recap final; next week opens. |

- **Thanksgiving week:** locks at **Thursday 9:00 AM** instead (the early game kicks off around 9:30 AM).
- An admin can change the lock time for any single week, to handle schedule oddities.
- Users only see the current week and past weeks. Future weeks are hidden.
- **First week of use:** whichever week is current at launch. Earlier weeks are not loaded.

## 3. Making picks

- Every game for the week is listed. The user taps the team they think will win.
- **Tiebreaker:** the user enters a guess for total points (both teams combined) in the Monday night game. If there is more than one Monday game, the tiebreaker uses the last one to kick off.
- Picks are submitted as one complete form: **every game must be picked and a tiebreaker entered**. Partial submissions are not allowed.
- Picks can be edited freely until the lock.
- The page shows a countdown to the lock and the user's progress (for example, "11/16 picked").
- Before the lock, users can see only their own picks. After the lock, everyone's picks are visible.

## 4. Scoring and winner

- One point per correct pick.
- Each week is ranked separately. **Only users who submitted picks that week and are marked paid** are counted.
- Ranking order:
  1. Most correct picks.
  2. Tiebreaker: closest to the actual Monday night total. Over and under count equally (absolute difference).
  3. If still tied, all tied players are co-winners.
- **NFL game that ends in a tie:** nobody gets the point.

## 5. Weekly recap (one per week, past weeks browsable)

- A winner banner at the top, with co-winners if there is a tie.
- The full ranked list of everyone counted: correct picks, tiebreaker guess, and the gap between their guess and the actual total.
- Stats: most correct, fewest correct, group average.
- **Per-game pick split** (for example, "7 picked KC, 3 picked BUF"), with the winning team highlighted.
- **Upset of the week:** the game the most people got wrong.
- Entries that are not counted because they are unpaid are listed separately as "not counted".
- During the week (after the lock), the recap shows picks and splits plus results for the games finished so far, marked "in progress" until every game is final.

### Live leaderboard (while the week is in progress)

- After the lock, the week's page becomes a **live leaderboard** that updates as each game goes final. For example: Thursday night, then the Sunday early games, then the late games, then Sunday night, then Monday.
- It shows each player's correct picks so far and their tiebreaker guess. Tap a player to see all their picks, marked right, wrong or pending.
- A **Games** view shows each game's result and the pick split (for example, "6 picked TB · 3 picked ATL").
- Ranking uses correct picks so far. Players with the same count share a rank (for example, "T-1st"). The Monday-night tiebreaker only applies once that game is final.
- Shows "Updated X min ago · N of M games final".
- Unpaid entries appear greyed out as "not counted" until an admin marks them paid.
- It turns into the final recap automatically once every game is final.

## 6. My history

- Each user can see every past week they entered: their picks, whether each was right or wrong, their score, their rank, and their tiebreaker guess.

## 7. Admin

- **Payments (per week):** see everyone who submitted picks that week and check each one off as paid or unpaid.
  - Every entry starts **unpaid**. Players are expected to pay by Thursday, but payments are collected outside the app.
  - Payment status can be changed **at any time**, for any week. It never locks.
  - Unpaid entries are left out of that week's results. The user isn't removed and can still play other weeks.
  - Results stay provisional until payments are marked.
- **Users:** list all users with their first name and username, reset PINs, grant or revoke admin, and remove a user (rarely needed).
- **Picks:** edit any user's picks for any week, including after the lock (rarely needed).
- **Games and scores:** override the winner or score of any game, and run "sync from ESPN now" on demand.
- **Lock time:** change the lock time for a specific week (for example, Thanksgiving).

## 8. Schedule and score data

- Source: ESPN's public scoreboard feed (`site.api.espn.com/.../nfl/scoreboard`). Free and **no API key**. It is unofficial, which is why there is an admin override.
- The remaining season's schedule is loaded at setup.
- **Automatic sync:** every night at **12:00 AM PT** (Vercel's free plan allows one scheduled job per day). It updates final scores, flexed kickoff times, and the Week 18 matchups once they're announced. This guarantees all results are in by the next morning.
- **Refresh on view:** when someone opens the leaderboard or recap and the last sync was more than **5 minutes** ago, the app pulls the latest finals from ESPN first. So the board catches up within minutes of a game ending, with no extra cron jobs and no cost. There's also a pull-to-refresh / "Refresh" button, limited to the same 5-minute window.
- Opening and locking a week happen automatically at the scheduled times. They don't depend on the sync.
- No live in-game scores (no score ticker while a game is being played). The leaderboard only counts games once they're **final**.

## 9. Navigation

- **Bottom nav** = views of the selected week: **My Picks · Leaderboard · Games**, plus **Admin** for admins only.
- **Week picker** ("Week 5 ▾" in the header) switches the week for every view. Its list of weeks, with your score, rank and the winner, doubles as your pick history. There is no separate History page.
- **Avatar menu** (top right): Change PIN, Log out.
- What each view shows depends on the week's state:
  - **Open (before lock):** My Picks is editable. Leaderboard and Games show "revealed Thu 12 PM" and who has submitted (names only).
  - **In progress:** My Picks is read-only, marked right/wrong/pending. Leaderboard is live. Games shows each game's pick split with names.
  - **Final:** the Leaderboard becomes the recap, with the winner banner and stats.
- **Admin** sub-tabs: Payments and Games use the week picker. Players isn't tied to a week, so the week picker is hidden there.
- Dark theme, orange accent.

## 10. Platform

- **Mobile-first.** Designed for a phone opened from a text-message link. Works on desktop but isn't optimized for it.
- Hosting: Vercel free tier, using the default `*.vercel.app` URL.
- Stack: Next.js + Postgres (Neon, free tier, through the Vercel integration).

## 11. Out of scope (for now)

- Season-long leaderboard or cumulative stats
- Backfilling weeks before launch
- Live scores
- Email or SMS reminders
- Payment processing (payments are tracked manually by admins)

---
