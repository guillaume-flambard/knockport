# knockport

A hiring journey you type into.

A job posting gets around 254 applications. A recruiter spends most of a working
day reading them to find the four people who actually looked at what the company
builds. Every tool on the market tries to filter that output better. knockport
reduces the input instead: candidates explore the company in a terminal, and only
the ones who spend fifteen minutes there ever reach the inbox.

The recruiter gets evidence rather than a score. What someone read, in what order,
how long they stayed, what they asked. The hiring decision stays with the human.

```
~ $ ls -a
projects/
whoami   who we are
stack    what you would touch
role     the role
.knock   knock

~ $ cat .knock
You typed ls -a. Most people never do.
```

## How it is built

One pure core, several painters.

```
packages/core       the journey engine. Zero runtime dependencies, 72 tests.
                    No I/O, no fork, no filesystem access. Runs anywhere.
packages/terminal   the browser client. 2.7 KB. Draws lines, captures keys,
                    speaks WebSocket. It does not contain the engine.
apps/web            Next.js for HTTP, a custom Node server for the WebSocket
                    upgrade, node:sqlite for storage.
```

The core holds the virtual filesystem, the parser, the session and the contact
flow. It runs server side and is painted over a WebSocket by the browser client.
An SSH facade will share the same session manager, changing only the transport,
because a terminal is a stream and so is SSH.

Three things are load bearing and easy to break:

- **Evidence, never scores.** The recruiter view shows a timeline, never a
  ranking, never a grade. Ranking is the ATS's job.
- **Rendering goes through `textContent`, never `innerHTML`.** The contact flow
  echoes visitor input back into the scrollback.
- **`/j/<slug>/profile` serves the whole journey as plain server rendered HTML.**
  Without JavaScript there is no terminal at all, so that page is the only path
  left for those visitors. It is an accessibility obligation, not a nicety.

## Running it

Requires Node 26 and pnpm. Node runs the TypeScript directly, so there is no
build step for the server.

```bash
pnpm install
pnpm seed          # creates the demo journey
pnpm dev           # http://localhost:3000/j/ojin-product-engineer
```

```bash
pnpm test          # 72 tests
pnpm typecheck
```

The only build step is the browser client, bundled by esbuild into a single
file. No bundler config, no framework in the terminal.

## History

The core was written in Rust first, with a Dioxus frontend compiled to
WebAssembly. Dioxus took the `wasm32` target from 42 crates to 151 in order to
paint a `<pre>` and an `<input>`, pulling in Objective-C bindings, an mmap
crate, a WebSocket server for hot reload, and six duplicated crate versions.
`target/` reached 6.6 GB for 188 KB of source.

The rewrite is in TypeScript because of a single property: the same core has to
run in a terminal and in a browser without writing the logic twice. Rust needs
WebAssembly to reach the browser, and Go compiles to a multi megabyte blob, so
both force either a boundary or a second implementation.

The Rust version is tagged `v0-rust`. Its three snapshot files were used as the
oracle for the port: the TypeScript was only accepted once its output matched
them character for character.

## License

MIT.
