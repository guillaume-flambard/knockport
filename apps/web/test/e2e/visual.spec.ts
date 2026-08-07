import { expect, test } from '@playwright/test'

/**
 * Visual regression baselines. Each screen is captured on three viewports so
 * a layout break (overlap, truncation, overflow) shows up as a diff. The
 * baselines live under test-results/visual/ and are compared on every run.
 *
 * The first run writes the baselines; later runs fail on meaningful diffs.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test.describe(`view ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`public terminal`, async ({ page }) => {
      await page.goto('/j/e2e-main')
      await expect(page.locator('#cmd')).toBeVisible()
      await expect(page).toHaveScreenshot(`terminal-${vp.name}.png`)
    })

    test(`plain profile`, async ({ page }) => {
      await page.goto('/j/e2e-main/profile')
      await expect(page.getByRole('heading', { name: /Working at/ })).toBeVisible()
      await expect(page).toHaveScreenshot(`profile-${vp.name}.png`)
    })

    test(`studio login`, async ({ page }) => {
      await page.goto('/studio/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page).toHaveScreenshot(`login-${vp.name}.png`)
    })
  })
}
