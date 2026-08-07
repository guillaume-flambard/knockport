import { beforeEach, describe, expect, it, vi } from 'vitest'
import './helpers.ts'

vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }) }))

// The profile action reads next/headers for the client address; mocked out
// because it only feeds the rate-limit key.
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => '203.0.113.1' })),
}))

import { redirect } from 'next/navigation'
import { submitContact } from '../src/app/j/[id]/profile/actions.ts'
import { upsertJourney, type JourneyDraft } from '../src/db/studio.ts'
import { getDb } from '../src/db/index.ts'

const redirectMock = vi.mocked(redirect)

function draft(overrides: Partial<JourneyDraft> = {}): JourneyDraft {
  return {
    slug: 'acme',
    companyName: 'Acme',
    website: null,
    title: 'Working at Acme',
    banner: 'Welcome.',
    notice: null,
    sections: [{ name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false }],
    published: true,
    ...overrides,
  }
}

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  const base = { slug: 'acme', name: 'Ada', email: 'ada@example.com', message: 'Interested.', website: '' }
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v)
  return fd
}

async function expectRedirectTo(urlPart: string, fn: () => Promise<void>): Promise<void> {
  redirectMock.mockClear()
  try {
    await fn()
  } catch (e) {
    expect(String(e)).toContain(`REDIRECT:${urlPart}`)
    return
  }
  throw new Error(`expected redirect to ${urlPart}`)
}

async function expectError(errorParam: string, fn: () => Promise<void>): Promise<void> {
  await expectRedirectTo(`/j/acme/profile?error=${errorParam}`, fn)
}

describe('submitContact', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('saves a valid contact and redirects to sent', async () => {
    upsertJourney(draft())
    await expectRedirectTo('/j/acme/profile?sent=1', () => submitContact(form()))
    const row = getDb().prepare('SELECT name, email FROM candidate_contacts').get() as
      | { name: string; email: string }
      | undefined
    expect(row?.name).toBe('Ada')
  })

  it('rejects an invalid email', async () => {
    upsertJourney(draft())
    await expectError('email', () => submitContact(form({ email: 'not-an-email' })))
  })

  it('rejects an empty name', async () => {
    upsertJourney(draft())
    await expectError('name', () => submitContact(form({ name: '  ' })))
  })

  it('rejects an empty message', async () => {
    upsertJourney(draft())
    await expectError('message', () => submitContact(form({ message: 'short' })))
  })

  it('short-circuits when the honeypot is filled', async () => {
    upsertJourney(draft())
    await expectRedirectTo('/j/acme/profile?sent=1', () =>
      submitContact(form({ website: 'https://bot.example' })),
    )
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM candidate_contacts').get() as {
      c: number
    }
    expect(count.c).toBe(0)
  })

  it('redirects to the home page for an unknown journey', async () => {
    await expectRedirectTo('/', () => submitContact(form()))
  })
})
