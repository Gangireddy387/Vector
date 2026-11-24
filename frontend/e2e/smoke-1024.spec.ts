import { expect, test } from '@playwright/test'

const LAPTOP = { width: 1024, height: 768 }

async function assertNoHorizontalBleed(page: import('@playwright/test').Page) {
  const bleed = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth > root.clientWidth + 1
  })
  expect(bleed, 'page should not force horizontal scroll at 1024×768').toBe(false)
}

test.describe('1024×768 smoke', () => {
  test.use({ viewport: LAPTOP })

  test('sign-in page fits laptop viewport', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    // Password form when available; SSO-only orgs hide email and show a provider button instead.
    const email = page.locator('#email')
    const sso = page.getByRole('button', { name: /continue with|google|microsoft|sso/i })
    await expect(email.or(sso).first()).toBeVisible()
    await assertNoHorizontalBleed(page)
  })

  test('protected workspace routes redirect to login', async ({ page }) => {
    const routes = [
      { path: '/calendar', name: 'calendar' },
      { path: '/messages', name: 'messages' },
      { path: '/wiki', name: 'wiki' },
      { path: '/projects/demo/board', name: 'board' },
    ] as const

    for (const route of routes) {
      await page.goto(route.path)
      await expect(page, `${route.name} should require auth`).toHaveURL(/\/login/)
      expect(page.url()).toContain('redirect=')
      await assertNoHorizontalBleed(page)
    }
  })

  test('authenticated workspace chrome (optional)', async ({ page }) => {
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD for full workspace smoke')

    await page.goto('/login')
    await page.getByLabel(/email/i).fill(email!)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })

    for (const path of ['/calendar', '/messages', '/wiki']) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.locator('[data-slot="page-frame"], main, [role="main"]').first()).toBeVisible({ timeout: 15_000 })
      await assertNoHorizontalBleed(page)
    }
  })
})
