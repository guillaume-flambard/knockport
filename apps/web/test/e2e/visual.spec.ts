import { expect, test } from '@playwright/test'

/**
 * Visual regression baselines. Each screen is captured on three viewports so
 * a layout break (overlap, truncation, overflow) shows up as a diff. The
 * baselines live under apps/web/test/visual/ and are compared on every run.
 *
 * Screenshots are not portable across operating systems: font rendering and
 * antialiasing differ between macOS and Linux, so baselines generated on one
 * machine fail on another pixel-for-pixel. These tests therefore run only on
 * darwin (local development); the CI Linux runner runs the functional suite,
 * which is where regressions actually break. Regenerate baselines locally
 * with `pnpm test:e2e --update-snapshots`.
 */

const isDarwin = process.platform === 'darwin'

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test.describe(`view ${vp.name}`, () => {
    test.skip(!isDarwin, 'visual baselines are macOS-local (font rendering)')
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`public terminal`, async ({ page }) => {
      await page.goto('/j/harbor')
      await expect(page.locator('#cmd')).toBeVisible()
      await expect(page).toHaveScreenshot(`terminal-${vp.name}.png`)
    })

    test(`plain profile`, async ({ page }) => {
      await page.goto('/j/harbor/profile')
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
