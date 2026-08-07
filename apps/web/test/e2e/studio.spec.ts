import { expect, test, type Page } from '@playwright/test'

/**
 * Studio end-to-end: the recruiter's journey. Login, wizard creation with the
 * live preview, slug collision guard, save confirmation, duplication.
 */

const PASS = 'e2epass'

async function login(page: Page): Promise<void> {
  await page.goto('/studio/login')
  await page.locator('#pass').fill(PASS)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
}

async function createJourney(page: Page, slug: string): Promise<void> {
  await page.goto('/studio/new')
  await page.locator('#companyName').fill('E2E Co')
  await page.locator('#slug').fill(slug)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.locator('#title').fill(`Working at ${slug}`)
  await page.locator('#banner').fill('Welcome to E2E Co.')
  await page.locator('#s-0-name').fill('whoami')
  await page.locator('#s-0-title').fill('who we are')
  await page.locator('#s-0-body').fill('We are E2E Co.')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'Create journey' }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/j/${slug}\\?saved=1`))
}

test('login then create a journey via the wizard', async ({ page }) => {
  await login(page)
  await createJourney(page, 'wizard-co')
  // Save confirmation shows the live link.
  await expect(page.getByText('Saved. It is live at')).toBeVisible()
  await expect(page.getByRole('link', { name: '/j/wizard-co' })).toBeVisible()
})

test('the builder shows a live preview that updates', async ({ page }) => {
  await login(page)
  await page.goto('/studio/new')
  await page.locator('#companyName').fill('Preview Co')
  await page.locator('#slug').fill('preview-co')
  // Advance to step 2 where the banner lives; the preview is always visible.
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('#title').fill('Preview Co')
  await page.locator('#banner').fill('Hello preview.')
  await expect(page.locator('.preview')).toContainText('Hello preview.')
})

test('creating with an existing slug is rejected', async ({ page }) => {
  await login(page)
  await createJourney(page, 'taken-co')
  // Try to create again with the same slug.
  await page.goto('/studio/new')
  await page.locator('#companyName').fill('Duplicate')
  await page.locator('#slug').fill('taken-co')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('#title').fill('Duplicate')
  await page.locator('#banner').fill('Welcome.')
  await page.locator('#s-0-name').fill('whoami')
  await page.locator('#s-0-title').fill('who we are')
  await page.locator('#s-0-body').fill('We are Duplicate.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Create journey' }).click()
  await expect(page).toHaveURL(/error=slug-taken/)
  await expect(page.getByText('already in use')).toBeVisible()
})

test('an invalid slug is caught inline', async ({ page }) => {
  await login(page)
  await page.goto('/studio/new')
  await page.locator('#slug').fill('BAD SLUG')
  await page.locator('#slug').blur()
  await expect(page.getByText(/lowercase letters/)).toBeVisible()
})

test('duplicate copies a journey as a draft', async ({ page }) => {
  await login(page)
  await createJourney(page, 'dup-co')
  await page.goto('/studio')
  const row = page.locator('li').filter({ hasText: '/j/dup-co' })
  await row.getByRole('button', { name: 'duplicate' }).click()
  await expect(page).toHaveURL(/\/studio\/j\/dup-co-copy$/)
  await expect(page.locator('#title')).toHaveValue(/\(copy\)/)
})
