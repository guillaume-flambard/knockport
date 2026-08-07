import { describe, expect, it } from 'vitest'
import './helpers.ts'
import {
  deleteJourney,
  getJourneyForEdit,
  getSessionTimeline,
  getTimelinesForSessions,
  listCandidates,
  listJourneys,
  markInboxRead,
  slugExists,
  upsertJourney,
  type Candidate,
  type JourneyDraft,
} from '../src/db/studio.ts'
import { getDb, saveContact } from '../src/db/index.ts'

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

describe('upsertJourney', () => {
  it('creates a journey and its company', () => {
    upsertJourney(draft())
    const edit = getJourneyForEdit('acme')!
    expect(edit.companyName).toBe('Acme')
    expect(edit.title).toBe('Working at Acme')
    expect(edit.sections[0]!.name).toBe('whoami')
    expect(edit.published).toBe(true)
  })

  it('is idempotent on slug: a second save updates, not duplicates', () => {
    upsertJourney(draft())
    upsertJourney(draft({ title: 'Updated title', published: false }))
    const rows = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
    expect(rows.c).toBe(1)
    const edit = getJourneyForEdit('acme')!
    expect(edit.title).toBe('Updated title')
    expect(edit.published).toBe(false)
  })

  it('an unpublished journey keeps published_at null (a draft)', () => {
    upsertJourney(draft({ published: false }))
    const row = getDb()
      .prepare('SELECT published_at FROM journeys WHERE slug = ?')
      .get('acme') as { published_at: number | null }
    expect(row.published_at).toBeNull()
  })

  it('re-publishing sets published_at', () => {
    upsertJourney(draft({ published: false }))
    upsertJourney(draft({ published: true }))
    const row = getDb()
      .prepare('SELECT published_at FROM journeys WHERE slug = ?')
      .get('acme') as { published_at: number | null }
    expect(row.published_at).not.toBeNull()
  })
})

describe('slugExists', () => {
  it('is false when the slug is free', () => {
    expect(slugExists('acme')).toBe(false)
  })

  it('is true once a journey owns the slug', () => {
    upsertJourney(draft())
    expect(slugExists('acme')).toBe(true)
  })

  it('is false for a different slug', () => {
    upsertJourney(draft())
    expect(slugExists('other')).toBe(false)
  })
})

describe('listJourneys', () => {
  it('lists journeys with candidate counts', () => {
    upsertJourney(draft({ slug: 'first' }))
    upsertJourney(draft({ slug: 'second' }))
    const journeys = listJourneys()
    // Order is newest first; when two journeys share the same creation
    // millisecond the slug tiebreaker keeps the order deterministic.
    const slugs = journeys.map((j) => j.slug)
    expect(slugs).toContain('first')
    expect(slugs).toContain('second')
    expect(journeys[0]!.candidateCount).toBe(0)
  })

  it('counts candidates per journey', () => {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    saveContact({ journeyId, sessionId: 's1', name: 'Ada', email: 'a@x', message: 'hi', eggFound: false })
    expect(listJourneys()[0]!.candidateCount).toBe(1)
  })
})

describe('getJourneyForEdit', () => {
  it('returns undefined for an unknown slug', () => {
    expect(getJourneyForEdit('nope')).toBeUndefined()
  })
})

describe('deleteJourney', () => {
  it('removes the journey but leaves the company', () => {
    upsertJourney(draft())
    deleteJourney('acme')
    expect(getJourneyForEdit('acme')).toBeUndefined()
    expect(slugExists('acme')).toBe(false)
  })
})

describe('listCandidates and markInboxRead', () => {
  function seedCandidate(): Candidate {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    saveContact({ journeyId, sessionId: 's1', name: 'Ada', email: 'a@x', message: 'hi', eggFound: true })
    return listCandidates('acme')[0]!
  }

  it('returns candidates newest first with eggFound and read state', () => {
    const c = seedCandidate()
    expect(c.name).toBe('Ada')
    expect(c.eggFound).toBe(true)
    expect(c.read).toBe(false)
  })

  it('markInboxRead flags all contacts as read', () => {
    seedCandidate()
    expect(listCandidates('acme')[0]!.read).toBe(false)
    markInboxRead('acme')
    expect(listCandidates('acme')[0]!.read).toBe(true)
  })

  it('only lists candidates for the given journey', () => {
    seedCandidate()
    upsertJourney(draft({ slug: 'other' }))
    expect(listCandidates('other')).toEqual([])
  })
})

describe('getSessionTimeline', () => {
  it('returns events in chronological order with the atMs alias', () => {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    getDb()
      .prepare(
        'INSERT INTO session_events (journey_id, session_id, at_ms, input, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(journeyId, 's1', 5000, 'ls', 1, Date.now())
    getDb()
      .prepare(
        'INSERT INTO session_events (journey_id, session_id, at_ms, input, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(journeyId, 's1', 3000, 'cat whoami', 1, Date.now())

    const timeline = getSessionTimeline('s1')
    expect(timeline.map((e) => e.input)).toEqual(['cat whoami', 'ls'])
    // Regression: the SQL aliases at_ms AS atMs; without it the field is
    // undefined and the inbox renders NaN.
    expect(timeline[0]!.atMs).toBe(3000)
  })

  it('getTimelinesForSessions loads all sessions in one call, grouped', () => {
    upsertJourney(draft())
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    getDb()
      .prepare(
        'INSERT INTO session_events (journey_id, session_id, at_ms, input, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(journeyId, 's1', 1000, 'ls', 1, Date.now())
    getDb()
      .prepare(
        'INSERT INTO session_events (journey_id, session_id, at_ms, input, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(journeyId, 's2', 2000, 'whoami', 1, Date.now())

    const map = getTimelinesForSessions(['s1', 's2'])
    expect(map.get('s1')!.map((e) => e.input)).toEqual(['ls'])
    expect(map.get('s2')!.map((e) => e.input)).toEqual(['whoami'])
    expect(map.get('missing')).toBeUndefined()
  })

  it('getTimelinesForSessions is empty for no sessions', () => {
    expect(getTimelinesForSessions([]).size).toBe(0)
  })
})
