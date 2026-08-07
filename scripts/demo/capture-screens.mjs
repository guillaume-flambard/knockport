#!/usr/bin/env node
/**
 * Capture the real app screens at viewports matching the Stitch references,
 * so they can be compared side by side (brand/stitch/comparison.html) and
 * pixel-diffed. Writes actual-<name>.png into brand/stitch/.
 *
 * The Stitch refs are 2560x2048/2160 (desktop) and 780x1768 (mobile); we
 * capture at a proportional viewport (1280x1024 desktop, 390x884 mobile).
 */
import { chromium } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STITCH = join(ROOT, 'brand', 'stitch')
const PORT = 3126
const DB = '/tmp/knockport-capture.db'
const BASE = `http://127.0.0.1:${PORT}`

const DESKTOP = { width: 1280, height: 1024 }
const MOBILE = { width: 390, height: 884 }

const SCREENS = [
  { name: 'landing', path: '/', viewport: DESKTOP },
  { name: 'terminal', path: '/j/memo-labs', viewport: DESKTOP, waitTerminal: true },
  { name: 'studio-dashboard', path: '/studio', viewport: DESKTOP, studio: true },
  { name: 'studio-login', path: '/studio/login', viewport: DESKTOP },
  { name: 'studio-builder', path: '/studio/new', viewport: DESKTOP, studio: true },
  { name: 'edit-journey', path: '/studio/j/memo-labs', viewport: DESKTOP, studio: true },
  { name: 'wizard-publish', path: '/studio/new', viewport: DESKTOP, studio: true, step: 3 },
  { name: 'profile-noscript', path: '/j/memo-labs/profile', viewport: DESKTOP },
  { name: 'inbox', path: '/studio/j/memo-labs/inbox', viewport: DESKTOP, studio: true },
  { name: 'terminal-mobile', path: '/j/memo-labs', viewport: MOBILE, waitTerminal: true },
]

mkdirSync(STITCH, { recursive: true })

// Fresh DB, seed with the real demo journey (memo-labs) before the server
// boots (single writer). The e2e global setup seeds `harbor`; the product
// demo is memo-labs, which is what these captures should show.
if (existsSync(DB)) spawnSync('rm', ['-f', DB])
spawnSync('node', ['scripts/seed-demo.ts'], {
  cwd: ROOT,
  env: { ...process.env, KNOCKPORT_DB: DB },
})

// Production server on the demo DB.
const { spawn } = await import('node:child_process')
const server = spawn('bash', ['-c', `cd apps/web && NODE_ENV=production KNOCKPORT_DB=${DB} KNOCKPORT_STUDIO_PASS=e2epass KNOCKPORT_LOGIN_MAX_ATTEMPTS=1000 PORT=${PORT} HOSTNAME=127.0.0.1 node server.ts`], {
  cwd: ROOT, stdio: 'ignore', detached: true,
})
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/studio/login`); if (r.ok) break } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 500))
}

// Warm the routes (Next prod compiles on first hit).
for (const p of ['/j/memo-labs', '/studio/login', '/studio/new', '/studio', `/studio/j/memo-labs`, `/studio/j/memo-labs/inbox`, '/j/memo-labs/profile']) {
  try { await fetch(`${BASE}${p}`) } catch { /* route compiles */ }
  await new Promise((r) => setTimeout(r, 400))
}

const browser = await chromium.launch()

async function loginStudio(page) {
  await page.goto(`${BASE}/studio/login`)
  await page.locator('#pass').fill('e2epass')
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/\/studio$/)
}

async function capture(screen) {
  const ctx = await browser.newContext({ viewport: screen.viewport })
  const page = await ctx.newPage()
  try {
    if (screen.studio) await loginStudio(page)
    if (screen.waitTerminal) await page.waitForSelector('input#cmd', { timeout: 15000 })
    if (screen.path === '/studio/new' && screen.step === 3) {
      // Wizard step 3: fill step 1 + 2, then land on publish.
      await page.goto(`${BASE}/studio/new`)
      await page.locator('#companyName').fill('Harbor')
      await page.locator('#slug').fill('harbor-offer')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.locator('#title').fill('Working at Harbor')
      await page.locator('#banner').fill('Welcome to Harbor.')
      await page.locator('#s-0-name').fill('whoami')
      await page.locator('#s-0-title').fill('who we are')
      await page.locator('#s-0-body').fill('Harbor is a small product company.')
      await page.getByRole('button', { name: 'Continue' }).click()
    } else {
      await page.goto(`${BASE}${screen.path}`)
    }
    await page.waitForTimeout(1200) // let fonts/layout settle
    await page.screenshot({ path: join(STITCH, `actual-${screen.name}.png`) })
    console.log(`captured actual-${screen.name}.png (${screen.viewport.width}x${screen.viewport.height})`)
  } catch (e) {
    console.error(`FAIL ${screen.name}: ${e.message}`)
  } finally {
    await ctx.close()
  }
}

for (const screen of SCREENS) {
  await capture(screen)
}

await browser.close()
server.kill('SIGTERM')
console.log('done')
