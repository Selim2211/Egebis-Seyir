import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Playwright testleri (e2e/) Vitest'e dahil değildir.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.spec.{ts,tsx}'],
    },
  }),
);
