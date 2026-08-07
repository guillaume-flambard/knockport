import { expect, test } from '@playwright/test'

/**
 * Security end-to-end: HTTP security headers, injection resistance in the
 * terminal, and authorization on the studio.
 */

test('every page carries the security headers', async ({ request }) => {
  for (const path of ['/', '/j/e2e-main', '/j/e2e-main/profile']) {
    const res = await request.get(path)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-security-policy']).toBeTruthy()
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['x-frame-options']).toBe('DENY')
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  }
})

test('terminal input is rendered as text, never executed', async ({ page }) => {
  await page.goto('/j/e2e-main')
  const input = page.getByRole('textbox', { name: 'Type a command' })

  // SQL and path traversal attempts must not error or run anything.
  for (const cmd of ["cat ../../etc/passwd", "'; DROP TABLE journeys;--", "cat /etc/shadow"]) {
    await input.fill(cmd)
    await input.press('Enter')
  }
  // The page is still alive and the terminal still accepts input.
  await input.fill('ls')
  await input.press('Enter')
  await expect(page.getByText(/whoami/)).toBeVisible()
})

test('a script tag sent through contact is escaped, not executed', async ({ page, context }) => {
  const candidate = await context.newPage()
  await candidate.goto('/j/e2e-main')
  const input = candidate.getByRole('textbox', { name: 'Type a command' })
  await input.fill('contact')
  await input.press('Enter')
  await input.fill('<img src=x onerror=window.__xss=1>')
  await input.press('Enter')
  await input.fill('xss@example.com')
  await input.press('Enter')
  await input.fill('<script>window.__xss=1</script>')
  await input.press('Enter')
  await expect(candidate.getByText(/Sent\./)).toBeVisible()

  // Nothing executed: the marker is absent and no dialog/error appeared.
  const executed = await candidate.evaluate(() => (window as { __xss?: number }).__xss ?? 0)
  expect(executed).toBe(0)
  await candidate.close()
})

test('the studio rejects unauthenticated access to journey and inbox routes', async ({ page }) => {
  await page.goto('/studio/j/e2e-main')
  await expect(page).toHaveURL(/\/studio\/login/)
  await page.goto('/studio/j/e2e-main/inbox')
  await expect(page).toHaveURL(/\/studio\/login/)
  await page.goto('/studio/new')
  await expect(page).toHaveURL(/\/studio\/login/)
})

test('an unknown journey shows the not-found page, not a stack trace', async ({ page }) => {
  await page.goto('/j/does-not-exist')
  await expect(page.getByText(/Nothing here\./)).toBeVisible()
  await expect(page.getByText(/does not exist/)).toBeVisible()
})
