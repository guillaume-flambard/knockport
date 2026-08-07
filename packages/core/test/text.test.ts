import { describe, expect, it } from 'vitest'
import { charCount, lines, words } from '../src/text.ts'

describe('lines, aligned with Rust str::lines()', () => {
  it('does not produce a trailing empty line', () => {
    expect(lines('a\n')).toEqual(['a'])
  })
  it('preserves an internal empty line', () => {
    expect(lines('a\n\n')).toEqual(['a', ''])
  })
  it('returns an empty array for an empty string', () => {
    expect(lines('')).toEqual([])
  })
  it('strips the carriage return from line endings', () => {
    expect(lines('a\r\nb')).toEqual(['a', 'b'])
  })
  it('preserves ordinary lines', () => {
    expect(lines('a\nb')).toEqual(['a', 'b'])
  })
})

describe('words, aligned with Rust split_whitespace()', () => {
  it('returns an empty array for pure whitespace', () => {
    expect(words('   ')).toEqual([])
  })
  it('collapses sequences of whitespace', () => {
    expect(words('  cat   projects/knockport  ')).toEqual(['cat', 'projects/knockport'])
  })
  it('treats whitespace inclusively: spaces, tabs, newlines', () => {
    expect(words('hello\tworld\ngoodbye')).toEqual(['hello', 'world', 'goodbye'])
  })
})

describe('charCount, aligned with Rust chars().count()', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charCount('ab')).toBe(2)
    expect('🙂'.length).toBe(2)
    expect(charCount('🙂')).toBe(1)
  })
})
