import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Content } from '@knockport/core'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Sur Fly.io, pointer vers le volume monte. En local, un fichier ignore par git. */
const DB_PATH = process.env.KNOCKPORT_DB ?? join(process.cwd(), 'data', 'knockport.db')

/**
 * Retention des evenements de session: 90 jours. Ce sont des commandes et des
 * horodatages, jamais des donnees personnelles, mais les garder indefiniment
 * n'aurait aucune justification.
 */
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export type Journey = {
  id: string
  slug: string
  companyId: string
  title: string
  banner: string
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

/** Applique la retention. Appele a l'ouverture, ce qui suffit a ce volume. */
function purgeExpiredEvents(handle: DatabaseSync): void {
  handle
    .prepare('DELETE FROM session_events WHERE created_at < ?')
    .run(Date.now() - EVENT_RETENTION_MS)
}

export function findJourneyBySlug(slug: string): Journey | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, slug, company_id, title, banner, content, cv_url, book_url
       FROM journeys WHERE slug = ? AND published_at IS NOT NULL`,
    )
    .get(slug) as Record<string, string | null> | undefined

  if (!row) return undefined

  return {
    id: row.id as string,
    slug: row.slug as string,
    companyId: row.company_id as string,
    title: row.title as string,
    banner: row.banner as string,
    content: JSON.parse(row.content as string) as Content,
    cvUrl: row.cv_url,
    bookUrl: row.book_url,
  }
}

/**
 * Ecrit le journal d'une session en une transaction, a la deconnexion.
 * Ecrire evenement par evenement couterait une ecriture disque par touche.
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
