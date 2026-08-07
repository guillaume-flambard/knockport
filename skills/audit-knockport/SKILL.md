---
name: audit-knockport
description: |
  Exhaustive automated audit of the knockport codebase across six dimensions:
  architecture & static quality, security (AppSec), business logic integrity,
  UI/UX & accessibility, performance & resilience, and LLM/AI (not applicable
  here). Orchestrates the repo's own checks (pnpm test, test:e2e, typecheck)
  plus targeted grep/analysis, classifies findings P0/P1/P2, and corrects.
  Use when asked to audit, harden, or "run a full review" of knockport.
---

# audit-knockport

A repeatable audit pass over the knockport repo. Run the checks below in
order, record findings with `file:line`, classify P0 (security/data loss) /
P1 (robustness) / P2 (polish), fix what the task allows, and end with a
verdict per dimension.

## Step 0 — Baseline

```bash
pnpm typecheck && pnpm test
```

Both must be green before any judgement. If they are not, that is the first
finding.

## 1. Architecture & static quality

- Repo rules (AGENTS.md): `packages/core` has zero runtime dependencies;
  relative imports carry `.ts`; no `Co-Authored-By`; prose without em/en
  dashes; evidence not scores.
- Duplication / coupling / god objects: grep for repeated SQL, repeated
  validation, or a single module doing too much.
- Dependencies: `pnpm outdated`, `pnpm audit` (expect 0 known CVEs).
- Secrets: grep for hardcoded keys/passwords/tokens (see
  `scripts/audit-deps.mjs` for the pattern set).
- Typecheck coverage: the root script must cover `apps/web` too.

## 2. Security (AppSec)

- HTTP security headers on every response: CSP, HSTS (prod), nosniff,
  X-Frame-Options, Referrer-Policy.
- SQL injection: every `prepare`/`exec` parameterized (no string
  interpolation of user input).
- XSS: terminal echoes visitor text with `textContent`, never `innerHTML`.
- CSRF: state-changing server actions rely on SameSite cookies; honeypot on
  the no-JS contact form.
- IDOR: `/studio/**` routes sit behind the `(auth)` layout; inbox guarded.
- Brute force: login is rate limited.
- WS: `maxPayload`, session caps, `checkOrigin` present.
- Secrets: none committed.

## 3. Business logic integrity

- Contact invariants: name/email/message validators identical on the WS and
  no-JS paths; email format; length limits.
- Draft/publish lifecycle: `published_at` transitions are coherent.
- Slug edge cases: length bounds (1..64), charset, case, uniqueness.
- Session transitions: contact can cancel at any step without side effects.

## 4. LLM/RAG — NOT APPLICABLE

knockport has no AI features. Mark "n/a" in the report, do not fabricate.

## 5. UI/UX & accessibility

- axe-core scan on the public terminal, the plain profile page, and the
  studio builder: contrast, ARIA, landmark/semantic structure.
- Keyboard reachability of the terminal input and the wizard.
- Layout sanity across mobile/tablet/desktop viewports (screenshots, no
  overflow/truncation).

## 6. Performance & resilience

- N+1: the inbox loads each candidate's timeline in its own query; must be a
  single `IN (...)` fetch.
- DB failure: a closed/unavailable database yields a clear error, not a
  silent crash.
- WS concurrency: many parallel sessions behave under the cap; beyond it,
  refused cleanly.
- Session expiry: expired sessions close with a reason.

## Common failure modes to catch

- Missing security headers (silent, every response).
- A `getSessionTimeline` call inside a per-candidate map (N+1).
- An unauthenticated route that should be behind `(auth)`.
- `innerHTML`/`dangerouslySetInnerHTML` anywhere near user text.
- A login/contact endpoint with no throttling.
- A draft that a logged-in guard accidentally serves publicly.
