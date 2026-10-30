import fs from 'node:fs';
import path from 'node:path';
import { chromium, defineConfig, devices } from '@playwright/test';

/**
 * Never `playwright install`: when the pre-installed Chromium under PLAYWRIGHT_BROWSERS_PATH is a different build
 * than this Playwright version expects, launch the pre-installed headless shell (newest) directly instead.
 */
function preinstalledChromium(): string | undefined {
  if (fs.existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium_headless_shell-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const bin = path.join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}
const executablePath = preinstalledChromium();
const launchOptions = executablePath ? { executablePath } : {};

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one shared pglite DB inside the server process
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', launchOptions },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'desktop',
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // Fresh in-memory pglite DB per run; production build for realism.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      TEST_MODE: '1',
      ESPN_MODE: 'fixture',
      // Staging-only accent color tuner (account menu); e2e/theme-tuner.spec.ts covers it.
      THEME_TUNER: '1',
      DB_DRIVER: 'memory',
      DATABASE_URL: '',
    },
  },
});
