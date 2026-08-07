# Design System: knockport

## 1. Visual Theme & Atmosphere

A single-purpose tool that borrows the calm of a terminal. Density is high
(7/10) but never busy: monospace everywhere, square corners, thin rules, one
teal accent. Variance is moderate (5/10): layouts are mostly single-column
and left-aligned, with asymmetric whitespace where a moment needs emphasis.
Motion is restrained (4/10): fades and slides on state changes, nothing that
draws attention to itself. The atmosphere is deliberate and quiet, like a
terminal you trust. Dark by default, always: the product does not follow the
system color scheme, it stays dark like a terminal. The light palette is
documented below as the future second theme, but nothing auto-applies it
until there is a real toggle.

Two audiences share one visual language: the candidate, who types their way
through a company in the terminal; and the recruiter, who builds journeys in
the studio. Both should read as the same product.

## 2. Color Palette & Roles

Dark theme (default):

- **Terminal Black** (#0b0d0e) — Primary background surface
- **Screen White** (#e8e6e1) — Primary text and foreground
- **Muted Fog** (#7d8285) — Secondary text, metadata, timestamps, helper text
- **Teal Signal** (#7fd6d1) — The single accent: focus, active, links, cursor
- **Hairline Rule** (rgba(232,230,225,0.14)) — 1px structural borders and dividers

Light theme (documented, not auto-applied — reserved for a future toggle):

- **Paper** (#fbfaf8) — Primary background surface
- **Ink** (#14171a) — Primary text and foreground
- **Muted Fog** (#6b7175) — Secondary text and metadata
- **Deep Teal** (#0f6f77) — The single accent in light mode
- **Hairline Rule** (rgba(20,23,26,0.14)) — 1px structural borders and dividers

Constraints: exactly one accent, never more. No neon glows, no gradient
text, no pure black (#000000 is banned). The accent is used sparingly: focus
rings, links, the active state, and the terminal's cursor.

## 3. Typography Rules

- **Display and body:** IBM Plex Mono — the whole product is monospace. A
  terminal is the identity, so the face is never traded for a text face on
  the recruiting surfaces. Hierarchy comes from weight (600/700) and color
  (Screen White vs Muted Fog), not from size alone.
- **Scale:** small and tight. Body ~0.95rem, line-height ~1.65. Headings
  ~1.35rem for pages, ~1.05rem for sections. No huge display type.
- **Case:** fieldset legends and small labels are uppercase with wide letter
  spacing (0.04em–0.06em), used as quiet section markers.
- **Banned:** Inter, generic system fonts for anything premium. No serif.
  No mixed-font poses.

## 4. Component Stylings

- **Buttons:** Flat, square corners (border-radius 0), 1px accent border,
  transparent fill. On hover, a 12% teal tint; on active, pressed inward.
  The label is the accent color. No outer glow, no gradient, no custom cursor.
- **Cards / panels:** Square corners, 1px hairline rule border. Used only for
  grouped form content (the builder's section blocks, the inbox's
  application cards). No shadow-heavy elevation; the terminal stays flat.
- **Inputs / forms:** Transparent fill, 1px hairline rule border, square
  corners, ~0.55rem padding. Focus ring is a 1px teal border (no outline
  offset jump). Labels sit above the input in muted uppercase; helper text
  one line below in Muted Fog; error text below in the accent (used as the
  error color). No floating labels, no placeholder-as-label.
- **Terminal:** The hero component. Dark chrome bar with three dots, a
  scrollback in Screen White, a teal prompt sigil, and a blinking text
  cursor. Input is invisible-chrome: just the sigil and the typed text.
- **Empty states:** A composed line of Muted Fog that names what will appear
  and where it comes from ("No applications yet. A candidate reaches you by
  typing contact in the terminal..."). Not a bare "Nothing here."
- **Banner / notice:** The first lines of the terminal, plain; an optional
  notice below in Muted Fog, and a first-run nudge in the same gray.

## 5. Layout Principles

- Single-column, left-aligned, max-width ~52rem for the studio; the terminal
  fills its stage. The builder is a two-column split (form left, live preview
  right) that collapses to one column below 960px.
- The studio is a tool, not a brochure: rows and hairlines, never cards, for
  lists. The journey list on the dashboard is rows separated by 1px rules.
- Grid over flexbox math; no calc() percentage hacks. Contain with max-width.
- Generous vertical rhythm between fieldsets (~2.25rem); tight internal
  padding. Square corners everywhere — rounded corners are banned.
- No overlapping elements; every element occupies its own spatial zone.

## 6. Motion & Interaction

- Fades and slides only, driven by transform and opacity. No layout-animating
  properties (top/left/width/height).
- The live preview updates on each keystroke without animation: it is a
  mirror, not a performance.
- The terminal cursor blinks; nothing else is perpetual. Interaction is
  immediate and quiet. No spring overshoot, no staggered orchestration on a
  tool this deliberate.

## 7. Anti-Patterns (Banned)

- No emojis anywhere.
- No Inter; no generic system font posing as a design choice.
- No serif fonts.
- No pure black (#000000); never use rounded corners.
- No neon/outer glow shadows; no gradient text; no purple/blue AI-neon.
- No 3-column equal card layouts; the dashboard is rows with hairline rules.
- No generic placeholder names (John Doe, Acme, Nexus) in demo content.
- No fake round numbers (99.99%, "10x").
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").
- No filler UI text ("Scroll to explore", bouncing chevrons, scroll arrows).
- No broken image links; use the brand assets or SVG.
- No centered hero; no floating labels; no custom mouse cursors.
