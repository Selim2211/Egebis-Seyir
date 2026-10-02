import { defineConfig } from 'tsdown';

// ESM (web) ve CJS (NestJS API) çıktısı birlikte üretilir.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
