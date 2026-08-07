import { getDb } from './index.ts'
import { assemble } from '../journey/assemble.ts'
import type { Section } from '../journey/assemble.ts'

/** What the builder edits and saves. Kept flat, assembled on the way in. */
export type JourneyDraft = {
  slug: string
  companyName: string
  website: string | null
  title: string
  banner: string
  notice: string | null
  sections: Section[]
  /** Whether to set published_at. A draft journey keeps it null until asked. */
  published: boolean
}

export type JourneySummary = {
  slug: string
  title: string
  published: boolean
  candidateCount: number
}

export type Candidate = {
  id: string
  sessionId: string
  name: string
  email: string
  message: string
  eggFound: boolean
  createdAt: number
  read: boolean
}

export type TimelineEvent = {
  atMs: number
  input: string
  ok: boolean
}

/**
 * Saves a journey and its company. Idempotent on slug: an existing slug is
 * updated rather than duplicated, which is also how URLs stay stable when a
 * company keeps editing its offer.
 *
 * Returns the slug, ready to paste into /j/<slug>.
 */
export function upsertJourney(draft: JourneyDraft): string {
  const db = getDb()
  const now = Date.now()

  db.prepare(
    `INSERT INTO companies (id, slug, name, website, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, website = excluded.website`,
  ).run(crypto.randomUUID(), draft.slug, draft.companyName, draft.website, now)

  const companyId = (
    db.prepare('SELECT id FROM companies WHERE slug = ?').get(draft.slug) as { id: string }
  ).id

  const publishedAt = draft.published ? now : null

  const journeyId =
    (db.prepare('SELECT id FROM journeys WHERE slug = ?').get(draft.slug) as
      | { id: string }
      | undefined)?.id ?? crypto.randomUUID()

  db.prepare(
    `INSERT INTO journeys
       (id, slug, company_id, title, banner, notice, content, sections_json,
        published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       banner = excluded.banner,
       notice = excluded.notice,
       content = excluded.content,
       sections_json = excluded.sections_json,
       published_at = excluded.published_at`,
  ).run(
    journeyId,
    draft.slug,
    companyId,
    draft.title,
    draft.banner,
    draft.notice,
    JSON.stringify(assemble(draft.sections)),
    JSON.stringify(draft.sections),
    publishedAt,
    now,
  )

  return draft.slug
}

export function listJourneys(): JourneySummary[] {
  const rows = getDb()
    .prepare(
      `SELECT j.slug, j.title, j.published_at,
              (SELECT COUNT(*) FROM candidate_contacts c WHERE c.journey_id = j.id) AS count
       FROM journeys j
       ORDER BY j.created_at DESC`,
    )
    .all() as Record<string, string | number | null>[]

  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    published: r.published_at !== null,
    candidateCount: r.count as number,
  }))
}

/** Returns the flat sections for the editor, or undefined if no journey. */
export function getJourneyForEdit(slug: string): JourneyDraft | undefined {
  const row = getDb()
    .prepare(
      `SELECT j.slug, j.title, j.banner, j.notice, j.sections_json, j.published_at,
              c.name AS company_name, c.website
       FROM journeys j
       JOIN companies c ON c.id = j.company_id
       WHERE j.slug = ?`,
    )
    .get(slug) as Record<string, string | null> | undefined

  if (!row) return undefined

  return {
    slug: row.slug as string,
    companyName: row.company_name as string,
    website: row.website ?? null,
    title: row.title as string,
    banner: row.banner as string,
    notice: row.notice,
    sections: JSON.parse(row.sections_json as string) as Section[],
    published: row.published_at !== null,
  }
}

export function deleteJourney(slug: string): void {
  getDb().prepare('DELETE FROM journeys WHERE slug = ?').run(slug)
}

/** True when another journey already owns this slug. The guard matters in
 *  create mode: upsertJourney is idempotent on slug, so a collision would
 *  silently overwrite someone's existing journey. */
export function slugExists(slug: string): boolean {
  return (
    (getDb().prepare('SELECT 1 FROM journeys WHERE slug = ?').get(slug) as { 1: number } | undefined) !==
    undefined
  )
}

export function listCandidates(journeySlug: string): Candidate[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.session_id, c.name, c.email, c.message, c.egg_found, c.created_at,
              c.read_at IS NOT NULL AS is_read
       FROM candidate_contacts c
       JOIN journeys j ON j.id = c.journey_id
       WHERE j.slug = ?
       ORDER BY c.created_at DESC`,
    )
    .all(journeySlug) as Record<string, string | number>[]

  return rows.map((r) => ({
    id: r.id as string,
    sessionId: r.session_id as string,
    name: r.name as string,
    email: r.email as string,
    message: r.message as string,
    eggFound: r.egg_found === 1,
    createdAt: r.created_at as number,
    read: r.is_read === 1,
  }))
}

/** Opening the inbox marks every application as seen. Read state is about the
 *  recruiter's attention, not the candidate's worth, and it is never shown as
 *  a ranking: it only separates "new" from "looked at". */
export function markInboxRead(journeySlug: string): void {
  getDb()
    .prepare(
      `UPDATE candidate_contacts SET read_at = ?
       WHERE journey_id = (SELECT id FROM journeys WHERE slug = ?) AND read_at IS NULL`,
    )
    .run(Date.now(), journeySlug)
}

/**
 * The raw evidence for one session: what was typed, in what order, how long
 * into the session. Read only, chronological, never ranked.
 */
export function getSessionTimeline(sessionId: string): TimelineEvent[] {
  return getDb()
    .prepare(
      `SELECT at_ms AS atMs, input, ok
       FROM session_events
       WHERE session_id = ?
       ORDER BY at_ms ASC`,
    )
    .all(sessionId) as TimelineEvent[]
}