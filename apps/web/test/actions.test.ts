import { beforeEach, describe, expect, it, vi } from 'vitest'
import './helpers.ts'

// `next/navigation` lives in apps/web/node_modules, not the root, and the
// actions file also imports ./auth.ts (Next cookies). Neither runs under
// vitest, so mock the redirect side and auth entirely.
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('../src/app/studio/auth.ts', () => ({
  isAuthed: vi.fn(async () => true),
  clearAuth: vi.fn(),
  setAuth: vi.fn(),
}))

import { redirect } from 'next/navigation'
import { duplicateJourney, saveJourney } from '../src/app/studio/actions.ts'
import { validDraft } from '../src/journey/validate.ts'
import { isAuthed } from '../src/app/studio/auth.ts'
import { getJourneyForEdit, slugExists, upsertJourney, type JourneyDraft } from '../src/db/studio.ts'

const redirectMock = vi.mocked(redirect)

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const valid = {
  slug: 'acme',
  companyName: 'Acme',
  title: 'Working at Acme',
  banner: 'Welcome.',
  'sections[0][name]': 'whoami',
  'sections[0][title]': 'who we are',
  'sections[0][body]': 'We are Acme.',
}

describe('validDraft', () => {
  it('accepts a valid journey', () => {
    const draft = validDraft(form(valid))
    expect(typeof draft).not.toBe('string')
    expect((draft as JourneyDraft).slug).toBe('acme')
    expect((draft as JourneyDraft).published).toBe(false)
  })

  it('publishes when the checkbox is on', () => {
    const draft = validDraft(form({ ...valid, published: 'on' }))
    expect((draft as JourneyDraft).published).toBe(true)
  })

  it('rejects an invalid slug', () => {
    expect(validDraft(form({ ...valid, slug: 'BAD SLUG' }))).toBe('slug')
    expect(validDraft(form({ ...valid, slug: '-acme' }))).toBe('slug')
  })

  it('rejects an empty company name', () => {
    expect(validDraft(form({ ...valid, companyName: '  ' }))).toBe('companyName')
  })

  it('rejects a missing banner', () => {
    expect(validDraft(form({ ...valid, banner: '' }))).toBe('banner')
  })

  it('rejects an empty title', () => {
    expect(validDraft(form({ ...valid, title: '' }))).toBe('title')
  })

  it('rejects a section with an unsafe name', () => {
    expect(validDraft(form({ ...valid, 'sections[0][name]': 'Bad Name' }))).toBe('section-name')
  })

  it('rejects a section with an empty title', () => {
    expect(validDraft(form({ ...valid, 'sections[0][title]': '' }))).toBe('section-title')
  })

  it('rejects a section with an empty body', () => {
    expect(validDraft(form({ ...valid, 'sections[0][body]': '' }))).toBe('section-body')
  })

  it('rejects a bad directory name', () => {
    expect(validDraft(form({ ...valid, 'sections[0][dir]': 'BAD DIR' }))).toBe('section-dir')
  })

  it('rejects a journey with no sections', () => {
    expect(validDraft(form({ slug: 'acme', companyName: 'Acme', title: 't', banner: 'b' })))
      .toBe('sections')
  })

  it('collects multiple sections with ascending order', () => {
    const draft = validDraft(form({
      ...valid,
      'sections[1][name]': 'role',
      'sections[1][title]': 'the role',
      'sections[1][body]': 'A role.',
    })) as JourneyDraft
    expect(draft.sections.map((s) => s.order)).toEqual([1, 2])
    expect(draft.sections[0]!.hidden).toBe(false)
  })
})

describe('saveJourney', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('saves a valid journey and redirects with ?saved=1', async () => {
    const input = form({ ...valid, editSlug: '', published: 'on' })
    await saveJourney(input)
    expect(getJourneyForEdit('acme')).toBeDefined()
    expect(redirectMock).toHaveBeenCalledWith('/studio/j/acme?saved=1')
  })

  it('rejects a slug that is already taken when creating', async () => {
    upsertJourney({
      slug: 'acme', companyName: 'X', website: null, title: 'X', banner: 'X',
      notice: null, sections: [{ name: 'a', title: 'A', body: 'B', order: 1, hidden: false }],
      published: true,
    })
    await saveJourney(form({ ...valid, editSlug: '' }))
    expect(redirectMock).toHaveBeenCalledWith('/studio/new?error=slug-taken')
  })

  it('allows editing an existing journey with the same slug', async () => {
    upsertJourney({
      slug: 'acme', companyName: 'X', website: null, title: 'X', banner: 'X',
      notice: null, sections: [{ name: 'a', title: 'A', body: 'B', order: 1, hidden: false }],
      published: true,
    })
    await saveJourney(form({ ...valid, editSlug: 'acme' }))
    expect(redirectMock).toHaveBeenCalledWith('/studio/j/acme?saved=1')
  })
})

describe('duplicateJourney', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('copies a journey under a fresh slug as a draft', async () => {
    upsertJourney({
      slug: 'acme', companyName: 'Acme', website: null, title: 'Working at Acme',
      banner: 'Welcome.', notice: null,
      sections: [{ name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false }],
      published: true,
    })
    await duplicateJourney('acme')
    expect(getJourneyForEdit('acme-copy')).toBeDefined()
    expect(getJourneyForEdit('acme-copy')!.title).toBe('Working at Acme (copy)')
    expect(getJourneyForEdit('acme-copy')!.published).toBe(false)
    expect(redirectMock).toHaveBeenCalledWith('/studio/j/acme-copy')
  })

  it('finds a free slug when the copy name is taken', async () => {
    upsertJourney({
      slug: 'acme', companyName: 'Acme', website: null, title: 'Working at Acme',
      banner: 'Welcome.', notice: null,
      sections: [{ name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false }],
      published: true,
    })
    upsertJourney({
      slug: 'acme-copy', companyName: 'Acme', website: null, title: 'Existing copy',
      banner: 'Welcome.', notice: null,
      sections: [{ name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false }],
      published: false,
    })
    await duplicateJourney('acme')
    expect(slugExists('acme-copy-copy')).toBe(true)
    expect(redirectMock).toHaveBeenCalledWith('/studio/j/acme-copy-copy')
  })
})
