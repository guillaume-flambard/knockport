import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { cat, cd, ls, pwd } from '../src/commands/fs.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('ls', () => {
  it('lists directories then files', () => {
    const rendered = flatten(ls(newSession(), content, []))
    expect(rendered).toContain('projects/')
    expect(rendered).toContain('whoami')
  })

  it('hides the hidden file by default', () => {
    expect(flatten(ls(newSession(), content, []))).not.toContain('.knock')
  })

  it('reveals the hidden file with -a', () => {
    expect(flatten(ls(newSession(), content, ['-a']))).toContain('.knock')
  })

  it('explains an unknown directory', () => {
    const out = ls(newSession(), content, ['nowhere'])
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('no such directory')
  })
})

describe('cd and pwd', () => {
  it('moves and then reports', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    expect(s.cwd).toEqual(['projects'])
    expect(flatten(pwd(s))).toContain('~/projects')
  })

  it('goes up with .. and stops at root', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, ['..'])
    expect(s.cwd).toEqual([])
    cd(s, content, ['..'])
    expect(s.cwd, 'root has no parent').toEqual([])
  })

  it('with no argument, returns to root', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, [])
    expect(s.cwd).toEqual([])
  })

  it('refuses an unknown directory without moving', () => {
    const s = newSession()
    const out = cd(s, content, ['nowhere'])
    expect(flatten(out)).toContain('no such directory')
    expect(s.cwd).toEqual([])
  })
})

describe('cat', () => {
  it('prints the file body', () => {
    expect(flatten(cat(newSession(), content, ['whoami']))).toContain('Guillaume Flambard')
  })

  it('refuses a directory', () => {
    expect(flatten(cat(newSession(), content, ['projects']))).toContain('is a directory')
  })

  it('demands an argument', () => {
    expect(flatten(cat(newSession(), content, []))).toContain('which file')
  })

  it('reading the hidden file marks the session', () => {
    const s = newSession()
    expect(s.eggFound).toBe(false)
    cat(s, content, ['.knock'])
    expect(s.eggFound).toBe(true)
  })

  it('an ordinary file does not mark the session', () => {
    const s = newSession()
    cat(s, content, ['whoami'])
    expect(s.eggFound).toBe(false)
  })

  it('does not add a trailing empty line', () => {
    const out = cat(newSession(), content, ['knock'])
    expect(out.lines.at(-1)!.spans[0]!.text).not.toBe('')
  })
})
