import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Content } from '@knockport/core'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Sur Fly.io, KNOCKPORT_DB pointe vers le volume monte.
 *
 * En local le defaut ne peut PAS dependre du repertoire courant: les scripts
 * de la racine tournent depuis la racine, et Next tourne depuis apps/web. On
 * obtenait deux fichiers de base differents, et un parcours introuvable cote
 * serveur alors que le seed venait de reussir. Les scripts du package.json
 * racine exportent donc KNOCKPORT_DB explicitement.
 */
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
  companyName: string
  companySlug: string
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
      `SELECT j.id, j.slug, j.company_id, j.title, j.banner, j.content, j.cv_url, j.book_url,
              c.name AS company_name, c.slug AS company_slug
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
    content: JSON.parse(row.content as string) as Content,
    // `noUncheckedIndexedAccess` fait remonter un `undefined` sur l'acces par
    // cle. Les colonnes existent, mais elles sont nullables en base.
    cvUrl: row.cv_url ?? null,
    bookUrl: row.book_url ?? null,
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
