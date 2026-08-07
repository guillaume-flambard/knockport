import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { help, history, show } from '../src/commands/info.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('help', () => {
  it('lists all main commands', () => {
    const rendered = flatten(help())
    for (const name of ['ls', 'cd', 'pwd', 'cat', 'whoami', 'stack', 'cv', 'contact', 'book', 'exit']) {
      expect(rendered, `help does not mention ${name}`).toContain(name)
    }
  })

  it('never mentions the hidden file', () => {
    expect(flatten(help())).not.toContain('knock')
  })

  it('aligns names to nine characters', () => {
    expect(help().lines[2]!.spans[0]!.text).toBe('  ls       ')
  })
})

describe('history', () => {
  it('numbers lines, right-aligned to three characters', () => {
    const s = newSession()
    s.history.push('ls', 'whoami')
    const rendered = flatten(history(s))
    expect(rendered).toContain('  1  ls')
    expect(rendered).toContain('  2  whoami')
  })

  it('returns empty output on a new session', () => {
    expect(history(newSession()).lines).toHaveLength(0)
  })
})

describe('show', () => {
  it('prints the requested file body', () => {
    expect(flatten(show(content, 'whoami'))).toContain('Guillaume Flambard')
  })

  it('explains missing content', () => {
    const out = show(content, 'absent')
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('content is missing')
  })
})
