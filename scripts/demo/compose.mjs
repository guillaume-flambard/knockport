#!/usr/bin/env node
/**
 * Render the demo video with Remotion. Copies the capture and timings into
 * the Remotion public dir, then renders the composition to out/demo-final.mp4
 * with the scenes injected as props.
 *
 * Run after pnpm demo:capture. Requires demo/remotion dependencies:
 *   cd demo/remotion && npm install
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'out')
const REMOTION = join(ROOT, 'demo', 'remotion')
const capture = join(OUT, 'capture.webm')
const timings = join(OUT, 'timings.json')

mkdirSync(OUT, { recursive: true })

if (!existsSync(capture) || !existsSync(timings)) {
  console.error('missing out/capture.webm or out/timings.json — run pnpm demo:capture first')
  process.exit(1)
}

// Stage assets where the composition can reach them.
const staticDir = join(REMOTION, 'public')
mkdirSync(staticDir, { recursive: true })
copyFileSync(capture, join(staticDir, 'capture.webm'))
copyFileSync(timings, join(staticDir, 'timings.json'))
const music = join(ROOT, 'assets', 'background.mp3')
const hasMusic = existsSync(music)
if (hasMusic) copyFileSync(music, join(staticDir, 'background.mp3'))
const whoosh = join(ROOT, 'assets', 'whoosh.mp3')
const hasWhoosh = existsSync(whoosh)
if (hasWhoosh) copyFileSync(whoosh, join(staticDir, 'whoosh.mp3'))

const timingsData = JSON.parse(readFileSync(timings, 'utf8'))
const props = { scenes: timingsData.scenes ?? [], hasMusic, hasWhoosh }

// --props is a JSON string the CLI injects into the composition.
const propsJson = JSON.stringify(props)

const r = spawnSync(
  'npx',
  ['remotion', 'render', 'src/index.ts', 'DemoVideo', join(OUT, 'demo-final.mp4'), '--log=error', `--props=${propsJson}`],
  { cwd: REMOTION, stdio: 'inherit', env: process.env },
)
if (r.status !== 0) process.exit(r.status ?? 1)
console.log(`demo rendered: ${join(OUT, 'demo-final.mp4')}`)
