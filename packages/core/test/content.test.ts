/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { displayName, resolveDir, resolveFile } from '../src/content.ts'

describe('content resolution', () => {
  it('reads a root file with its frontmatter', () => {
    const whoami = resolveFile(content, ['whoami'])
    expect(whoami?.title).toBe('the short version')
    expect(whoami?.hidden).toBe(false)
    expect(whoami?.body).toContain('Guillaume Flambard')
  })

  it('addresses the hidden file with an initial dot', () => {
    const egg = resolveFile(content, ['.knock'])
    expect(egg?.hidden).toBe(true)
    expect(egg && displayName(egg)).toBe('.knock')
  })

  it('descends into subdirectories', () => {
    const dir = resolveDir(content, ['projects'])
    expect(dir?.files.some((f) => f.name === 'knockport')).toBe(true)
  })

  it('returns undefined for unknown paths', () => {
    expect(resolveDir(content, ['nowhere'])).toBeUndefined()
    expect(resolveFile(content, ['nope'])).toBeUndefined()
  })
})

describe('delivered content integrity', () => {
  it('every file has a title and body', () => {
    const stack = [content.root]
    let seen = 0
    while (stack.length) {
      const dir = stack.pop()!
      for (const f of dir.files) {
        expect(f.title, `${f.name} has no title`).not.toBe('')
        expect(f.body.trim(), `${f.name} has no body`).not.toBe('')
        seen++
      }
      stack.push(...dir.dirs)
    }
    expect(seen).toBeGreaterThanOrEqual(4)
  })

  it('the generated file is up to date relative to content/', () => {
    // Generate into a temporary file and compare. The test never rewrites
    // the file tracked by git: a test that repairs what it measures
    // measures nothing.
    const tmp = join(tmpdir(), `knockport-content-${process.pid}.ts`)
    execFileSync('node', ['scripts/gen-content.mjs', tmp], { stdio: 'pipe' })
    const fresh = readFileSync(tmp, 'utf8')
    rmSync(tmp, { force: true })
    const committed = readFileSync('packages/core/src/content.generated.ts', 'utf8')
    expect(fresh, 'run pnpm gen:content and commit the result').toBe(committed)
  })
})
