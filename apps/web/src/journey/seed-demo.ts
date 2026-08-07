import { getDb } from '../db/index.ts'
import { assemble } from './assemble.ts'
import type { Section } from './assemble.ts'

/**
 * The demo journey, which is Memo Labs, the name Guillaume Flambard's
 * engineering work goes out under.
 *
 * It used to be a real company reconstructed from its public pages. That was
 * a mistake waiting to happen: a page written in the first person plural,
 * carrying someone else's name and served on a domain they do not control,
 * reads like their own recruitment page no matter how visible the disclaimer
 * is. A demo now speaks for a business we actually own.
 *
 * It is also a real call. Memo Labs takes on contract work, and the contact
 * flow reaches a person, so nobody who types `contact` is writing into a
 * fixture.
 */

const COMPANY_SLUG = 'memo-labs'
export const JOURNEY_SLUG = 'memo-labs'

const BANNER = [
  'memo labs',
  'contract and freelance engineering, remote across europe',
  '',
  'ls    look around',
  'help  complete list',
].join('\n')

/**
 * Displayed in gray under the banner and in the footer of /profile. It tells
 * a recruiter that the shape is the point, not the company in front of them.
 */
const NOTICE = 'a live example. yours would carry your company and your role.'

const SECTIONS: Section[] = [
  {
    name: 'whoami',
    title: 'who you would work with',
    order: 1,
    body: `Memo Labs. The name my engineering work goes out under, registered in France,
one person, and that person is Guillaume Flambard.
Five years shipping products, the last three of them mostly alone, from the
database up to whatever the user actually touches.
Fully remote, across European time zones.`,
  },
  {
    name: 'stack',
    title: 'what I build with',
    order: 2,
    body: `Daily: TypeScript, React, Next.js, Laravel, PostgreSQL, Rust when it earns
its place.
AI: retrieval pipelines, agent orchestration, evaluation harnesses.
Infra: Docker, nginx, Cloudflare, and a VPS I look after myself.`,
  },
  {
    name: 'work',
    title: 'the kind of work',
    order: 3,
    body: `Contract and freelance engineering. Missions from a few weeks to a few
months, remote, anywhere within a couple of hours of CET.
What I take on: web products end to end, AI features that have to survive
contact with real users, and codebases that grew faster than their tests.
What I turn down: anything that needs me on site five days a week, and
anything where the brief is a job title rather than a problem.`,
  },
  {
    name: 'knockport',
    title: 'the thing you are typing into',
    order: 1,
    dir: 'projects',
    body: `A TypeScript core with no I/O, painted by a browser over a WebSocket and,
before long, by an SSH server.
A job posting gets around 254 applications. Every tool on the market filters
that output better. This one reduces the input.
The name is port knocking, and knocking on a door.`,
  },
  {
    name: 'knock',
    title: 'you found it',
    order: 99,
    hidden: true,
    body: `You typed ls -a. Most people never do.
That is the whole test, and it is not about cleverness. It is about looking
before assuming, which is the same habit that catches a bad query before the
customer does.
Mention this file when you write to me. It tells me more than a CV does.`,
  },
]

/** Idempotent: re-running updates instead of duplicating. */
export function seedDemo(): string {
  const db = getDb()
  const now = Date.now()

  const companyId =
    (db.prepare('SELECT id FROM companies WHERE slug = ?').get(COMPANY_SLUG) as
      | { id: string }
      | undefined)?.id ?? crypto.randomUUID()

  db.prepare(
    `INSERT INTO companies (id, slug, name, github_org, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, github_org = excluded.github_org`,
  ).run(companyId, COMPANY_SLUG, 'Memo Labs', 'guillaume-flambard', now)

  const journeyId =
    (db.prepare('SELECT id FROM journeys WHERE slug = ?').get(JOURNEY_SLUG) as
      | { id: string }
      | undefined)?.id ?? crypto.randomUUID()

  db.prepare(
    `INSERT INTO journeys
       (id, slug, company_id, title, banner, notice, content,
        cv_url, book_url, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       banner = excluded.banner,
       notice = excluded.notice,
       content = excluded.content,
       cv_url = excluded.cv_url,
       book_url = excluded.book_url,
       published_at = excluded.published_at`,
  ).run(
    journeyId,
    JOURNEY_SLUG,
    companyId,
    'Working with Memo Labs',
    BANNER,
    NOTICE,
    JSON.stringify(assemble(SECTIONS)),
    // No CV and no calendar. `contact` is the way in, which is the feature
    // this whole product exists to demonstrate.
    null,
    null,
    now,
    now,
  )

  return JOURNEY_SLUG
}

/** On startup: creates the demo journey only if the database is empty. */
export function seedIfEmpty(): void {
  const count = getDb().prepare('SELECT COUNT(*) AS c FROM journeys').get() as { c: number }
  if (count.c > 0) return
  console.log(`knockport: empty database, demo journey created at /j/${seedDemo()}`)
}
