#!/usr/bin/env node
/**
 * Capture the demo: boots the e2e server, drives the scenario in a real
 * Chromium with recordVideo, and writes:
 *   - out/capture.webm        the raw screen recording
 *   - out/timings.json        per-caption { caption, title, startMs, endMs }
 *
 * The steps come from scripts/demo/demo-scenario.ts (the LLM-generated
 * surface). Nothing else in the pipeline depends on which steps exist.
 */
import { chromium } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'out')
const PORT = 3124
const DB = '/tmp/knockport-demo.db'

mkdirSync(OUT, { recursive: true })

async function bootServer() {
  // Production mode: React in dev uses eval(), which our CSP blocks, and it
  // logs a warning on every page. A production build removes both the warning
  // and the dev-only overhead, and the capture is faster and more stable.
  const build = spawnSync('pnpm', ['--filter', '@knockport/web', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (build.status !== 0) throw new Error('next build failed')

  const server = spawn('bash', ['-c', `cd apps/web && NODE_ENV=production KNOCKPORT_DB=${DB} KNOCKPORT_STUDIO_PASS=e2epass KNOCKPORT_LOGIN_MAX_ATTEMPTS=1000 PORT=${PORT} HOSTNAME=127.0.0.1 node server.ts`], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  })
  // Wait for the server to answer.
  const base = `http://127.0.0.1:${PORT}`
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/studio/login`)
      if (res.ok) return { server, base }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('demo server did not start')
}

async function main() {
  // Fresh database, then seed the demo journey BEFORE the server boots: the
  // server keeps the sqlite file open (single writer), so writing while it
  // runs conflicts. Seeded first, seedIfEmpty inside the server is a no-op.
  if (existsSync(DB)) spawnSync('rm', ['-f', DB])
  const { execFileSync } = await import('node:child_process')
  execFileSync('node', ['--input-type=module', '-e', `
    import setup from './apps/web/test/e2e/global-setup.ts'
    setup()
  `], { cwd: ROOT, env: { ...process.env, E2E_DB: DB } })

  const { server, base } = await bootServer()

  // Warm the routes: Next dev compiles a route on its first hit, which can
  // exceed the 15s wait in the scenario. Hitting each page once up front
  // makes the recording itself clean.
  for (const path of ['/j/harbor', '/studio/login', '/studio/new']) {
    try {
      await fetch(`${base}${path}`)
    } catch {
      /* route compiles on the first request */
    }
    await new Promise((r) => setTimeout(r, 800))
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    viewport: { width: 1920, height: 1080 },
  })
  const page = await context.newPage()

  const { STEPS, JOURNEY_SLUG } = await import('./demo-scenario.ts')
  const timings = []
  let current = null
  let startedAt = Date.now()

  const mark = async (step) => {
    if (step.caption) {
      if (current) current.endMs = Date.now() - startedAt
      current = { caption: step.caption, title: step.title, act: step.act, zoom: step.zoom, startMs: Date.now() - startedAt, endMs: 0 }
      timings.push(current)
    }
    if (step.pauseMs) await page.waitForTimeout(step.pauseMs)
  }

  for (const step of STEPS) {
    switch (step.action) {
      case 'goto':
        await page.goto(`${base}${step.url}`, { waitUntil: 'load' })
        console.log('goto:', step.url, '->', page.url())
        // The terminal builds itself over a WebSocket; wait for its input
        // only on the candidate page (/j/...), never on studio routes.
        if (/^\/j\//.test(step.url)) {
          const found = await page.waitForSelector('input#cmd', { timeout: 20_000, state: 'attached' }).then(
            () => true,
            () => false,
          )
          if (!found) {
            const body = await page.locator('body').innerText()
            console.error('terminal input missing. url:', page.url())
            console.error('body:', body.slice(0, 160))
            throw new Error('terminal did not build')
          }
        }
        await mark(step)
        break
      case 'type':
        console.log('type:', step.text.slice(0, 40), '->', step.target)
        await page.locator(step.target).fill(step.text)
        await mark(step)
        break
      case 'click':
        console.log('click:', step.target)
        await page.locator(step.target).click()
        await mark(step)
        break
      case 'press':
        await page.locator(step.target).press(step.key)
        await mark(step)
        break
      case 'wait':
        await page.waitForTimeout(step.ms)
        break
    }
  }
  if (current) current.endMs = Date.now() - startedAt

  await page.waitForTimeout(800)
  await context.close() // finalizes the webm
  await browser.close()
  server.kill('SIGTERM')

  // Playwright names the video after the page; find the newest webm.
  const { readdirSync, statSync } = await import('node:fs')
  const files = readdirSync(OUT).filter((f) => f.endsWith('.webm'))
  if (files.length === 0) throw new Error('no webm produced')
  const newest = files.sort((a, b) => statSync(join(OUT, b)).mtimeMs - statSync(join(OUT, a)).mtimeMs)[0]
  const capturePath = join(OUT, newest)
  const finalPath = join(OUT, 'capture.webm')
  const { renameSync } = await import('node:fs')
  renameSync(capturePath, finalPath)

  writeFileSync(join(OUT, 'timings.json'), JSON.stringify({ capture: 'out/capture.webm', scenes: timings }, null, 2))
  console.log(`demo captured: ${finalPath} (${timings.length} scenes, ${Math.round((Date.now() - startedAt) / 1000)}s)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
