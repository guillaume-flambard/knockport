---
name: ux-ui-review
description: |
  UX/UI/onboarding review and implementation skill. Encodes the real guidelines:
  Nielsen Norman Group's 10 usability heuristics, discoverable-CLI rules
  (clig.dev), SaaS onboarding patterns (activation, empty states, templates),
  wizard/multi-step form best practices, and microcopy rules. Use when auditing
  a screen for usability, when improving an onboarding flow, when designing a
  form/wizard/empty-state/CLI, or when asked to "make it more intuitive" or
  "make it more user friendly".
---

# ux-ui-review

Real guidelines, turned into a checklist. Use it to audit an existing screen or
to design a new one. Always read the relevant code first, then apply the
checks, then report concrete gaps with `file:line` references.

## The source concepts (do not re-derive)

- **NN/g 10 usability heuristics** (nngroup.com): (1) visibility of system
  status, (2) match between system and real world, (3) user control & freedom,
  (4) consistency & standards, (5) error prevention, (6) recognition rather
  than recall, (7) flexibility & efficiency of use, (8) aesthetic & minimalist
  design, (9) help users recognize/diagnose/recover from errors, (10) help &
  documentation.
- **Discoverable CLIs** (clig.dev): a CLI should nudge toward the commands a
  user is most likely to run, show examples, suggest the next command, and
  suggest what to do on error. Keep help scannable (grouping, short examples).
- **Onboarding** (Appcues/Chameleon/NN/g): the empty state is the activation
  trigger. Every empty state should answer What-Why-Next (what this is, why it
  matters, what to do next). Design each flow around ONE activation milestone
  (the "aha"), not a feature tour. Front-loading features kills activation.
  Templates/sample data lower blank-slate anxiety (Airtable pattern).
- **Wizard / multi-step forms** (NN/g, FormAssembly, eleken): use a wizard for
  long unfamiliar one-time tasks; keep steps under 10; always show progress;
  validate per step (never only at the end); Back/Forward must preserve input;
  save-and-resume for long flows. A short form beats a decorative wizard.
- **Form microcopy** (Baymard, NN/g): labels specific and close to the field;
  placeholders are examples, never labels; helper text one line, inline, placed
  consistently; error messages specific, actionable, polite, shown NEXT to the
  field, never only as a banner after submit.
- **Recognition over recall**: convert "remember X" into "see X". Show the
  available choices (menu, autocomplete, preview) instead of expecting the user
  to recall command names or field formats.

## Audit workflow

1. Read the screen's code (component + server action + styles).
2. Walk the user journey: first arrival, first action, a mistake, completion.
3. Run the checklists below. Record every violation with `file:line`.
4. Classify each gap P0 (data loss, dead end, breaks core value) / P1
   (onboarding friction) / P2 (polish).
5. Present findings as a short list of specific, actionable changes. Never
   propose an aggregate that reads as a rank/grade (see Repo guardrails).

## Checklist: any screen

- [ ] Can the user always tell what the system is doing (save feedback, loading)?
- [ ] Are there visible escape hatches: back, cancel, undo, close?
- [ ] Is the primary action visually dominant and unambiguous?
- [ ] Are errors shown next to the field that caused them, with a fix?
- [ ] Can a user recover from a mistake without losing work?
- [ ] Does it use recognition (choices, examples, preview) over recall?
- [ ] Is every empty state a What-Why-Next moment, not a dead end?
- [ ] Is destructive action confirmed, and reversible when possible?

## Checklist: forms & wizards

- [ ] Step-by-step validation, not one error wall at the end.
- [ ] Helper text (one line) under ambiguous fields; placeholders only as
      examples; never placeholder-as-label.
- [ ] Progress visible in multi-step flows; back preserves input.
- [ ] Long flows support save-and-resume.
- [ ] Duplicate/collision handled (e.g. slug already taken) without data loss.
- [ ] Success confirmation with the payoff (link, next action).

## Checklist: CLI / terminal

- [ ] First run nudges toward the most likely first command (one hint, then gone).
- [ ] `help` is grouped and shows an example per command group.
- [ ] Unknown commands suggest recovery (did you mean / try help).
- [ ] Completion/autocomplete + history navigation for recognition & speed.
- [ ] The money action (e.g. contact) is discoverable, not buried.
- [ ] Tab-completion and arrow keys do not require focus loss.

## Checklist: onboarding

- [ ] One activation milestone per flow.
- [ ] Templates or an example to start from (lower blank-slate anxiety).
- [ ] Celebrate/promote the payoff moment (published link, first application).
- [ ] Empty states teach what comes next, with a path.
- [ ] Never front-load the whole feature set in the first session.

## Repo guardrails (knockport, non-negotiable)

- **Evidence, never scores.** Never render a number that reads as a rank, grade
  or quality signal; never sort candidates by "best". Timelines and counts of
  factual actions are fine; quality judgments are not.
- **`textContent`, never `innerHTML`** when echoing visitor text.
- **`/j/<slug>/profile` must work with JavaScript disabled.** It is the legal
  fallback. Any new candidate-facing interaction must remain reachable without
  JS (or be purely decorative).
- **Comments explain why, not what.** No `Co-Authored-By` trailers.
- **No IP addresses stored**, not even hashed.

## Common failure modes to catch

- Decorative wizard on a short form (adds steps, adds drop-off).
- Error banner after submit instead of inline errors.
- Placeholder used as the only label (accessibility + recall failure).
- Empty state with no path forward ("Nothing yet." is a dead end).
- Slug/title collision silently overwriting existing data.
- "Aha" moment buried behind setup; user leaves before the value is visible.

## Output

Produce a prioritized list of findings, each with the violated guideline,
the concrete problem, and the fix. Classify every finding P0 (data loss, dead
end, breaks core value) / P1 (onboarding friction) / P2 (polish), and cite
`file:line` for each. Never propose an aggregate that reads as a rank or
grade: the audit evaluates the interface, not the users of it.
