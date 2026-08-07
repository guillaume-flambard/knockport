import { describe, expect, it } from 'vitest'
import { execute, parse } from '../src/command.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('parse', () => {
  it('lit une commande nue', () => {
    expect(parse('ls')).toEqual({ name: 'ls', args: [] })
  })

  it('lit les arguments et effondre les blancs', () => {
    expect(parse('  cat   projects/knockport  ')).toEqual({
      name: 'cat', args: ['projects/knockport'],
    })
  })

  it('une entree vide n est pas une commande', () => {
    expect(parse('   ')).toBeUndefined()
  })
})

describe('execute', () => {
  it('enregistre l entree dans le journal', () => {
    const s = newSession()
    execute(s, content, 'whoami', 1500)
    expect(s.journal).toHaveLength(1)
    expect(s.journal[0]).toEqual({ atMs: 1500, input: 'whoami', ok: true })
  })

  it('une entree vide ne produit rien et n est pas journalisee', () => {
    const s = newSession()
    const out = execute(s, content, '', 10)
    expect(out.lines).toHaveLength(0)
    expect(s.journal).toHaveLength(0)
    expect(s.history).toHaveLength(0)
  })

  it('une commande inconnue suggere help et est marquee en echec', () => {
    const s = newSession()
    const out = execute(s, content, 'sudo rm -rf /', 20)
    expect(flatten(out)).toContain('help')
    expect(s.journal[0]!.ok).toBe(false)
  })

  it('clear et exit portent leur effet', () => {
    const s = newSession()
    expect(execute(s, content, 'clear', 1).effect).toEqual({ kind: 'clear' })
    expect(execute(s, content, 'exit', 2).effect).toEqual({ kind: 'quit' })
    expect(execute(s, content, 'logout', 3).effect).toEqual({ kind: 'quit' })
  })

  it('cv et book ouvrent un marqueur d URL', () => {
    const s = newSession()
    expect(execute(s, content, 'cv', 1).effect).toEqual({ kind: 'openUrl', url: '{{cv_url}}' })
    expect(execute(s, content, 'book', 2).effect).toEqual({ kind: 'openUrl', url: '{{book_url}}' })
  })

  it('en mode contact, le journal masque la saisie du visiteur', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.journal.at(-1)).toEqual({ atMs: 2, input: '<contact>', ok: true })
  })

  it('en mode contact, la saisie n entre pas dans l historique', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.history).toEqual(['contact'])
  })
})
