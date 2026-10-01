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
| Tuesday 12:00 AM         | New week opens for picks. Prior week's final scores are synced. |
| Tue → Thu 12:00 PM       | Users submit and edit picks.                                     |
| **Thursday 12:00 PM**    | Week locks. No more edits. Everyone's picks are revealed.        |
| Following Tue 12:00 AM   | Scores synced, recap finalized, next week opens.                 |

- **Thanksgiving week:** locks at **Thursday 9:00 AM** instead (the early game kicks off around 9:30 AM).
- An admin can change the lock time for any single week, to handle schedule oddities.
- Users only see the current week and past weeks. Future weeks are hidden.
- **First week of use:** whichever week is current at launch. Earlier weeks are not loaded.

## 3. Making picks

- Every game for the week is listed. The user taps the team they think will win.
- **Tiebreaker:** the user enters a guess for total points (both teams combined) in the Monday night game. If there is more than one Monday game, the tiebreaker uses the last one to kick off.
- A submission is only valid once **every game is picked and a tiebreaker is entered**. *(Proposed: no partial submissions.)*
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
- **NFL game that ends in a tie:** ⚠️ *TBD (asking the league manager).* Placeholder: nobody gets the point.

## 5. Weekly recap (one per week, past weeks browsable)

- A winner banner at the top, with co-winners if there is a tie.
- The full ranked list of everyone counted: correct picks, tiebreaker guess, and the gap between their guess and the actual total.
- Stats: most correct, fewest correct, group average.
- **Per-game pick split** (for example, "7 picked KC, 3 picked BUF"), with the winning team highlighted.
- **Upset of the week:** the game the most people got wrong.
- Entries that are not counted because they are unpaid are listed separately as "not counted".
- During the week (after the lock, before scores are synced), the recap shows picks and splits, marked "results pending".

## 6. My history

- Each user can see every past week they entered: their picks, whether each was right or wrong, their score, their rank, and their tiebreaker guess.

## 7. Admin

- **Payments (per week):** see everyone who submitted picks that week and check each one off as paid or unpaid. Unpaid entries are left out of that week's results. The user isn't removed and can still play other weeks.
- **Users:** list all users with their first name and username, reset PINs, grant or revoke admin, and remove a user (rarely needed).
- **Picks:** edit any user's picks for any week, including after the lock (rarely needed).
- **Games and scores:** override the winner or score of any game, and run "sync from ESPN now" on demand.
- **Lock time:** change the lock time for a specific week (for example, Thanksgiving).

## 8. Schedule and score data

- Source: ESPN's public scoreboard feed (`site.api.espn.com/.../nfl/scoreboard`). Free and **no API key**. It is unofficial, which is why there is an admin override.
- The remaining season's schedule is loaded at setup.
- **Automatic sync:** once daily at **Tuesday 12:00 AM PT** (Vercel's free plan allows one scheduled job per day). It updates final scores, flexed kickoff times, and the Week 18 matchups once they're announced.
- No live scores during games.

## 9. Platform

- **Mobile-first.** Designed for a phone opened from a text-message link. Works on desktop but isn't optimized for it.
- Hosting: Vercel free tier, using the default `*.vercel.app` URL.
- Stack: Next.js + Postgres (Neon, free tier, through the Vercel integration).

## 10. Out of scope (for now)

- Season-long leaderboard or cumulative stats
- Backfilling weeks before launch
- Live scores
- Email or SMS reminders
- Payment processing (payments are tracked manually by admins)

---

## Open questions

1. **NFL tie games:** does everyone get the point, or nobody? (Asking the manager.)
2. **Paid status default:** should a new entry count as *unpaid* until an admin checks it off, so results stay provisional until payments are marked? Or should it count as *paid* until an admin unchecks it?
3. **Partial picks:** confirm that a submission must include every game and the tiebreaker.
