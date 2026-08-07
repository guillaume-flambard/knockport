---
name: demo-video
description: |
  Generate a polished, automated demo video of a web app — scripted browser
  walkthrough, screen-captured with Playwright recordVideo, then composed with
  Remotion (animated titles, word-level captions, zooms, transitions) and
  finished with ffmpeg (background music, final mp4). Use when asked to make a
  demo video, walkthrough, product showcase, screencast, "créer une vidéo de
  démo", or to refresh the demo after a feature change. Covers any app that is
  Playwright-testable and React/Remotion-composable.
---

# demo-video

Turn a scripted browser walkthrough into a finished demo video, no manual
editing. One source of truth (`demo-script.ts`) drives recording, subtitles,
titles and pacing.

The canonical working implementation is **sku-regulator**
(`~/projects/sku-regulator`), where the video system lives in a **standalone
`video/` module — external to the app core** (own package.json, no Remotion
inside the web app): `video/scripts/demo-script.ts`, `video/scripts/record.mjs`,
`video/src/`, `video/scripts/assemble.mjs`, `make demo-video`. Read it to see
the pattern concretely; replicate the structure in any project.

## The pipeline

```
video/scripts/demo-script.ts — scenes: title, subtitles, duration, actions, focus
      │
      ├─► record.mjs        — Playwright recordVideo → one .webm per scene
      │
      ├─► src/              — Remotion composition: title cards, lower-third
      │                       captions, Ken-Burns zooms, TransitionSeries
      │
      └─► assemble.mjs      — ffmpeg: mix CC-BY background music, concat,
                               fades → dist/final/demo.mp4
```

## Commands (typical; adapt to the project's package manager)

```bash
make demo-video          # one-shot: fetch music → record → render → mix
cd video && node --experimental-strip-types scripts/record.mjs   # just record
cd video && npx remotion render src/index.tsx DemoVideo dist/final/composed.mp4  # just compose
cd video && node scripts/assemble.mjs                            # just mix
cd video && node scripts/fetch-music.mjs                         # download CC-BY track
```

Prereqs: the app is running (API + web), the `video/` module has its own
`node_modules` (`cd video && npm install --legacy-peer-deps`), `ffmpeg` on PATH.

## Scene script — the LLM's surface

`demo-script.ts` exports a typed `Scene[]`. Each scene:

```ts
interface Scene {
  id: string;               // "explore-rag"
  title: string;            // animated title card
  subtitles: string[];      // SHORT burn-in captions (labels, not narration)
  durationSec: number;      // scene length (drives pacing + caption timing)
  focus?: { x: number; y: number; scale: number }; // Ken-Burns zoom target
  actions: Step[];          // Playwright steps: goto/click/type/press/wait/scroll
}
```

Keep subtitles **short** (a few words) and readable twice over (≥2.5s each).
The LLM writes/updates this file from the product's demo runbook — it is the
single source of truth; do not hand-edit the recording/assembly machinery for a
one-off.

## Remotion best practices (learned; apply these)

- **Transitions**: use `@remotion/transitions` `TransitionSeries` (`wipe()`,
  `iris()`, `fade`) between scenes instead of hand-rolled opacity fades.
- **Captions lower-third** (not karaoke): one short phrase at a time in a
  discreet bottom pill — the professional product-demo look (Screen Studio
  style), not TikTok-style word-by-word. A single accent word can guide the eye.
  Timings come from `durationSec`; no Whisper needed without a voiceover.
- **Motion design restraint**: ease everything (`Easing.out(Easing.quad)`),
  keep zooms subtle (scale ~1.06–1.08), one effect at a time, never over-animate.
- **Rendering**: `OffthreadVideo` (headless-safe) for the recorded .webm;
  `staticFile()` for media; serve webm copies via Remotion `setPublicDir`.
- **Props**: expose a Zod `schema` + `defaultProps` on the Composition so an
  agent can regenerate the video with new text/durations without touching React.
- **Iterate like an agent**: `remotion still ... --frame=N` to check a frame,
  then adjust the scenario, then render.

## ffmpeg finish

Mix the background track at low volume (`~0.14`) with fade-in/out; subtitles are
already burned into the composed frames (Remotion), so no `drawtext` needed.

## Guardrails

- **Music must be royalty-free with attribution**: e.g. Josh Woodward
  (CC BY 4.0, direct MP3 at joshwoodward.com). Show attribution in the end card
  and in the pipeline docs. Do not commit the binary; fetch it on demand.
- Never record real candidate data, secrets, or personal info — demo on a
  seeded, safe journey.
- The recorded app behavior is real; do not fabricate numbers shown on screen.
- `record.mjs` / `assemble.mjs` are stable machinery — tune the
  scenario, not the pipeline, for pacing/content changes.
