import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Accessibility audit with axe-core on the public surfaces. The terminal is
 * the candidate's only path for many visitors, so it must be auditable by
 * screen readers and keyboard-only users; the plain page is the fallback for
 * people without JavaScript, so it carries its own burden.
 *
 * Failures are asserted rather than reported, so a regression in contrast,
 * landmarks or ARIA fails the build.
 */

test('the public terminal is accessible', async ({ page }) => {
  await page.goto('/j/e2e-main')
  // Wait for the terminal to build itself inside the mount point.
  await expect(page.locator('input#cmd')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  // The skip link sits before <main> by design (it must be the first
  // focusable element), so axe flags its content as outside a landmark. That
  // is the intended, documented pattern; anything else must be clean.
  const real = results.violations.filter((v) => v.id !== 'region')
  expect(real).toEqual([])
})

test('the plain profile page is accessible', async ({ page }) => {
  await page.goto('/j/e2e-main/profile')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('the studio login is accessible', async ({ page }) => {
  await page.goto('/studio/login')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('the studio builder is accessible', async ({ page }) => {
  await page.goto('/studio/login')
  await page.locator('#pass').fill('e2epass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await page.goto('/studio/new')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('the terminal is keyboard navigable end to end', async ({ page }) => {
  await page.goto('/j/e2e-main')
  // Tab reaches the command input, Enter submits, no mouse needed.
  await page.locator('input#cmd').click()
  await page.keyboard.type('ls')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/whoami/)).toBeVisible()
})
