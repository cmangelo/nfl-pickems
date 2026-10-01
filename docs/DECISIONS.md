# Decisions

Ambiguities resolved during implementation (simplest reasonable option).

- **Next.js 15.5** (App Router) rather than 16, for stability; Tailwind v4; Drizzle ORM.
- **DB drivers:** `neon` (neon-http) in production; `pglite` (on-disk) for local dev; `memory` pglite for e2e. Same drizzle migrations for all.
- **`now()` is async** because Next 15 `headers()`/`cookies()` are async. Test override via `x-test-now` header or cookie, only when `TEST_MODE=1`.
- **ESPN fixture is hand-written** in ESPN's scoreboard shape: outbound network to site.api.espn.com is blocked in the build environment, so no real response could be captured.
- **Playwright pinned to 1.56.1** to match the pre-installed Chromium build (1194).
- **E2E runs with 1 worker:** the single server process owns the in-memory DB.
- **Week picker list shows rank without "of N"** (wireframe shows "4th of 9"); dropped to honor the "never show X of N" rule.
