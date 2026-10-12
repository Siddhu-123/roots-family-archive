import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Set BASE_PATH (e.g. /roots-family-archive/) when deploying under a sub-path such as GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  cacheDir: 'node_modules/.vite/family-tree',
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    manifest: {
      name: 'Roots - Family Archive', short_name: 'Roots',
      description: 'Your family, remembered for generations.',
      theme_color: '#e85c20', background_color: '#f8f9fb', display: 'standalone',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
  })],
  server: { port: 4173, strictPort: false },
  build: { chunkSizeWarningLimit: 1100 },
});
