// ============================================
// GymMaster — Configurazione Vite
// Build tool + PWA + Tailwind
// ============================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionData = JSON.parse(readFileSync(resolve(__dirname, '..', 'version.json'), 'utf-8'));

/**
 * Pubblica /version.json con ogni build: l'app lo scarica ogni 2 minuti e,
 * se la versione e' diversa da quella con cui e' stata costruita, si
 * aggiorna da sola (hooks/useAutoAggiornamento.js). Basta la versione: il
 * changelog lo legge il server.
 */
const pubblicaVersione = {
  name: 'gymmaster-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ versione: versionData.versione, build: versionData.build }) + '\n'
    });
  }
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(versionData.versione)
  },
  plugins: [
    pubblicaVersione,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'GymMaster — Traccia i tuoi allenamenti',
        short_name: 'GymMaster',
        description: 'PWA per tracking allenamenti in palestra con timer, statistiche e AI coach',
        theme_color: '#0A0A0F',
        background_color: '#0A0A0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        // Non precachare index.html — Nginx lo serve con no-cache
        // Questo evita che il SW serva la vecchia versione
        navigateFallback: null,
        // Le notifiche push (public/sw-push.js): il service worker generato le importa
        importScripts: ['/sw-push.js'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https?:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor';
          }
          if (id.includes('node_modules/recharts')) {
            return 'charts';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'animation';
          }
        }
      }
    }
  }
});
