# Contributing to knockport

Thank you for considering a contribution. This is an early open-source product experiment, not a production recruitment system.

## Start with a focused issue

For a substantial UI, data-handling, security, accessibility or domain change, open an issue explaining the user-visible problem, the affected flow and the planned acceptance tests. Small documentation fixes may go directly to a pull request.

Please do not post real applicant information, credentials or data from employers you do not control.

## Local development

Prerequisites: Node.js 24, pnpm 10.14, and a supported Chromium for browser testing.

```sh
pnpm install --frozen-lockfile
pnpm seed
pnpm dev
```

The demo journey is available at `http://localhost:3010/j/memo-labs`. Keep local secrets out of Git and avoid making the existing demo look like another company's recruitment site.

Before submitting:

```sh
pnpm audit:full
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Tests may require the browser's OS dependencies. The CI workflow runs its own Playwright setup.

## Pull request expectations

Describe **why** the change matters to a candidate or recruiter, not only which files changed. Include an issue reference where useful, tests covering the changed behavior, and screenshots or a short real capture for any interface change.

Keep the key product commitments intact: the engine remains testable independently of its UI; the browser terminal uses safe text rendering; there is a working no-JavaScript journey; and the recruiter inbox never adds automated suitability scores without an explicit product/security review.

Do not claim accessibility certification, security approval, production readiness or hiring effectiveness based on green CI alone. Mark what you ran, the exact environment and what remains unverified.

## Reporting vulnerabilities

Please read [SECURITY.md](SECURITY.md) and use a private channel for sensitive disclosures rather than publishing exploits or personal data.
