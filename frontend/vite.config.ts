import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:4000'

// The dev server uses https: browsers only allow camera and microphone on https (or localhost), so other computers on
// the network need it to take part in calls. The certificate is self-signed; each browser asks once to trust it.
// `npm run dev:http` serves plain http instead.
export default defineConfig(({ command, mode }) => ({
  plugins: [
    ...(command === 'serve' && mode !== 'http' ? [basicSsl()] : []),
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons are generated from public/logo.svg: `npm run generate-pwa-assets`.
      includeAssets: ['favicon.ico', 'favicon.svg', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Vector — Work Management',
        short_name: 'Vector',
        description: 'Plan, track and automate your team’s work.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'My tasks', url: '/' },
          { name: 'Create issue', url: '/issues/new' },
          { name: 'Inbox', url: '/inbox' },
        ],
      },
      workbox: {
        // Push notifications (calls ringing) are handled by this extra script inside the generated service worker.
        importScripts: ['/push-handler.js'],
        // The background-blur engine (~14 MB) is only downloaded by people who turn blur on, then kept.
        globIgnores: ['**/*.wasm'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\.(wasm|tflite)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'vector-blur', expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.includes('/download'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vector-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
}))
