import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
  plugins: [
    react(),
    VitePWA({
      // Custom SW (src/sw.js) so we can handle Web Push events.
      // Precaching + Supabase runtime caching moved into sw.js.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      manifest: false, // using our own /public/manifest.json
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      // Dev SW disabled: the injectManifest dev worker (dev-sw.js) was failing to
      // evaluate, and a stale registered SW kept serving an old precached app
      // bundle — which made create/delete look like a "Connection error" in local
      // dev even though the backend was healthy. Production is unaffected (it uses
      // the real built sw.js). Flip back to true only to test Web Push locally.
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['jspdf', 'jspdf-autotable'],
  },
})
