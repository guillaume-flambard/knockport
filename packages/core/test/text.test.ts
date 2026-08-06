import { describe, expect, it } from 'vitest'
import { charCount, lines, words } from '../src/text.ts'

describe('lines, aligné sur str::lines() de Rust', () => {
  it('ne produit pas de ligne vide finale', () => {
    expect(lines('a\n')).toEqual(['a'])
  })
  it('conserve une ligne vide interne', () => {
    expect(lines('a\n\n')).toEqual(['a', ''])
  })
  it('rend un tableau vide sur une chaine vide', () => {
    expect(lines('')).toEqual([])
  })
  it('coupe le retour chariot de fin de ligne', () => {
    expect(lines('a\r\nb')).toEqual(['a', 'b'])
  })
  it('garde les lignes ordinaires', () => {
    expect(lines('a\nb')).toEqual(['a', 'b'])
  })
})

describe('words, aligné sur split_whitespace() de Rust', () => {
  it('rend un tableau vide sur du blanc pur', () => {
    expect(words('   ')).toEqual([])
  })
  it('effondre les suites de blancs', () => {
    expect(words('  cat   projects/knockport  ')).toEqual(['cat', 'projects/knockport'])
  })
  it('decout les blancs reachables: espaces, tabulations, retours a la ligne', () => {
    expect(words('hello\tworld\ngoodbye')).toEqual(['hello', 'world', 'goodbye'])
  })
})

describe('charCount, aligné sur chars().count() de Rust', () => {
  it('compte les points de code, pas les unites UTF-16', () => {
    expect(charCount('ab')).toBe(2)
    expect('🙂'.length).toBe(2)
    expect(charCount('🙂')).toBe(1)
  })
})
