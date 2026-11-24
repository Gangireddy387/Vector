import { defineConfig, devices } from '@playwright/test'

/**
 * Laptop-density smoke (1024×768). Auth-gated workspace routes assert the login
 * redirect contract when no session is present — full in-app smoke needs E2E_EMAIL/E2E_PASSWORD.
 *
 * Vite preview uses the basic-ssl plugin (same as `vite serve`), so baseURL is https.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://127.0.0.1:4173',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    viewport: { width: 1024, height: 768 },
  },
  webServer: {
    // Bundle-only build (vue-tsc stays on `npm run type-check` / `npm run build`). Smoke needs dist/.
    command: process.env.CI
      ? 'npm run preview -- --host 127.0.0.1 --port 4173'
      : 'npx vite build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'https://127.0.0.1:4173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
