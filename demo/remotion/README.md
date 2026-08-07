# Remotion composition for the knockport demo

This project renders the demo video: the Playwright capture (`out/capture.webm`)
plays in full, with scene titles and subtitles overlaid from
`out/timings.json`, and optional background music from `assets/background.mp3`.

It is an isolated project on purpose: Remotion and its renderer are heavy, so
they do not touch the root `package.json` or the CI.

## Setup

```bash
pnpm install
```

## Render

`compose.mjs` at the repo root copies the capture and timings into
`public/`, then:

```bash
npx remotion render DemoVideo ../../out/demo-final.mp4
```

## Iterate

```bash
npx remotion studio   # live preview at http://localhost:3000
```

Edit `src/DemoVideo.tsx` for layout, `src/Root.tsx` for duration/fps.
