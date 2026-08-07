'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { deleteJourney, getJourneyForEdit, slugExists, upsertJourney, type JourneyDraft } from '../../db/studio.ts'
import { clearAuth, isAuthed, setAuth } from './auth.ts'
import { validDraft, SLUG_RE } from '../../journey/validate.ts'
import { isRateLimited } from '../../session/rate-limit.ts'

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

/**
 * A rate-limit key derived from the client address. The IP is hashed with a
 * static pepper, so it is never stored or logged in the clear: the key exists
 * only to separate one visitor from another.
 */
async function clientKey(): Promise<string> {
  const jar = await headers()
  const ip = String(jar.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? 'unknown'
  return createHash('sha256').update(`knockport-rl:${ip}`).digest('hex')
}

/** Brute force on the studio passphrase is cheap to script; five tries per
 *  window per client is already generous for a one-person tool. Tests may
 *  raise it via KNOCKPORT_LOGIN_MAX_ATTEMPTS so a browser suite full of
 *  logins does not starve itself. */
const LOGIN_MAX_ATTEMPTS = Number(process.env.KNOCKPORT_LOGIN_MAX_ATTEMPTS ?? 5)

export async function login(input: FormData): Promise<void> {
  const pass = String(input.get('pass') ?? '')
  const expected = process.env.KNOCKPORT_STUDIO_PASS ?? ''
  if (await isRateLimited(await clientKey(), LOGIN_MAX_ATTEMPTS)) {
    redirect('/studio/login?error=1')
  }
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
