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
}

export type SessionEvent = {
  atMs: number
  input: string
  ok: boolean
}

let db: DatabaseSync | undefined

export function getDb(): DatabaseSync {
  if (db) return db

  // `:memory:` is how tests isolate: one throwaway database per test file,
  // no file on disk. Its directory does not exist, so skip mkdirSync for it.
  if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'))
  migrate(db)
  purgeExpiredEvents(db)
  return db
}

/**
 * Additive migrations for databases created before a column existed. CREATE
 * TABLE IF NOT EXISTS never adds a column, so an old volume that already has
 * the table silently misses it and the builder then crashes on insert.
 * Pragmatic: check the columns, add the missing one. This is not a versioned
 * migration framework, and it should not grow into one without reason.
 *
 * Exported for tests: migrations run on an existing database, so the test
 * constructs one shaped like the old schema and proves the rename happens.
 */
export function migrate(handle: DatabaseSync): void {
  const columns = handle
    .prepare(`SELECT name FROM pragma_table_info('journeys')`)
    .all() as { name: string }[]

  if (!columns.some((c) => c.name === 'sections_json')) {
    handle.exec(`ALTER TABLE journeys ADD COLUMN sections_json TEXT NOT NULL DEFAULT '[]'`)
  }

  // A company always has a website; it may not have a GitHub. The old column
  // was named for a habit that most small companies do not share.
  const companyColumns = handle
    .prepare(`SELECT name FROM pragma_table_info('companies')`)
    .all() as { name: string }[]
  if (companyColumns.some((c) => c.name === 'github_org')) {
    handle.exec(`ALTER TABLE companies RENAME COLUMN github_org TO website`)
  }

  const contactColumns = handle
    .prepare(`SELECT name FROM pragma_table_info('candidate_contacts')`)
    .all() as { name: string }[]
  if (!contactColumns.some((c) => c.name === 'read_at')) {
    handle.exec(`ALTER TABLE candidate_contacts ADD COLUMN read_at INTEGER`)
  }
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
    notice: row.notice ?? null,
    content: JSON.parse(row.content as string) as Content,
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
