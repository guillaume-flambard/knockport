import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Seeds the e2e database with the journeys the tests depend on. Runs once
 * before the suite, against the same KNOCKPORT_DB file the dev server uses.
 */
export default function globalSetup(): void {
  const dbPath = process.env.E2E_DB ?? '/tmp/knockport-e2e.db'
  const schema = readFileSync(join(process.cwd(), 'apps', 'web', 'src', 'db', 'schema.sql'), 'utf8')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec(`
    DROP TABLE IF EXISTS session_events;
    DROP TABLE IF EXISTS candidate_contacts;
    DROP TABLE IF EXISTS journeys;
    DROP TABLE IF EXISTS companies;
  `)
  db.exec(schema)
  db.exec('PRAGMA foreign_keys = ON')

  const now = Date.now()
  const insertCompany = db.prepare(
    `INSERT INTO companies (id, slug, name, website, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
  const insertJourney = db.prepare(
    `INSERT INTO journeys (id, slug, company_id, title, banner, notice, content, sections_json, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const slug of ['e2e-main']) {
    const companyId = `company-${slug}`
    insertCompany.run(companyId, slug, 'E2E Co', 'https://e2e.example', now)
    insertJourney.run(
      `journey-${slug}`,
      slug,
      companyId,
      `Working at ${slug}`,
      'Welcome to E2E Co.',
      null,
      JSON.stringify({
        root: {
          name: '',
          dirs: [],
          files: [
            { name: 'whoami', title: 'who we are', order: 1, hidden: false, body: 'We are E2E Co.' },
            { name: 'role', title: 'the role', order: 2, hidden: false, body: 'A role.' },
          ],
        },
      }),
      JSON.stringify([
        { name: 'whoami', title: 'who we are', body: 'We are E2E Co.', order: 1, hidden: false },
        { name: 'role', title: 'the role', body: 'A role.', order: 2, hidden: false },
      ]),
      now,
      now,
    )
  }
  db.close()
}
