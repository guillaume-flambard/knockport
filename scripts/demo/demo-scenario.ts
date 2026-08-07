/**
 * The demo scenario: a list of steps the capture script executes in a real
 * browser. Each step drives the app; steps with a `caption` become a
 * subtitle, `title` a scene heading, `act` a chapter card, and `zoom` a
 * gentle push-in on that scene only.
 *
 * The story is a full stack developer exploring a startup that is hiring, in
 * three acts: the candidate, the company, the outcome. The candidate finds
 * `contact` through `help`, so the discovery is visible, not magic.
 */

export type Step =
  | { action: 'goto'; url: string; pauseMs?: number; caption?: string; title?: string; act?: string; zoom?: boolean }
  | { action: 'type'; target: string; text: string; pauseMs?: number; caption?: string; title?: string; act?: string; zoom?: boolean }
  | { action: 'click'; target: string; pauseMs?: number; caption?: string; title?: string; act?: string; zoom?: boolean }
  | { action: 'press'; target: string; key: string; pauseMs?: number; caption?: string; title?: string; act?: string; zoom?: boolean }
  | { action: 'wait'; ms: number }

/** Which journey slug the demo walks. Seeded by the e2e global setup. */
export const JOURNEY_SLUG = 'harbor'

/** The recruiter passphrase, set on the demo server. */
export const STUDIO_PASS = 'e2epass'

/** Steps run in order. `pauseMs` is the time the video lingers on a step. */
export const STEPS: Step[] = [
  // --- Act 1: the candidate ---
  {
    action: 'goto',
    url: '/',
    pauseMs: 2800,
    caption: 'A job offer you walk into, instead of scrolling past.',
    title: 'knockport',
    act: 'The candidate',
  },
  {
    action: 'goto',
    url: `/j/${JOURNEY_SLUG}`,
    pauseMs: 3800,
    caption: 'A full stack developer arrives at Harbor’s journey.',
    title: 'The candidate page',
  },
  {
    action: 'type',
    target: 'input#cmd',
    text: 'ls',
    pauseMs: 1000,
  },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 2800, caption: 'They look around, the way you would in a shell.', title: 'Explore' },
  {
    action: 'type',
    target: 'input#cmd',
    text: 'cat whoami',
    pauseMs: 1000,
  },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3200, caption: 'Seven people, one product, real customers.', title: 'Read the company' },
  { action: 'type', target: 'input#cmd', text: 'cat stack', pauseMs: 1000 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3200, caption: 'TypeScript, React, Node, Postgres. The stack a full stack engineer expects.', title: 'The stack' },
  { action: 'type', target: 'input#cmd', text: 'cat role', pauseMs: 1000 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3600, caption: 'The role, honestly described. No trick questions.', title: 'The role', zoom: true },
  { action: 'type', target: 'input#cmd', text: 'ls -a', pauseMs: 1000 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 2800, caption: 'ls -a shows everything. Including one quiet file.', title: 'Look closer' },
  { action: 'type', target: 'input#cmd', text: 'cat .note', pauseMs: 1000 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3400, caption: 'A note for anyone who reads before assuming.', title: 'The note' },
  // help reveals contact: it is listed under "reach out & session".
  { action: 'type', target: 'input#cmd', text: 'help', pauseMs: 1000 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3000, caption: 'And there it is: contact, under reach out & session.', title: 'How to reach out' },
  {
    action: 'type',
    target: 'input#cmd',
    text: 'contact',
    pauseMs: 900,
  },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 1000 },
  { action: 'type', target: 'input#cmd', text: 'Ada Lovelace', pauseMs: 700 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 700 },
  { action: 'type', target: 'input#cmd', text: 'ada@example.com', pauseMs: 700 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 700 },
  { action: 'type', target: 'input#cmd', text: 'I found the note. Full stack, eight years.', pauseMs: 800 },
  { action: 'press', target: 'input#cmd', key: 'Enter', pauseMs: 3200, caption: 'Three questions, and the application is on its way.', title: 'Applying', act: 'The company', zoom: true },

  // --- Act 2: the company ---
  {
    action: 'goto',
    url: '/studio/login',
    pauseMs: 1600,
    caption: 'Back at Harbor, the team runs its journey.',
    title: 'The studio',
  },
  { action: 'type', target: '#pass', text: STUDIO_PASS, pauseMs: 700 },
  { action: 'click', target: 'button[type=submit]', pauseMs: 2200 },
  { action: 'goto', url: '/studio/new', pauseMs: 3200, caption: 'A new offer for a full stack engineer.', title: 'The builder' },
  { action: 'type', target: '#companyName', text: 'Harbor', pauseMs: 700 },
  { action: 'type', target: '#slug', text: 'harbor', pauseMs: 700 },
  { action: 'click', target: 'button:has-text("Continue") >> nth=0', pauseMs: 1400 },
  { action: 'type', target: '#title', text: 'Working at Harbor', pauseMs: 700 },
  { action: 'type', target: '#banner', text: 'Welcome to Harbor.\nWe build the software that keeps warehouses moving.', pauseMs: 900 },
  { action: 'click', target: 'button:has-text("Continue") >> nth=1', pauseMs: 1400 },
  // The live preview on the right reflects the offer as it is written.
  { action: 'goto', url: `/studio/j/${JOURNEY_SLUG}/inbox`, pauseMs: 3600, caption: 'Applications arrive with the whole journey behind them.', title: 'The inbox', act: 'The outcome', zoom: true },

  // --- Act 3: the outcome ---
  { action: 'wait', ms: 1600 },
]
