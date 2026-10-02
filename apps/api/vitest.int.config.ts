import 'dotenv/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { nestTransform } from './vitest.config';

// Entegrasyon testleri gerçek Postgres ister: `pnpm db:up` (kökte) çalışıyor olmalı.
export default defineConfig({
  ...nestTransform,
  test: {
    include: ['test/**/*.int-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      MAIL_TRANSPORT: 'memory',
      QUEUE_ENABLED: 'false',
      SETUP_TOKEN: 'test-setup-token',
      AUTH_RATE_LIMIT: '1000',
      APP_URL: 'http://localhost:5173',
      // Testlerin yüklediği dosyalar geçici klasöre yazılır.
      UPLOAD_DIR: join(tmpdir(), 'scrum-manager-test-uploads'),
      MAX_UPLOAD_MB: '1',
    },
    fileParallelism: false,
  },
});
