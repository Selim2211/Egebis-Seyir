import { defineConfig } from 'vitest/config';

// NestJS DI, decorator metadata'ya ihtiyaç duyar (Oxc dönüştürücüsü ile üretilir).
export const nestTransform = {
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
} as const;

export default defineConfig({
  ...nestTransform,
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
