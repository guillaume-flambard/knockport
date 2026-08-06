import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { cat, cd, ls, pwd } from '../src/commands/fs.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('ls', () => {
  it('liste les repertoires puis les fichiers', () => {
    const rendered = flatten(ls(newSession(), content, []))
    expect(rendered).toContain('projects/')
    expect(rendered).toContain('whoami')
  })

  it('cache le fichier cache par defaut', () => {
    expect(flatten(ls(newSession(), content, []))).not.toContain('.knock')
  })

  it('revele le fichier cache avec -a', () => {
    expect(flatten(ls(newSession(), content, ['-a']))).toContain('.knock')
  })

  it('explique un repertoire inconnu', () => {
    const out = ls(newSession(), content, ['nowhere'])
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('no such directory')
  })
})

describe('cd et pwd', () => {
  it('se deplace puis rapporte', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    expect(s.cwd).toEqual(['projects'])
    expect(flatten(pwd(s))).toContain('~/projects')
  })

  it('remonte avec .. et s arrete a la racine', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, ['..'])
    expect(s.cwd).toEqual([])
    cd(s, content, ['..'])
    expect(s.cwd, 'la racine n a pas de parent').toEqual([])
  })

  it('sans argument, revient a la racine', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, [])
    expect(s.cwd).toEqual([])
  })

  it('refuse un repertoire inconnu sans bouger', () => {
    const s = newSession()
    const out = cd(s, content, ['nowhere'])
    expect(flatten(out)).toContain('no such directory')
    expect(s.cwd).toEqual([])
  })
})

describe('cat', () => {
  it('imprime le corps du fichier', () => {
    expect(flatten(cat(newSession(), content, ['whoami']))).toContain('Guillaume Flambard')
  })

  it('refuse un repertoire', () => {
    expect(flatten(cat(newSession(), content, ['projects']))).toContain('is a directory')
  })

  it('reclame un argument', () => {
    expect(flatten(cat(newSession(), content, []))).toContain('which file')
  })

  it('lire le fichier cache marque la session', () => {
    const s = newSession()
    expect(s.eggFound).toBe(false)
    cat(s, content, ['.knock'])
    expect(s.eggFound).toBe(true)
  })

  it('un fichier ordinaire ne marque pas la session', () => {
    const s = newSession()
    cat(s, content, ['whoami'])
    expect(s.eggFound).toBe(false)
  })

  it('n ajoute pas de ligne vide finale', () => {
    const out = cat(newSession(), content, ['knock'])
    expect(out.lines.at(-1)!.spans[0]!.text).not.toBe('')
  })
})
