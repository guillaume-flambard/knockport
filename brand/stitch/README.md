# Stitch design pipeline (knockport)

Google Stitch MCP generates screens and a design system from
`brand/DESIGN.md`, the single source of truth for the product's visual
language.

## What exists

- `brand/DESIGN.md` — the semantic design system (atmosphere, palette,
  typography, components, motion, anti-patterns). Encodes the real knockport
  tokens: Terminal Black #0b0d0e, Screen White #e8e6e1, Teal Signal #7fd6d1,
  IBM Plex Mono, square corners, hairline rules.
- `brand/stitch/*.png` — the four generated screens (landing, candidate
  terminal, studio builder, inbox).
- `brand/stitch/showcase.html` — a local page that displays them side by
  side. Open it in a browser to review.

## The Stitch project

- Google Cloud project (ADC quota): `gen-lang-client-0687264434`
  (`gcloud config set project gen-lang-client-0687264434`).
- Stitch project id: `projects/2750502845603089448` (title "knockport").
- Design system asset id: `assets/86b9a864f2f040299206265bd8508da4`
  ("Knockport Core", created from DESIGN.md via upload_design_md +
  create_design_system_from_design_md).

## Commands

The Stitch MCP server runs over stdio and is configured in
`~/.config/opencode/opencode.json` under `mcp.stitch`. It self-authenticates
with the Google Application Default Credentials; the active gcloud project
must be the ADC quota project above.

To call it directly from a shell, pipe a JSON-RPC `tools/call` into
`npx -y stitch-mcp@latest` (see `scripts/demo` for the same pattern).

Useful tools: `generate_screen_from_text`, `edit_screens`,
`generate_variants`, `fetch_screen_code`, `fetch_screen_image`,
`apply_design_system`, `list_design_systems`.

## Regenerating a screen

Edit `brand/DESIGN.md` if the visual language changes, re-upload it
(`upload_design_md`), recreate the design system, then
`generate_screen_from_text` with the `designSystem` asset id and the new
prompt. Download the screenshot from the returned `downloadUrl`.

## Notes

- Quota: ~350 generations/month on the free tier.
- The community package `stitch-mcp` is used (Google's `@google/stitch-mcp`
  is not on the public npm registry).
- Changing the active gcloud project affects other Google Cloud tooling;
  keep the ADC quota project as the active one while working with Stitch.
