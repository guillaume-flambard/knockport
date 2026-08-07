import { describe, expect, it } from 'vitest'
import './helpers.ts'
import { findJourneyBySlug, getDb, saveContact, saveSessionEvents } from '../src/db/index.ts'
import { upsertJourney, type JourneyDraft } from '../src/db/studio.ts'

function draft(overrides: Partial<JourneyDraft> = {}): JourneyDraft {
  return {
    slug: 'acme',
    companyName: 'Acme',
    website: 'https://acme.example',
    title: 'Working at Acme',
    banner: 'Welcome to Acme.',
    notice: null,
    sections: [
      { name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false },
    ],
    published: true,
    ...overrides,
  }
}

describe('findJourneyBySlug', () => {
  it('finds a published journey with company info', () => {
    upsertJourney(draft())
    const journey = findJourneyBySlug('acme')!
    expect(journey.title).toBe('Working at Acme')
    expect(journey.companyName).toBe('Acme')
    expect(journey.companySlug).toBe('acme')
    expect(journey.content.root.files[0]!.name).toBe('whoami')
  })

  it('never serves an unpublished draft publicly', () => {
    upsertJourney(draft({ published: false }))
    expect(findJourneyBySlug('acme')).toBeUndefined()
  })

  it('serves a journey after it is published', () => {
    upsertJourney(draft({ published: false }))
    upsertJourney(draft({ published: true }))
    expect(findJourneyBySlug('acme')).toBeDefined()
  })

  it('returns undefined for an unknown slug', () => {
    expect(findJourneyBySlug('nope')).toBeUndefined()
  })
})

describe('saveSessionEvents', () => {
  it('writes events in a transaction', () => {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    saveSessionEvents(journeyId, 's1', [
      { atMs: 1000, input: 'ls', ok: true },
      { atMs: 2000, input: 'bogus', ok: false },
    ])
    const rows = getDb()
      .prepare('SELECT at_ms, input, ok FROM session_events WHERE session_id = ? ORDER BY at_ms')
      .all('s1') as { at_ms: number; input: string; ok: number }[]
    expect(rows).toEqual([
      { at_ms: 1000, input: 'ls', ok: 1 },
      { at_ms: 2000, input: 'bogus', ok: 0 },
    ])
  })

  it('is a no-op for an empty journal', () => {
    saveSessionEvents('whatever', 's1', [])
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM session_events').get() as { c: number }
    expect(count.c).toBe(0)
  })
})

describe('saveContact', () => {
  it('stores a contact with egg_found', () => {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    saveContact({ journeyId, sessionId: 's1', name: 'Ada', email: 'a@x', message: 'hi', eggFound: true })
    const row = getDb()
      .prepare('SELECT name, egg_found FROM candidate_contacts')
      .get() as { name: string; egg_found: number }
    expect(row.name).toBe('Ada')
    expect(row.egg_found).toBe(1)
  })
})
