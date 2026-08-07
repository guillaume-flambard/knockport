import type { Section } from './assemble.ts'
import type { JourneyDraft } from '../db/studio.ts'

/**
 * Validates a journey submitted by the builder. Lives outside the server
 * action file so it can be unit tested: a module marked 'use server' requires
 * every export to be an async server action, which a validator is not.
 */

/** Slugs appear in /j/<slug> and /ws/<slug>; keep them conservative. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function validDraft(input: FormData): JourneyDraft | string {
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
