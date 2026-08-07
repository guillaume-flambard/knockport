#!/usr/bin/env node
/**
 * The LLM hook of the demo pipeline. Reads the product documentation and the
 * current scenario, then writes scripts/demo/demo-scenario.ts with a fresh
 * walkthrough. Run it when the product changes; edit the result by hand.
 *
 * Usage: node scripts/demo/generate-scenario.mjs   (then edit + demo:capture)
 *
 * This script is a scaffold: it produces a reasonable default scenario. An
 * LLM invoked here should read README.md and apps/web source, then rewrite
 * scripts/demo/demo-scenario.ts to match the current product.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scenarioPath = join(ROOT, 'scripts', 'demo', 'demo-scenario.ts')

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').slice(0, 1200)

const scaffold = `/**
 * AUTO-GENERATED SCAFFOLD from generate-scenario.mjs.
 * Rewrite this file to match the product, then run pnpm demo:capture.
 * See scripts/demo/README.md for the step shapes.
 */

export type Step =
  | { action: 'goto'; url: string; pauseMs?: number; caption?: string; title?: string }
  | { action: 'type'; target: string; text: string; pauseMs?: number; caption?: string; title?: string }
  | { action: 'click'; target: string; pauseMs?: number; caption?: string; title?: string }
  | { action: 'press'; target: string; key: string; pauseMs?: number; caption?: string; title?: string }
  | { action: 'wait'; ms: number }

export const JOURNEY_SLUG = 'harbor'
export const STUDIO_PASS = 'e2epass'

export const STEPS: Step[] = [
  { action: 'goto', url: '/', pauseMs: 2500, caption: 'knockport', title: 'knockport' },
  { action: 'goto', url: '/j/harbor', pauseMs: 3000, caption: 'The terminal', title: 'The candidate page' },
  { action: 'wait', ms: 1000 },
]
`

writeFileSync(scenarioPath, scaffold)
console.log(`scaffold written to ${scenarioPath}`)
console.log('README summary used:')
console.log(readme.split('\n').slice(0, 6).join('\n'))
