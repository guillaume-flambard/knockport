# AGENTS.md

Guidance for any AI assistant working in this repository. Model agnostic on
purpose: nothing here depends on a particular tool.

Read `README.md` first for what the product is and why it exists.

## The shape of the code

```
packages/core       the journey engine. Pure, zero runtime dependencies.
packages/terminal   the browser client. No framework, bundled by esbuild.
apps/web            Next.js (HTTP) + a custom Node server (WebSocket upgrade).
content/            the personal demo journey, compiled at build time.
crates/             the retired Rust implementation. Tagged v0-rust.
```

## Rules that are not negotiable

**`packages/core` has zero runtime dependencies.** Its `package.json` has no
`dependencies` key. That property is the whole reason the core can run in Node,
in a browser and inside an SSH session without adaptation. Adding a dependency
there is a design change, not a convenience.

**Evidence, never scores.** The recruiter view shows what a candidate did and
when. It must never render a number that reads as a rank, a grade or a quality
signal, and must never sort by "best candidate". Ranking belongs to the ATS.
This is the product's central ethical commitment, and it erodes through small
useful looking additions, so justify any aggregate you add.

**Render with `textContent`, never `innerHTML`.** The contact flow echoes
visitor supplied text back into the scrollback.

**`/j/<slug>/profile` must keep working with JavaScript disabled.** Since the
terminal moved to a WebSocket, that page is the only access path for those
visitors. Treat it as a legal requirement, not a fallback. That includes
answering: the page carries its own contact form, as a server action so it
posts without any client JavaScript. Reading without being able to reply is
the same exclusion in a politer form.

**Candidates are never asked to do real work.** They traverse a journey. They do
not solve issues, write code or produce anything the company could use.

**No IP addresses are stored, not even hashed.**

## Conventions

- Node 26 runs TypeScript natively, so relative imports carry an explicit `.ts`
  extension. This is required, not stylistic.
- Prefer Node built ins over packages: `node:sqlite`, `crypto.randomUUID()`,
  `crypto.scrypt` are all in use and replaced three third party dependencies.
- Comments explain why, not what, and are worth writing when a choice looks
  wrong at first glance.
- Commit messages never carry a `Co-Authored-By` trailer.
- Prose in this repository avoids em dashes and en dashes.

## Gotchas that already cost time

- **Do not let a file watcher watch `.next/`.** Next rewrites its manifests on
  every route compilation, so a naive `node --watch` restarts the server on
  every request and kills it mid-response. The dev script watches only
  `server.ts`, `src/session` and `src/db`.
- **The database path must not depend on the working directory.** Root scripts
  run from the repo root and Next runs from `apps/web`, which silently produced
  two different database files. `KNOCKPORT_DB` is exported explicitly.
- **React must not own the terminal DOM.** A `<script>` placed in the React tree
  does not execute after a client side navigation, and mutating server rendered
  markup breaks hydration. The page renders an empty mount point and the client
  builds everything inside it.
- **Deploy on one machine only.** SQLite has a single writer and the session
  manager keeps state in memory.
- **Never hardcode a section name into the engine.** The dispatcher, the help
  listing and the completion once carried `whoami` and `stack` as literals,
  because those were the two root files of the only journey that existed. Any
  company journey with a third section had it listed by `ls` and then rejected
  by the parser. The command surface is derived from the content, and tests
  that only use `content.generated.ts` cannot see this class of bug, which is
  what `test/fixture.ts` is for.

## Testing

```bash
pnpm test        # 80 tests, must stay green
pnpm typecheck
```

The three snapshots in `packages/core/test/__snapshots__` were copied by hand
from the retired Rust implementation and used to prove the port was faithful.
They may now be updated deliberately, but never with `--update`: regenerating a
snapshot from current output records whatever the code does, including a bug,
and then passes forever while proving nothing.
