# Agent skills (versioned here)

Skills developed alongside knockport, versioned in the repo so they are
reproducible. Install them globally with:

```bash
mkdir -p ~/.config/opencode/skills
for skill in ux-ui-review audit-knockport demo-video skill-test-suite; do
  cp -R "skills/$skill" ~/.config/opencode/skills/
done
```

| Skill | What it does |
|---|---|
| `ux-ui-review` | Audits screens against real UX/UI/onboarding guidelines (NN/g heuristics, discoverable-CLI rules, microcopy, empty states). |
| `audit-knockport` | The exhaustive six-dimension audit pass over this repo (architecture, AppSec, business logic, a11y, performance, resilience). |
| `demo-video` | Generates the automated demo video: scripted Playwright capture + Remotion composition. |
| `skill-test-suite` | A quality rubric (frontmatter, examples, output, length) for auditing agent skills. |

Each folder holds its `SKILL.md`. The copies here are the canonical versions;
re-install from here rather than editing `~/.config/opencode/skills` directly.
