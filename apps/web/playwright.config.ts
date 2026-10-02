import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/** E2E ortamı geliştirme ortamından ayrı: kendi veritabanı (scrum_e2e) ve portları. */
export const E2E = {
  apiPort: 3100,
  webPort: 5174,
  setupToken: 'e2e-setup-token',
  databaseUrl: 'postgresql://scrum:scrum@localhost:5433/scrum_e2e',
  mailpitUrl: 'http://localhost:8025',
} as const;

/** Önce kökte `pnpm db:up` (Postgres + Mailpit) çalışıyor olmalı. */
export default defineConfig({
  testDir: './e2e',
  // Akış testleri sıralı ve paylaşılan durumla çalışır (kurulum → davet → giriş).
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${E2E.webPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @scrum/api build:e2e && pnpm --filter @scrum/api start:e2e',
      url: `http://localhost:${E2E.apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        PORT: String(E2E.apiPort),
        DATABASE_URL: E2E.databaseUrl,
        APP_URL: `http://localhost:${E2E.webPort}`,
        SETUP_TOKEN: E2E.setupToken,
        AUTH_RATE_LIMIT: '1000',
        MAIL_TRANSPORT: 'smtp',
        QUEUE_ENABLED: 'true',
      },
    },
    {
      command: `pnpm exec vite --port ${E2E.webPort} --strictPort`,
      url: `http://localhost:${E2E.webPort}`,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://localhost:${E2E.apiPort}` },
    },
  ],
});
