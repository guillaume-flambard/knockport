import { expect, test, type Page } from '@playwright/test'

/**
 * Candidate end-to-end: visiting a published journey, exploring the terminal,
 * and leaving a contact message that lands in the studio inbox.
 */

async function fillContact(page: Page, name: string, email: string, message: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Type a command' }).fill('contact')
  await page.getByRole('textbox', { name: 'Type a command' }).press('Enter')
  await page.getByRole('textbox', { name: 'Type a command' }).fill(name)
  await page.getByRole('textbox', { name: 'Type a command' }).press('Enter')
  await page.getByRole('textbox', { name: 'Type a command' }).fill(email)
  await page.getByRole('textbox', { name: 'Type a command' }).press('Enter')
  await page.getByRole('textbox', { name: 'Type a command' }).fill(message)
  await page.getByRole('textbox', { name: 'Type a command' }).press('Enter')
}

test('the journey banner greets with a first-run nudge', async ({ page }) => {
  await page.goto('/j/harbor')
  await expect(page.getByText(/Welcome to Harbor\./)).toBeVisible()
  await expect(page.getByText(/try `ls` to look around, or `contact` to reach out/)).toBeVisible()
})

test('a candidate can ls, read a file, and be guided to contact', async ({ page }) => {
  await page.goto('/j/harbor')
  const input = page.getByRole('textbox', { name: 'Type a command' })

  await input.fill('ls')
  await input.press('Enter')
  await expect(page.getByText(/whoami/)).toBeVisible()

  await input.fill('whoami')
  await input.press('Enter')
  await expect(page.getByText(/Harbor is a small product company/)).toBeVisible()
})

test('an unknown command suggests a close command', async ({ page }) => {
  await page.goto('/j/harbor')
  const input = page.getByRole('textbox', { name: 'Type a command' })
  await input.fill('hlp')
  await input.press('Enter')
  await expect(page.getByText(/did you mean help\?/)).toBeVisible()
})

test('grouped help lists navigation and the journey sections', async ({ page }) => {
  await page.goto('/j/harbor')
  const input = page.getByRole('textbox', { name: 'Type a command' })
  await input.fill('help')
  await input.press('Enter')
  await expect(page.getByText(/navigate/)).toBeVisible()
  await expect(page.getByText(/this journey/)).toBeVisible()
  await expect(page.getByText(/example: cat <file>/)).toBeVisible()
})

test('a full contact flow lands in the studio inbox with a timeline', async ({ page, context }) => {
  // Candidate: submit contact.
  const candidate = await context.newPage()
  await candidate.goto('/j/harbor')
  await fillContact(candidate, 'Ada Lovelace', 'ada@example.com', 'I read ls -a.')
  await expect(candidate.getByText(/Sent\./)).toBeVisible()
  // Closing the page drops the WebSocket, which flushes the session journal
  // to the database in one transaction. Without it the timeline is empty.
  await candidate.close()
  // The flush is async; give the journal a beat to land before reading it.
  await page.waitForTimeout(300)

  // Recruiter: check the inbox.
  await page.goto('/studio/login')
  await page.locator('#pass').fill('e2epass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await page.goto('/studio/j/harbor/inbox')
  const adaCard = page.getByRole('article').filter({ hasText: 'Ada Lovelace' })
  await expect(adaCard.getByText('Ada Lovelace')).toBeVisible()
  await expect(adaCard.getByText('I read ls -a.')).toBeVisible()
  await expect(adaCard.getByText('Session_Log')).toBeVisible()
  await expect(adaCard.locator('.timeline')).toContainText('contact')
})

test('contact can be cancelled without sending anything', async ({ page }) => {
  await page.goto('/j/harbor')
  const input = page.getByRole('textbox', { name: 'Type a command' })
  await input.fill('contact')
  await input.press('Enter')
  await input.fill('cancel')
  await input.press('Enter')
  await expect(page.getByText(/Dropped\. Nothing was sent\./)).toBeVisible()
})
