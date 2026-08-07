import { getDb } from '../db/index.ts'
import { assemble } from './assemble.ts'
import type { Section } from './assemble.ts'

/**
 * The demo journey: Memo Labs, a small product engineering company the author
 * owns. It speaks as a company, because a journey is what a company offers a
 * candidate, not what a freelancer offers a client.
 *
 * It used to be a real company reconstructed from its public pages. That was
 * a mistake waiting to happen: a page written in the first person plural,
 * carrying someone else's name and served on a domain they do not control,
 * reads like their own recruitment page no matter how visible the disclaimer
 * is. A demo speaks for a business you own.
 *
 * The contact flow is real: Memo Labs is hiring, and a message reaches the
 * person who answers, so nobody who types `contact` is writing into a
 * fixture.
 */

const COMPANY_SLUG = 'memo-labs'
export const JOURNEY_SLUG = 'memo-labs'

const BANNER = [
  'memo labs',
  'small product engineering company, remote across europe',
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
    title: 'who we are',
    order: 1,
    body: `Memo Labs. A small product engineering company, registered in France.
We ship web products end to end and AI features that have to survive contact
with real users. Five years shipping, the last three of them as a company.
Fully remote, across European time zones.`,
  },
  {
    name: 'stack',
    title: 'what we build with',
    order: 2,
    body: `Daily: TypeScript, React, Next.js, Laravel, PostgreSQL, Rust when it earns
its place.
AI: retrieval pipelines, agent orchestration, evaluation harnesses.
Infra: Docker, nginx, Cloudflare, and a VPS we look after ourselves.`,
  },
  {
    name: 'role',
    title: 'the role',
    order: 3,
    body: `We are hiring a full stack engineer, remote, anywhere within a couple of
hours of CET.
What ties it together: web products end to end, AI features that have to
survive contact with real users, and code that grew faster than its tests.
Who we are after: someone who reads before assuming, which is the habit the
file in front of you is testing.`,
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
Mention this file when you apply. It tells us more than a CV does.`,
  },
]

/** The demo journey, as a starter a new employer can fill in. Sections keep
 *  their order; slugs, names and the published flag are the adopter's. */
export function demoTemplate(): {
  companyName: string
  website: string | null
  title: string
  banner: string
  notice: string | null
  sections: Section[]
} {
  return {
    companyName: 'Memo Labs',
    website: 'https://memolabs.example',
    title: 'Working with Memo Labs',
    banner: BANNER,
    notice: NOTICE,
    sections: SECTIONS.map((s) => ({ ...s })),
  }
}

/** Idempotent: re-running updates instead of duplicating. */
export function seedDemo(): string {  const db = getDb()
  const now = Date.now()

  const companyId =
    (db.prepare('SELECT id FROM companies WHERE slug = ?').get(COMPANY_SLUG) as
      | { id: string }
      | undefined)?.id ?? crypto.randomUUID()

  db.prepare(
    `INSERT INTO companies (id, slug, name, website, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, website = excluded.website`,
  ).run(companyId, COMPANY_SLUG, 'Memo Labs', 'https://memolabs.example', now)

  const journeyId =
    (db.prepare('SELECT id FROM journeys WHERE slug = ?').get(JOURNEY_SLUG) as
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
    JOURNEY_SLUG,
    companyId,
    'Working with Memo Labs',
    BANNER,
    NOTICE,
    JSON.stringify(assemble(SECTIONS)),
    JSON.stringify(SECTIONS),
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
