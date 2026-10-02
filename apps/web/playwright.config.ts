import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/** E2E testleri gerçek API + veritabanı ister: önce kökte `pnpm db:up`. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @scrum/api dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
  ],
});
