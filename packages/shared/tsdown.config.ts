import { defineConfig } from 'tsdown';

// ESM (web) ve CJS (NestJS API) çıktısı birlikte üretilir.
// fractional-indexing yalnızca ESM yayınlandığı için pakete gömülür (CJS çıktısı da çalışsın).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // İzleme modunda dist silinmez: dev açılışında web, yeniden derleme bitmeden paketi bulamıyordu.
  clean: !process.argv.includes('--watch'),
  sourcemap: true,
  noExternal: ['fractional-indexing'],
});
