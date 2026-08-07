import { describe, expect, it } from 'vitest'
import type { Content } from '../src/content.ts'
import { complete } from '../src/complete.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'

describe('complete', () => {
  it('complete un nom de commande', () => {
    expect(complete(newSession(), content, 'wh')).toEqual(['whoami'])
  })

  it('complete un argument de chemin', () => {
    expect(complete(newSession(), content, 'cd pro')).toContain('cd projects')
  })

  it('ne complete jamais le fichier cache', () => {
    expect(complete(newSession(), content, 'cat .kn')).toEqual([])
  })

  it('ne rend rien sans correspondance', () => {
    expect(complete(newSession(), content, 'xyz')).toEqual([])
  })

  it('ne rend rien sur un prefixe d argument vide', () => {
    expect(complete(newSession(), content, 'cd ')).toEqual([])
  })

  it('rend les resultats tries', () => {
    const fixture: Content = {
      root: {
        name: 'root',
        dirs: [
          { name: 'alpine', dirs: [], files: [] },
          { name: 'zeta', dirs: [], files: [] },
        ],
        files: [
          { name: 'beta', title: '', order: 0, hidden: false, body: '' },
          { name: 'alpha', title: '', order: 1, hidden: false, body: '' },
          { name: 'alto', title: '', order: 2, hidden: false, body: '' },
        ],
      },
    }
    const found = complete(newSession(), fixture, 'cat al')
    expect(found).toEqual(['cat alpha', 'cat alpine', 'cat alto'])
  })
})
