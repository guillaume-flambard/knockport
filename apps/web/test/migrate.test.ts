import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from '../src/db/index.ts'

/**
 * A database shaped like the pre-migration schema, with the columns that
 * migrate() is responsible for adding or renaming. The current schema.sql is
 * not applied here on purpose: we want to prove migrate() repairs an old
 * volume, not that the current schema is self-consistent.
 */
function legacyDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      github_org TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE journeys (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, company_id TEXT NOT NULL,
      title TEXT NOT NULL, banner TEXT NOT NULL, notice TEXT, content TEXT NOT NULL,
      published_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE candidate_contacts (
      id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, session_id TEXT NOT NULL,
      name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
      egg_found INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    INSERT INTO companies (id, slug, name, github_org, created_at)
      VALUES ('c1', 'acme', 'Acme', 'acme-org', 1);
  `)
  return db
}

describe('migrate', () => {
  it('renames companies.github_org to website, keeping the value', () => {
    const db = legacyDb()
    migrate(db)
    const cols = db.prepare(`PRAGMA table_info('companies')`).all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain('website')
    expect(cols.map((c) => c.name)).not.toContain('github_org')
    const row = db.prepare('SELECT website FROM companies WHERE slug = ?').get('acme') as {
      website: string
    }
    expect(row.website).toBe('acme-org')
  })

  it('adds sections_json to journeys', () => {
    const db = legacyDb()
    migrate(db)
    const cols = db.prepare(`PRAGMA table_info('journeys')`).all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain('sections_json')
  })

  it('adds read_at to candidate_contacts', () => {
    const db = legacyDb()
    migrate(db)
    const cols = db.prepare(`PRAGMA table_info('candidate_contacts')`).all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain('read_at')
  })

  it('is safe to run on a schema that is already current', () => {
    const db = legacyDb()
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
  })
})
