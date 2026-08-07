/**
 * Cree le parcours de demonstration Ojin.
 *
 * Tout ce qui est ecrit ici vient de leur surface publique, verifiee le
 * 2026-08-05: site, org GitHub `ojinai`, PyPI, en-tetes HTTP, offre Greenhouse.
 * Rien n'est suppose. Un parcours qui se trompe sur l'entreprise qu'il decrit
 * est pire que pas de parcours du tout.
 *
 * Idempotent: relancer met a jour au lieu de dupliquer.
 *
 *   node scripts/seed-ojin.ts
 */
import { getDb } from '../apps/web/src/db/index.ts'
import { assemble } from '../apps/web/src/journey/assemble.ts'
import type { Section } from '../apps/web/src/journey/assemble.ts'

const COMPANY_SLUG = 'ojin'
const JOURNEY_SLUG = 'ojin-product-engineer'
const GREENHOUSE = 'https://job-boards.eu.greenhouse.io/ojin/jobs/4716174101'

const BANNER = [
  'ojin',
  'product engineer, berlin or remote europe',
  '',
  'ls    look around',
  'help  complete list',
].join('\n')

const SECTIONS: Section[] = [
  {
    name: 'whoami',
    title: 'who we are',
    order: 1,
    body: `Ojin. Formerly Journee, renamed in April 2026. Same team, same Berlin company,
new name on the door.
We build conversational avatars that hold a real face and answer in real time.
BMW, Meta, Adidas, Siemens and the European Union ship with us.
Fifteen people. You would sit next to the people who decide.`,
  },
  {
    name: 'stack',
    title: 'what you would touch',
    order: 2,
    body: `Most of the surface is TypeScript. The public SDK is a WebSocket client for
speech to video, and it is the shortest path into how a session actually opens.
The real time core is Python: our own forks of Pipecat and LiveKit Agents.
Everything runs on AWS with distributed GPU inference and edge routing.
Latency is not a metric here, it is the design constraint. Every choice either
pays for it or gets cut.`,
  },
  {
    name: 'role',
    title: 'the role',
    order: 3,
    body: `Product Engineer. Two to five years.
The job runs from high end interactive frontends to backend agentic systems,
and most weeks touches both.
Berlin hybrid, or remote anywhere in Europe within two hours of CET.
We are opening the platform to customers right now, so this seat sits close to
that decision rather than downstream of it.`,
  },
  {
    name: 'oris',
    title: 'the product',
    order: 1,
    dir: 'projects',
    body: `Oris Presence is the high fidelity face: hands, micro expressions, the one you
put in a flagship experience.
Oris Portrait is the fast one: 720p, 25 frames per second, lip sync under 200
milliseconds, one HTML tag to embed, five cents a minute.
Six repositories are public under github.com/ojinai, including our Pipecat fork.
Read js-sdk first.`,
  },
  {
    name: 'knock',
    title: 'knock',
    order: 99,
    hidden: true,
    body: `You typed ls -a. Most people never do.
That is the whole test, and it is not about cleverness. It is about looking
before assuming, which is the same habit that catches a forty millisecond
regression before a customer does.
Mention this file when you write to us. It tells us more than a cover letter.`,
  },
]

const now = Date.now()
const db = getDb()

const companyId =
  (db.prepare('SELECT id FROM companies WHERE slug = ?').get(COMPANY_SLUG) as
    | { id: string }
    | undefined)?.id ?? crypto.randomUUID()

db.prepare(
  `INSERT INTO companies (id, slug, name, github_org, created_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(slug) DO UPDATE SET name = excluded.name, github_org = excluded.github_org`,
).run(companyId, COMPANY_SLUG, 'Ojin', 'ojinai', now)

const journeyId =
  (db.prepare('SELECT id FROM journeys WHERE slug = ?').get(JOURNEY_SLUG) as
    | { id: string }
    | undefined)?.id ?? crypto.randomUUID()

db.prepare(
  `INSERT INTO journeys
     (id, slug, company_id, title, banner, content, cv_url, book_url, published_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(slug) DO UPDATE SET
     title = excluded.title,
     banner = excluded.banner,
     content = excluded.content,
     cv_url = excluded.cv_url,
     book_url = excluded.book_url,
     published_at = excluded.published_at`,
).run(
  journeyId,
  JOURNEY_SLUG,
  companyId,
  'Product Engineer at Ojin',
  BANNER,
  JSON.stringify(assemble(SECTIONS)),
  GREENHOUSE,
  GREENHOUSE,
  now,
  now,
)

console.log(`parcours pret: /j/${JOURNEY_SLUG}`)
