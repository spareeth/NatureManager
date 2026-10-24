/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // .env.local lives at the repo root, shared with the AI service and scripts.
  envDir: '../..',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Terra Garden Field',
        short_name: 'TG Field',
        description: 'Field app for Terra Garden work orders, observations and asset scans.',
        start_url: '/field',
        scope: '/',
        display: 'standalone',
        theme_color: '#166534',
        background_color: '#ffffff',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell offline: every route falls back to index.html (FR-FLD-04).
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Map tiles for the site (OpenStreetMap; the site orthophoto when configured). Google
            // tiles are not matched: their terms forbid caching.
            urlPattern: ({ url }) =>
              url.hostname === 'tile.openstreetmap.org' || url.pathname.includes('/tiles/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
