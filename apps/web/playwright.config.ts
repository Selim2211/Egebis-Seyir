import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/** E2E ortamı geliştirme ortamından ayrı: kendi veritabanı (scrum_e2e) ve portları. */
export const E2E = {
  apiPort: 3100,
  webPort: 5174,
  /** Sahte yapay zekâ model sunucusu (testte başlatılır); gerçek API'ye hiç gidilmez. */
  aiPort: 3199,
  // Docker yerine yerel Postgres kullanılacaksa E2E_DATABASE_URL ile değiştirilir.
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgresql://scrum:scrum@localhost:5433/scrum_e2e',
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
        AUTH_RATE_LIMIT: '1000',
        // E-posta her zaman yerel Mailpit'e gider. Eksik değer API'nin .env dosyasından tamamlanır;
        // orada gerçek bir SMTP sunucusu (ör. Gmail) olsa bile testler gerçek e-posta göndermesin.
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASS: '',
        MAIL_FROM: 'Seyir E2E <e2e@example.invalid>',
        TICKET_SMTP_HOST: '127.0.0.1',
        TICKET_SMTP_PORT: '1025',
        TICKET_IMAP_HOST: '',
        TICKET_AI_ENABLED: 'false',
        TICKET_AI_KEY: '',
        QUEUE_ENABLED: 'true',
        ANTHROPIC_API_KEY: 'e2e-key',
        AI_BASE_URL: 'http://127.0.0.1:3199',
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
