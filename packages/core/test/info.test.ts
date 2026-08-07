import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { help, history, show } from '../src/commands/info.ts'
import { companyJourney } from './fixture.ts'
import { newSession } from '../src/session.ts'
import type { Content } from '../src/content.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('help', () => {
  it('lists every builtin', () => {
    const rendered = flatten(help(content))
    for (const name of ['ls', 'cd', 'pwd', 'cat', 'cv', 'contact', 'book', 'exit']) {
      expect(rendered, `help does not mention ${name}`).toContain(name)
    }
  })

  it("lists the journey's own sections, with their titles", () => {
    const rendered = flatten(help(companyJourney))
    expect(rendered).toContain('role')
    expect(rendered).toContain('the role')
  })

  it('never mentions the hidden file', () => {
    expect(flatten(help(companyJourney))).not.toContain('knock')
  })

  it('does not list a section that lives in a directory', () => {
    expect(flatten(help(companyJourney))).not.toContain('oris')
  })

  it('aligns names to nine characters', () => {
    expect(help(content).lines[2]!.spans[0]!.text).toBe('  ls       ')
  })

  it('widens the column for a long section name', () => {
    const wide: Content = {
      root: {
        name: '',
        dirs: [],
        files: [
          { name: 'how-we-work', title: 'how we work', order: 1, hidden: false, body: '' },
        ],
      },
    }
    // Two leading spaces, then the column sized on the longest name plus two.
    expect(help(wide).lines[2]!.spans[0]!.text).toBe(`  ${'ls'.padEnd('how-we-work'.length + 2)}`)
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
  it('prints the file body, one line per line', () => {
    const file = content.root.files.find((f) => f.name === 'whoami')!
    const out = show(file)
    expect(flatten(out)).toContain('Memo Labs')
    expect(out.failed).toBe(false)
  })
})
