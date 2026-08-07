import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Content } from '@knockport/core'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * On Fly.io, KNOCKPORT_DB points to the mounted volume.
 *
 * Locally the default cannot depend on the current working directory: root
 * scripts run from the repo root, and Next runs from apps/web. We were
 * getting two different database files, and a journey unreachable on the
 * server even though the seed had just succeeded. The root package.json
 * scripts export KNOCKPORT_DB explicitly.
 */
const DB_PATH = process.env.KNOCKPORT_DB ?? join(process.cwd(), 'data', 'knockport.db')

/**
 * Retention of session events: 90 days. These are commands and timestamps,
 * never personal data, but keeping them indefinitely would have no
 * justification.
 */
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export type Journey = {
  id: string
  slug: string
  companyId: string
  companyName: string
  companySlug: string
  title: string
  banner: string
  notice: string | null
  content: Content
  cvUrl: string | null
  bookUrl: string | null
}

export type SessionEvent = {
  atMs: number
  input: string
  ok: boolean
}

let db: DatabaseSync | undefined

export function getDb(): DatabaseSync {
  if (db) return db

  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'))
  purgeExpiredEvents(db)
  return db
}

/** Applies retention. Called on open, which is sufficient for this volume. */
function purgeExpiredEvents(handle: DatabaseSync): void {
  handle
    .prepare('DELETE FROM session_events WHERE created_at < ?')
    .run(Date.now() - EVENT_RETENTION_MS)
}

export function findJourneyBySlug(slug: string): Journey | undefined {
  const row = getDb()
    .prepare(
      `SELECT j.id, j.slug, j.company_id, j.title, j.banner, j.notice, j.content,
              j.cv_url, j.book_url, c.name AS company_name, c.slug AS company_slug
       FROM journeys j
       JOIN companies c ON c.id = j.company_id
       WHERE j.slug = ? AND j.published_at IS NOT NULL`,
    )
    .get(slug) as Record<string, string | null> | undefined

  if (!row) return undefined

  return {
    id: row.id as string,
    slug: row.slug as string,
    companyId: row.company_id as string,
    companyName: row.company_name as string,
    companySlug: row.company_slug as string,
    title: row.title as string,
    banner: row.banner as string,
    notice: row.notice ?? null,
    content: JSON.parse(row.content as string) as Content,
    // noUncheckedIndexedAccess raises undefined on key access. The columns
    // exist but are nullable in the database.
    cvUrl: row.cv_url ?? null,
    bookUrl: row.book_url ?? null,
  }
}

/**
 * Writes a session journal in one transaction, on disconnect.
 * Writing event by event would cost one disk write per keystroke.
 */
export function saveSessionEvents(
  journeyId: string,
  sessionId: string,
  events: readonly SessionEvent[],
): void {
  if (events.length === 0) return

  const handle = getDb()
  const insert = handle.prepare(
    `INSERT INTO session_events (journey_id, session_id, at_ms, input, ok, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const now = Date.now()

  handle.exec('BEGIN')
  try {
    for (const e of events) insert.run(journeyId, sessionId, e.atMs, e.input, e.ok ? 1 : 0, now)
    handle.exec('COMMIT')
  } catch (error) {
    handle.exec('ROLLBACK')
    throw error
  }
}

export function saveContact(input: {
  journeyId: string
  sessionId: string
  name: string
  email: string
  message: string
  eggFound: boolean
}): void {
  getDb()
    .prepare(
      `INSERT INTO candidate_contacts
         (id, journey_id, session_id, name, email, message, egg_found, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.journeyId,
      input.sessionId,
      input.name,
      input.email,
      input.message,
      input.eggFound ? 1 : 0,
      Date.now(),
    )
}
