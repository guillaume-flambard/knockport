'use server'

import { redirect } from 'next/navigation'
import { validEmail, validMessage } from '@knockport/core'
import { findJourneyBySlug, saveContact } from '../../../../db/index.ts'

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
