import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Modül yolundan npm paket adı (pnpm'in `.pnpm/<ad>@<sürüm>/node_modules/<ad>` yapısı dahil). */
function packageName(id: string): string | undefined {
  return /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(
    id.replace(/\\/g, '/'),
  )?.[1];
}

export default defineConfig({
  plugins: [
    // Router eklentisi react eklentisinden önce gelmeli (dosya tabanlı rotalar).
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Sık değişmeyen kütüphaneler ayrı parçada: uygulama güncellense de tarayıcı önbelleği geçerli kalır.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const name = packageName(id);
          if (!name) return undefined;
          if (name === 'react' || name === 'react-dom' || name === 'scheduler') return 'react';
          if (name.startsWith('@tanstack/')) return 'tanstack';
          if (name === 'i18next' || name === 'react-i18next') return 'i18n';
          if (name === 'zod') return 'zod';
          return undefined;
        },
      },
    },
  },
  // Dev: tüm kaynaklar açılışta taranır. Aksi halde rota parçaları (autoCodeSplitting) ilk açıldıkça
  // yeni bağımlılık bulunur ve Vite sayfayı baştan yükler (tıklamada uzun beyaz ekran).
  optimizeDeps: { entries: ['index.html', 'src/**/*.tsx', '!src/**/*.spec.tsx'] },
  server: {
    // Sık açılan dosyalar sunucu başlarken önceden dönüştürülür.
    warmup: {
      clientFiles: ['./src/main.tsx', './src/routes/**/*.tsx', './src/components/**/*.tsx'],
    },
    port: 5173,
    strictPort: true,
    // Tarayıcı API'ye aynı origin üzerinden gider (cookie oturumu, CORS yok).
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
});
