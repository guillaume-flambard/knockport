# knockport

**A hiring journey you type into.**

A job posting gets around 254 applications. A recruiter spends most of a working
day reading them to find the four people who actually looked at what the company
builds.

Every tool on the market tries to filter that output better. knockport reduces
the input instead. Candidates explore the company in a terminal, and only the
ones who spend fifteen minutes there ever reach the inbox.

```
~ $ ls -a
projects/
whoami   who we are
stack    what you would touch
role     the role
.knock   knock

~ $ cat .knock
You typed ls -a. Most people never do.
That is the whole test, and it is not about cleverness.
```

The recruiter gets **evidence rather than a score**: what someone read, in what
order, how long they stayed, what they asked. No ranking, no grade, no automated
rejection. Ranking is what an ATS already does, and doing it here would be both
worse and harder to defend.

---

## How it is built

One pure core, several painters.

| | |
|---|---|
| `packages/core` | The journey engine. Zero runtime dependencies, 80 tests. No I/O, no fork, no filesystem access. |
| `packages/terminal` | The browser client. **2.7 kB**. Draws lines, captures keys, speaks WebSocket. It does not contain the engine. |
| `apps/web` | Next.js for HTTP, a custom Node server for the WebSocket upgrade, `node:sqlite` for storage. |

The core holds the virtual filesystem, the parser, the session and the contact
flow. It runs server side and is painted over a WebSocket by the browser client,
which is why the client is so small. An SSH facade will share the same session
manager and change only the transport, because a terminal is a stream and so is
SSH.

### Three things are load bearing

**Evidence, never scores.** The recruiter view shows a timeline, never a ranking.
This is the product's central commitment and it erodes through small, useful
looking additions.

**Rendering goes through `textContent`, never `innerHTML`.** The contact flow
echoes visitor input back into the scrollback, so escaping would be a defence and
`textContent` is an absence of the problem.

**`/j/<slug>/profile` serves the whole journey as plain server rendered HTML.**
Without JavaScript there is no terminal at all, so that page is the only path
left for those visitors. A friction that in practice excludes a disabled
candidate is discrimination, not a filter.

---

## Running it

Node 26 and pnpm. Node runs the TypeScript directly, so there is no build step
for the server.

```bash
pnpm install
pnpm seed     # creates the demo journey
pnpm dev      # http://localhost:3000/j/ojin-product-engineer
```

```bash
pnpm test         # 80 tests
pnpm typecheck
```

The only build step is the browser client, bundled by esbuild into one file. No
bundler config, and no framework inside the terminal.

The repository ships a demo journey built from the public pages of a real
company, clearly marked as unofficial and unaffiliated on both the terminal and
the plain text version.

---

## Why it is not written in Rust

The core was Rust first, with a Dioxus frontend compiled to WebAssembly. Dioxus
took the `wasm32` target from **42 crates to 151** in order to paint a `<pre>` and
an `<input>`, pulling in Objective-C bindings, an mmap crate, a WebSocket server
for hot reload, and six duplicated crate versions. `target/` reached 6.6 GB for
188 kB of source.

The rewrite is TypeScript because of one property: the same core has to run in a
terminal and in a browser without writing the logic twice. Rust needs WebAssembly
to reach the browser and Go compiles to a blob too large for it, so both force
either a boundary or a second implementation.

The Rust version is tagged [`v0-rust`](../../releases/tag/v0-rust). Its three
snapshot files were the oracle for the port: the TypeScript was only accepted
once its output matched them character for character.

---

## License

MIT. See [AGENTS.md](AGENTS.md) if you are an AI assistant working in this
repository, or a human who wants the rules that are not visible in the code.
