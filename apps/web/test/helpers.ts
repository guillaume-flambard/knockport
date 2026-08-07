import { beforeAll, beforeEach } from 'vitest'
import { getDb } from '../src/db/index.ts'

/**
 * A fresh in-memory database per test. The db module caches its handle on
 * first getDb(); because KNOCKPORT_DB is ':memory:', we cannot just re-open a
 * path. Instead each test drops the tables and re-runs the schema, which is
 * the same isolation with less module juggling.
 */
beforeAll(() => {
  getDb()
})

beforeEach(() => {
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec(`
    DELETE FROM session_events;
    DELETE FROM candidate_contacts;
    DELETE FROM journeys;
    DELETE FROM companies;
  `)
  db.exec('PRAGMA foreign_keys = ON')
})
