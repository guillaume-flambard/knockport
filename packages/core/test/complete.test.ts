import { describe, expect, it } from 'vitest'
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
    const found = complete(newSession(), content, 'cat ')
    expect(found).toEqual([...found].sort())
  })
})
