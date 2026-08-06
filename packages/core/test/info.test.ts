import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { help, history, show } from '../src/commands/info.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('help', () => {
  it('liste toutes les commandes principales', () => {
    const rendered = flatten(help())
    for (const name of ['ls', 'cd', 'pwd', 'cat', 'whoami', 'stack', 'cv', 'contact', 'book', 'exit']) {
      expect(rendered, `help ne mentionne pas ${name}`).toContain(name)
    }
  })

  it('ne mentionne jamais le fichier cache', () => {
    expect(flatten(help())).not.toContain('knock')
  })

  it('aligne les noms sur neuf caracteres', () => {
    expect(help().lines[2]!.spans[0]!.text).toBe('  ls       ')
  })
})

describe('history', () => {
  it('numerote les lignes, alignees a droite sur trois caracteres', () => {
    const s = newSession()
    s.history.push('ls', 'whoami')
    const rendered = flatten(history(s))
    expect(rendered).toContain('  1  ls')
    expect(rendered).toContain('  2  whoami')
  })

  it('rend une sortie vide sur une session neuve', () => {
    expect(history(newSession()).lines).toHaveLength(0)
  })
})

describe('show', () => {
  it('imprime le corps du fichier demande', () => {
    expect(flatten(show(content, 'whoami'))).toContain('Guillaume Flambard')
  })

  it('explique un contenu manquant', () => {
    const out = show(content, 'absent')
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('content is missing')
  })
})
