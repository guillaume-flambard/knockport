import { describe, expect, it } from 'vitest'
import {
  contactStep, startContact, validEmail, validMessage,
} from '../src/commands/contact.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('validEmail', () => {
  it('accepts an ordinary address', () => {
    expect(validEmail('a@b.co')).toBe(true)
    expect(validEmail('guillaume.flambard+jobs@example.com')).toBe(true)
  })

  it('rejects obvious cases', () => {
    expect(validEmail('nope')).toBe(false)
    expect(validEmail('a@b')).toBe(false)
    expect(validEmail('a b@c.co')).toBe(false)
    expect(validEmail('')).toBe(false)
    expect(validEmail(`${'x'.repeat(300)}@example.com`)).toBe(false)
    expect(validEmail('a@.b.co')).toBe(false)
    expect(validEmail('a@b.co.')).toBe(false)
    expect(validEmail('a@b@c.co')).toBe(false)
    expect(validEmail('a@b.co@')).toBe(false)
  })
})

describe('validMessage', () => {
  it('enforces both bounds', () => {
    expect(validMessage('too short')).toBe(false)
    expect(validMessage('this one is long enough to say something')).toBe(true)
    expect(validMessage('x'.repeat(4001))).toBe(false)
  })

  it('counts code points, not UTF-16 units', () => {
    // 6 emoji: 6 code points in Rust, 12 UTF-16 units in JS.
    expect(validMessage('🙂'.repeat(6))).toBe(false)
  })
})

describe('state machine', () => {
  it('start enters contact mode at the name step', () => {
    const s = newSession()
    startContact(s)
    expect(s.mode).toEqual({ kind: 'contact', step: 'name', draft: { name: '', email: '' } })
  })

  it('a complete journey emits the payload and returns to normal mode', () => {
    const s = newSession()
    s.eggFound = true
    s.journal.push({ atMs: 5, input: 'ls', ok: true })

    startContact(s)
    contactStep(s, 'Seema')
    contactStep(s, 'seema@example.com')
    const out = contactStep(s, 'we have a role that fits, are you free thursday')

    expect(out.effect?.kind).toBe('submitContact')
    if (out.effect?.kind !== 'submitContact') throw new Error('payload expected')
    expect(out.effect.payload.name).toBe('Seema')
    expect(out.effect.payload.email).toBe('seema@example.com')
    expect(out.effect.payload.eggFound).toBe(true)
    expect(out.effect.payload.journal).toHaveLength(1)
    expect(s.mode.kind).toBe('normal')
  })

  it('invalid email re-prompts without advancing', () => {
    const s = newSession()
    startContact(s)
    contactStep(s, 'Seema')
    const out = contactStep(s, 'nope')
    expect(flatten(out)).toContain('does not look like an email')
    expect(s.mode).toMatchObject({ kind: 'contact', step: 'email' })
  })

  it('empty name re-prompts', () => {
    const s = newSession()
    startContact(s)
    const out = contactStep(s, '   ')
    expect(flatten(out)).toContain('A name')
    expect(s.mode).toMatchObject({ kind: 'contact', step: 'name' })
  })

  it('cancel exits contact mode without sending', () => {
    const s = newSession()
    startContact(s)
    const out = contactStep(s, 'cancel')
    expect(out.effect).toBeUndefined()
    expect(s.mode.kind).toBe('normal')
  })

  it('cancel is case-insensitive', () => {
    const s = newSession()
    startContact(s)
    contactStep(s, 'CANCEL')
    expect(s.mode.kind).toBe('normal')
  })
})
