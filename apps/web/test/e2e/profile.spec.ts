import { expect, test } from '@playwright/test'

/**
 * The plain, JavaScript-free page. It must render the journey as text and
 * accept a contact submission with JavaScript disabled: the form is a server
 * action that posts without any client code, so it is exercised here in a
 * browser with JS turned off.
 */

test('the profile page renders the journey as plain text', async ({ page }) => {
  await page.goto('/j/e2e-main/profile')
  await expect(page.getByRole('heading', { name: /Working at/ })).toBeVisible()
  await expect(page.getByText(/We are E2E Co\./)).toBeVisible()
})

test('the profile contact form works with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/j/e2e-main/profile')
  await page.locator('input[name=name]').fill('Grace Hopper')
  await page.locator('input[name=email]').fill('grace@example.com')
  await page.locator('textarea[name=message]').fill('Applying from the plain page.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page).toHaveURL(/sent=1/)
  await expect(page.getByText(/Sent\. We read everything/)).toBeVisible()
  await context.close()
})
