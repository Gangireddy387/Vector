import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * Generates every app icon (PWA, maskable, Apple touch, favicon.ico) from public/logo.svg.
 * Run `npm run generate-pwa-assets` after changing the logo.
 * The logo is already a full-bleed tile with the mark inside the safe zone, so no extra padding is added.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#6a46e6' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#6a46e6' } },
  },
  images: ['public/logo.svg'],
})
