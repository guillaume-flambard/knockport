# Demo video pipeline

Turns a scripted browser walkthrough into a narrated demo video, end to end,
with no manual editing.

## How it works

```
demo-scenario.ts  ->  run-demo.mjs  ->  out/capture.webm + out/timings.json
                                               |
                                               v
                              compose.mjs -> Remotion -> out/demo-final.mp4
```

- `demo-scenario.ts` — the script: a list of steps (goto/type/click/press/
  wait). Steps with a `caption` become a subtitle and a scene title.
- `run-demo.mjs` — boots the e2e server on a disposable database, drives the
  scenario in Chromium with `recordVideo`, writes the raw webm and the scene
  timings.
- `compose.mjs` — copies the capture into the Remotion static dir and renders
  `DemoVideo` to `out/demo-final.mp4`.
- `generate-scenario.mjs` — the LLM hook: rewrites `demo-scenario.ts` from
  the product docs. Edit the result by hand for pacing.

## Commands

```bash
pnpm demo:capture    # record out/capture.webm + out/timings.json
pnpm demo:render     # Remotion -> out/demo-final.mp4
pnpm demo            # both
```

## First-time setup

Remotion lives in its own project so it does not weigh down the root:

```bash
cd demo/remotion && pnpm install
```

Background music is optional: drop a file at `assets/background.mp3`. Without
it the demo has no audio track.

## Iterating

1. Run `pnpm demo:capture` to see the raw recording.
2. Edit `scripts/demo/demo-scenario.ts` (pacing, captions, steps).
3. Run `pnpm demo:render`.
4. Watch `out/demo-final.mp4`.

To preview and tweak the composition frame by frame, use Remotion Studio:

```bash
cd demo/remotion && npx remotion studio
```

It opens http://localhost:3000 with a timeline where each scene can be
scrubbed, and the composition props (scenes, music) are editable via the
schema. Iterate visually here before the final render.

To regenerate the scenario from scratch: `node scripts/demo/generate-scenario.mjs`
