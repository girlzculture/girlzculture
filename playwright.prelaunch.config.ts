import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Independent localhost process: never reuse the live-state acceptance app.
// An empty launch flag must behave exactly like an unset flag.
const url = 'http://127.0.0.1:3108';
const provider = 'http://127.0.0.1:3109';
const previewSecret = 'p0-private-preview-acceptance-secret';
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /p0-prelaunch\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: url, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  outputDir: 'test-results/prelaunch',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/prelaunch', open: 'never' }]],
  webServer: servers.map((server, index) => index === 0 ? {
    ...server, url: `${provider}/health`, reuseExistingServer: false,
    env: { ...server.env, PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: provider, P0_PRELAUNCH_FIXTURE: 'true', INTERNAL_API_SECRET: previewSecret },
  } : {
    ...server, command: 'npm run dev -- -H 127.0.0.1 -p 3108', url, reuseExistingServer: false,
    env: { ...server.env, CUSTOMER_MARKETPLACE_LIVE: '', NEXT_PUBLIC_SITE_URL: url, NEXT_PUBLIC_SUPABASE_URL: provider, INTERNAL_API_SECRET: previewSecret },
  }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
