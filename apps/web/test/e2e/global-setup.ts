import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Seeds the e2e database with the journeys the tests depend on. Runs once
 * before the suite, against the same KNOCKPORT_DB file the dev server uses.
 *
 * The demo journey here is a real-feeling company so the product demo reads
 * like a business, not a developer exercise. The shape is the point: the
 * company could be anything.
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

  for (const slug of ['harbor']) {
    const companyId = `company-${slug}`
    insertCompany.run(companyId, slug, 'Harbor', 'https://harbor.dev', now)

    const sections = [
      {
        name: 'whoami',
        title: 'who we are',
        order: 1,
        hidden: false,
        body: `Harbor is a small product company building the operations layer for
warehouses: the software that decides where a pallet goes and how a truck
gets loaded. Seven people, one product, real customers who depend on it
every hour.

We are not a big company trying to look small. We are small on purpose:
fewer hands means every decision is made by the people who will feel it.`,
      },
      {
        name: 'stack',
        title: 'what we build with',
        order: 2,
        hidden: false,
        body: `TypeScript everywhere. React and Next.js on the front, Node on the
backend, PostgreSQL for the data that has to be right, and a handful of
workers that keep the live floor moving.

We keep the stack boring on purpose. The interesting problems here are the
business ones: where trucks go, when they arrive, and what happens when
they do not.`,
      },
      {
        name: 'role',
        title: 'the role',
        order: 3,
        hidden: false,
        body: `We are hiring a full stack engineer to own features from the database to
the screen. You would work across the stack every week: schema changes in
Postgres, API endpoints in Node, and the React screens that warehouse
staff look at all day.

A good week looks like: fix a data model, ship a dashboard, talk to a
customer about why a load was late. You would touch real production code
from your first week, with a small team and no red tape.

What we are looking for is less about years and more about care: you read
before you assume, you leave code better than you found it, and you can
explain a decision to someone who was not in the room.`,
      },
      {
        name: 'team',
        title: 'the team',
        order: 4,
        hidden: false,
        body: `Seven people, spread across four time zones. Two engineers, one designer,
one founder who still writes code, and three people who live next to the
warehouses we serve.

We ship small and often, we review each other without ceremony, and we
turn down work that would make the product worse. The team is the reason
people stay.`,
      },
      {
        name: 'note',
        title: 'a note for you',
        order: 99,
        hidden: true,
        body: `You typed ls -a. Most people never do.
That is not a trick and it is not a test of cleverness. It is the habit we
look for in a full stack engineer: reading before assuming. Mention this
note when you apply.`,
      },
    ]

    const content = {
      root: {
        name: '',
        dirs: [],
        files: sections.map((s) => ({
          name: s.name,
          title: s.title,
          order: s.order,
          hidden: s.hidden,
          body: s.body,
        })),
      },
    }

    insertJourney.run(
      `journey-${slug}`,
      slug,
      companyId,
      'Working at Harbor',
      'Welcome to Harbor.\nWe build the software that keeps warehouses moving.',
      'a live example. your company would carry your name.',
      JSON.stringify(content),
      JSON.stringify(sections),
      now,
      now,
    )
  }
  db.close()
}
