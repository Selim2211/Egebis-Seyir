import { defineConfig } from 'tsdown';

// ESM (web) ve CJS (NestJS API) çıktısı birlikte üretilir.
// fractional-indexing yalnızca ESM yayınlandığı için pakete gömülür (CJS çıktısı da çalışsın).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ['fractional-indexing'],
});
