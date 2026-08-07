import { describe, expect, it } from 'vitest'
import { execute, parse } from '../src/command.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('parse', () => {
  it('parses a bare command', () => {
    expect(parse('ls')).toEqual({ name: 'ls', args: [] })
  })

  it('parses arguments and collapses whitespace', () => {
    expect(parse('  cat   projects/knockport  ')).toEqual({
      name: 'cat', args: ['projects/knockport'],
    })
  })

  it('empty input is not a command', () => {
    expect(parse('   ')).toBeUndefined()
  })
})

describe('execute', () => {
  it('records input in the journal', () => {
    const s = newSession()
    execute(s, content, 'whoami', 1500)
    expect(s.journal).toHaveLength(1)
    expect(s.journal[0]).toEqual({ atMs: 1500, input: 'whoami', ok: true })
  })

  it('empty input produces nothing and is not journaled', () => {
    const s = newSession()
    const out = execute(s, content, '', 10)
    expect(out.lines).toHaveLength(0)
    expect(s.journal).toHaveLength(0)
    expect(s.history).toHaveLength(0)
  })

  it('unknown command suggests help and is marked as failed', () => {
    const s = newSession()
    const out = execute(s, content, 'sudo rm -rf /', 20)
    expect(flatten(out)).toContain('help')
    expect(s.journal[0]!.ok).toBe(false)
  })

  it('clear and exit carry their effect', () => {
    const s = newSession()
    expect(execute(s, content, 'clear', 1).effect).toEqual({ kind: 'clear' })
    expect(execute(s, content, 'exit', 2).effect).toEqual({ kind: 'quit' })
    expect(execute(s, content, 'logout', 3).effect).toEqual({ kind: 'quit' })
  })

  it('cv and book open a URL marker', () => {
    const s = newSession()
    expect(execute(s, content, 'cv', 1).effect).toEqual({ kind: 'openUrl', url: '{{cv_url}}' })
    expect(execute(s, content, 'book', 2).effect).toEqual({ kind: 'openUrl', url: '{{book_url}}' })
  })

  it('in contact mode, the journal masks visitor input', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.journal.at(-1)).toEqual({ atMs: 2, input: '<contact>', ok: true })
  })

  it('in contact mode, input does not go into history', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.history).toEqual(['contact'])
  })
})
