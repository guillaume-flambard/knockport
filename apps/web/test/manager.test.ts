import { describe, expect, it } from 'vitest'
import './helpers.ts'
import { TerminalSession } from '../src/session/manager.ts'
import { upsertJourney, type JourneyDraft } from '../src/db/studio.ts'
import { getDb, saveContact } from '../src/db/index.ts'

function draft(overrides: Partial<JourneyDraft> = {}): JourneyDraft {
  return {
    slug: 'acme',
    companyName: 'Acme',
    website: 'https://acme.example',
    title: 'Working at Acme',
    banner: 'Welcome to Acme.\nLine two.',
    notice: 'a live example',
    sections: [
      { name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false },
      { name: 'role', title: 'the role', body: 'A role.', order: 2, hidden: false },
    ],
    published: true,
    ...overrides,
  }
}

describe('TerminalSession', () => {
  it('opens a session for a published journey', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')
    expect(session).toBeDefined()
    expect(session!.id).toBeTruthy()
    session!.close()
  })

  it('refuses to open a session for a draft', () => {
    upsertJourney(draft({ published: false }))
    expect(TerminalSession.open('acme')).toBeUndefined()
  })

  it('refuses to open a session for an unknown slug', () => {
    expect(TerminalSession.open('nope')).toBeUndefined()
  })

  it('builds the banner with the notice and the first-run nudge', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    const banner = session.banner()
    const text = banner.map((l) => l.spans.map((s) => s.text).join('')).join('\n')
    expect(text).toContain('Welcome to Acme.')
    expect(text).toContain('Line two.')
    expect(text).toContain('a live example')
    expect(text).toContain('try `ls` to look around')
    session.close()
  })

  it('executes a command and returns the prompt', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    const result = session.exec('ls')
    const text = result.output.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')
    expect(text).toContain('whoami')
    expect(result.prompt).toContain('$')
    expect(result.done).toBe(false)
    session.close()
  })

  it('marks done on exit', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    expect(session.exec('exit').done).toBe(true)
    session.close()
  })

  it('saves the contact on submitContact and closes the session', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    session.exec('contact')
    session.exec('Ada')
    session.exec('ada@example.com')
    const result = session.exec('Interested in the role.')
    expect(result.output.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n'))
      .toContain('Sent.')
    session.close()

    const row = getDb().prepare('SELECT name, email FROM candidate_contacts').get() as
      | { name: string; email: string }
      | undefined
    expect(row?.name).toBe('Ada')
    expect(row?.email).toBe('ada@example.com')
  })

  it('journals what the visitor typed, closing writes it', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    session.exec('ls')
    session.exec('whoami')
    session.close()
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    const events = getDb()
      .prepare('SELECT input FROM session_events WHERE journey_id = ? AND session_id = ?')
      .all(journeyId, session.id) as { input: string }[]
    expect(events.map((e) => e.input)).toEqual(['ls', 'whoami'])
  })

  it('masks contact input in the journal', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    session.exec('contact')
    session.exec('Ada')
    session.exec('ada@example.com')
    session.exec('hi')
    session.close()
    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    const events = getDb()
      .prepare('SELECT input FROM session_events WHERE journey_id = ? AND session_id = ?')
      .all(journeyId, session.id) as { input: string }[]
    // The name, email and message never appear in the journal.
    expect(events.some((e) => e.input.includes('Ada'))).toBe(false)
    expect(events.filter((e) => e.input === '<contact>').length).toBeGreaterThanOrEqual(3)
  })

  it('completes commands and file names', () => {
    upsertJourney(draft())
    const session = TerminalSession.open('acme')!
    const matches = session.complete('w')
    expect(matches).toContain('whoami')
    session.close()
  })
})
