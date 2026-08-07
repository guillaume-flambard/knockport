import { describe, expect, it } from 'vitest'
import './helpers.ts'
import { demoTemplate, seedDemo, seedIfEmpty } from '../src/journey/seed-demo.ts'
import { getDb } from '../src/db/index.ts'

describe('demoTemplate', () => {
  it('returns the Memo Labs journey as a starter', () => {
    const t = demoTemplate()
    expect(t.companyName).toBe('Memo Labs')
    expect(t.sections.some((s) => s.name === 'whoami')).toBe(true)
    expect(t.sections.some((s) => s.hidden)).toBe(true)
  })
})

describe('seedDemo', () => {
  it('creates the demo journey and returns its slug', () => {
    const slug = seedDemo()
    expect(slug).toBe('memo-labs')
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('is idempotent: re-seeding updates, never duplicates', () => {
    seedDemo()
    seedDemo()
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
    expect(count.c).toBe(1)
  })
})

describe('seedIfEmpty', () => {
  it('seeds an empty database', () => {
    seedIfEmpty()
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('does nothing when journeys already exist', () => {
    seedIfEmpty()
    seedIfEmpty()
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
    expect(count.c).toBe(1)
  })
})
