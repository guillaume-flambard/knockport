'use server'

import { redirect } from 'next/navigation'
import { deleteJourney, getJourneyForEdit, slugExists, upsertJourney, type JourneyDraft } from '../../db/studio.ts'
import { clearAuth, isAuthed, setAuth } from './auth.ts'
import type { Section } from '../../journey/assemble.ts'

/** Slugs appear in /j/<slug> and /ws/<slug>; keep them conservative. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function validDraft(input: FormData): JourneyDraft | string {
  const slug = String(input.get('slug') ?? '').trim()
  const companyName = String(input.get('companyName') ?? '').trim()
  const title = String(input.get('title') ?? '').trim()
  const banner = String(input.get('banner') ?? '').trim()

  if (!SLUG_RE.test(slug)) return 'slug'
  if (companyName === '' || companyName.length > 200) return 'companyName'
  if (title === '' || title.length > 200) return 'title'
  if (banner === '') return 'banner'

  // Sections arrive numbered. Names must be safe for the parser, bodies and
  // titles non-empty, orders in ascending sequence.
  const sections: Section[] = []
  for (let i = 0; ; i++) {
    const name = String(input.get(`sections[${i}][name]`) ?? '').trim()
    const titleS = String(input.get(`sections[${i}][title]`) ?? '').trim()
    const body = String(input.get(`sections[${i}][body]`) ?? '').trim()
    const hidden = input.get(`sections[${i}][hidden]`) === 'on'
    const dir = String(input.get(`sections[${i}][dir]`) ?? '').trim()

    if (name === '' && titleS === '' && body === '') break
    if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(name)) return 'section-name'
    if (titleS === '') return 'section-title'
    if (body === '') return 'section-body'
    if (dir !== '' && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(dir)) return 'section-dir'

    sections.push({
      name,
      title: titleS,
      body,
      order: i + 1,
      hidden,
      dir: dir === '' ? undefined : dir,
    })
  }

  if (sections.length === 0) return 'sections'

  return {
    slug,
    companyName,
    website: String(input.get('website') ?? '').trim() || null,
    title,
    banner,
    notice: String(input.get('notice') ?? '').trim() || null,
    sections,
    published: input.get('published') === 'on',
  }
}

export async function saveJourney(input: FormData): Promise<void> {
  if (!(await isAuthed())) redirect('/studio/login')
  const draft = validDraft(input)
  if (typeof draft === 'string') {
    const edit = String(input.get('editSlug') ?? '')
    const back = SLUG_RE.test(edit) ? `/studio/j/${edit}` : '/studio/new'
    redirect(`${back}?error=${draft}`)
  }
  // Creating with a slug that already exists would silently overwrite another
  // journey (upsert is idempotent on slug). Editing one's own slug is fine:
  // the check only applies when there is no journey to edit yet.
  if (input.get('editSlug') === '' && slugExists(draft.slug)) {
    redirect(`/studio/new?error=slug-taken`)
  }
  const slug = upsertJourney(draft)
  redirect(`/studio/j/${slug}?saved=1`)
}

export async function removeJourney(slug: string): Promise<void> {
  if (!(await isAuthed())) redirect('/studio/login')
  if (SLUG_RE.test(slug)) deleteJourney(slug)
  redirect('/studio')
}

/** Copies an existing journey under a fresh slug, so a company can reuse the
 *  shape of a journey it already wrote. The copy is a draft, never published:
 *  publishing stays a conscious act. */
export async function duplicateJourney(slug: string): Promise<void> {
  if (!(await isAuthed())) redirect('/studio/login')
  const source = getJourneyForEdit(slug)
  if (!source || !SLUG_RE.test(slug)) redirect('/studio')

  let copySlug = `${slug}-copy`
  while (slugExists(copySlug)) copySlug = `${copySlug}-copy`

  upsertJourney({
    slug: copySlug,
    companyName: source.companyName,
    website: source.website,
    title: `${source.title} (copy)`,
    banner: source.banner,
    notice: source.notice,
    sections: source.sections,
    published: false,
  })
  redirect(`/studio/j/${copySlug}`)
}

export async function login(input: FormData): Promise<void> {
  const pass = String(input.get('pass') ?? '')
  const expected = process.env.KNOCKPORT_STUDIO_PASS ?? ''
  if (pass !== '' && pass === expected) {
    await setAuth()
    redirect('/studio')
  }
  redirect('/studio/login?error=1')
}

export async function logout(): Promise<void> {
  await clearAuth()
  redirect('/studio/login')
}
