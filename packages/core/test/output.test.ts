import { describe, expect, it } from 'vitest'
import { failureOutput, fromTexts, styledLine, textOutput } from '../src/output.ts'
import { newSession, prompt } from '../src/session.ts'

describe('output factories', () => {
  it('textOutput returns a plain line with no effect and not marked as failed', () => {
    const out = textOutput('hello')
    expect(out.lines).toHaveLength(1)
    expect(out.lines[0]!.spans[0]!.text).toBe('hello')
    expect(out.lines[0]!.spans[0]!.style).toBe('plain')
    expect(out.effect).toBeUndefined()
    expect(out.failed).toBe(false)
  })

  it('failureOutput prefixes the program name and marks output', () => {
    const out = failureOutput('cd: nowhere: no such directory')
    expect(out.failed).toBe(true)
    expect(out.lines[0]!.spans[0]!.text).toBe('knockport: cd: nowhere: no such directory')
    expect(out.lines[0]!.spans[0]!.style).toBe('accent')
  })

  it('fromTexts returns one line per text', () => {
    const out = fromTexts(['a', 'b', 'c'])
    expect(out.lines).toHaveLength(3)
    expect(out.lines[2]!.spans[0]!.text).toBe('c')
  })

  it('styledLine preserves its style', () => {
    expect(styledLine('dim', 'dim').spans[0]!.style).toBe('dim')
  })
})

describe('prompt', () => {
  it('returns root in normal mode', () => {
    expect(prompt(newSession())).toBe('~/$ ')
  })

  it('returns the current path', () => {
    const s = newSession()
    s.cwd = ['projects']
    expect(prompt(s)).toBe('~/projects$ ')
  })

  it('changes the prompt at each contact step', () => {
    const s = newSession()
    s.mode = { kind: 'contact', step: 'name', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your name> ')
    s.mode = { kind: 'contact', step: 'email', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your email> ')
    s.mode = { kind: 'contact', step: 'message', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your message> ')
  })
})
