import { describe, expect, it } from 'vitest'
import { failureOutput, fromTexts, styledLine, textOutput } from '../src/output.ts'
import { newSession, prompt } from '../src/session.ts'

describe('fabriques de sortie', () => {
  it('textOutput rend une ligne plain, sans effet et non marquee en echec', () => {
    const out = textOutput('hello')
    expect(out.lines).toHaveLength(1)
    expect(out.lines[0]!.spans[0]!.text).toBe('hello')
    expect(out.lines[0]!.spans[0]!.style).toBe('plain')
    expect(out.effect).toBeUndefined()
    expect(out.failed).toBe(false)
  })

  it('failureOutput prefixe le nom du programme et marque la sortie', () => {
    const out = failureOutput('cd: nowhere: no such directory')
    expect(out.failed).toBe(true)
    expect(out.lines[0]!.spans[0]!.text).toBe('knockport: cd: nowhere: no such directory')
    expect(out.lines[0]!.spans[0]!.style).toBe('accent')
  })

  it('fromTexts rend une ligne par texte', () => {
    const out = fromTexts(['a', 'b', 'c'])
    expect(out.lines).toHaveLength(3)
    expect(out.lines[2]!.spans[0]!.text).toBe('c')
  })

  it('styledLine conserve son style', () => {
    expect(styledLine('dim', 'dim').spans[0]!.style).toBe('dim')
  })
})

describe('prompt', () => {
  it('rend la racine en mode normal', () => {
    expect(prompt(newSession())).toBe('~/$ ')
  })

  it('rend le chemin courant', () => {
    const s = newSession()
    s.cwd = ['projects']
    expect(prompt(s)).toBe('~/projects$ ')
  })

  it('change de question a chaque etape du contact', () => {
    const s = newSession()
    s.mode = { kind: 'contact', step: 'name', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your name> ')
    s.mode = { kind: 'contact', step: 'email', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your email> ')
    s.mode = { kind: 'contact', step: 'message', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your message> ')
  })
})
