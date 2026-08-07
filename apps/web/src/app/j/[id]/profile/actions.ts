'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { validEmail, validMessage } from '@knockport/core'
import { findJourneyBySlug, saveContact } from '../../../../db/index.ts'
import { isRateLimited } from '../../../../session/rate-limit.ts'

/**
 * The contact flow for visitors without JavaScript.
 *
 * The interactive flow lives entirely inside the WebSocket session, so
 * without this a visitor on the plain page could read the whole journey and
 * have no way to answer it. Being able to read but not reply is exactly the
 * exclusion the plain page exists to prevent.
 *
 * A server action rather than a route handler: the form posts and the page
 * re-renders with no client JavaScript involved, which is the entire point.
 * The same validators as the terminal, so the two paths cannot drift.
 */
export async function submitContact(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const journey = findJourneyBySlug(slug)
  if (!journey) redirect('/')

  // Honeypot. Hidden from sight and from assistive technology, so a person
  // never meets it and a bot filling every field in the form does.
  if (String(formData.get('website') ?? '') !== '') redirect(`/j/${slug}/profile?sent=1`)

  // The honeypot catches naive bots, not scripts that skip it. A modest cap
  // per client keeps the database from filling with fabricated applications.
  const jar = await headers()
  const ip = String(jar.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? 'unknown'
  const key = createHash('sha256').update(`knockport-contact:${ip}`).digest('hex')
  if (await isRateLimited(key, 20)) redirect(`/j/${slug}/profile?error=ratelimit#contact`)

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()

  if (name === '' || name.length > 200) redirect(`/j/${slug}/profile?error=name#contact`)
  if (!validEmail(email)) redirect(`/j/${slug}/profile?error=email#contact`)
  if (!validMessage(message)) redirect(`/j/${slug}/profile?error=message#contact`)

  saveContact({
    journeyId: journey.id,
    // No terminal session exists on this path, so this identifier links
    // nothing. That absence is the signal: a contact with no matching
    // session came through the plain page.
    sessionId: crypto.randomUUID(),
    name,
    email,
    message,
    eggFound: false,
  })

  redirect(`/j/${slug}/profile?sent=1#contact`)
}
