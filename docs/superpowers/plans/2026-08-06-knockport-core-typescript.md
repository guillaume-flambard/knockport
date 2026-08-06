# knockport `packages/core` en TypeScript, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter `crates/core` (le parcours knockport) en TypeScript pur, à parité de comportement prouvée par les 3 snapshots Rust existants.

**Architecture:** Un paquet `@knockport/core` sans aucune dépendance runtime, importable tel quel par Node (façade SSH) et par le navigateur (façade web). Le contenu markdown est parsé une seule fois à la compilation par un script de génération, et non plus au démarrage. Les enums Rust deviennent des unions discriminées.

**Tech Stack:** TypeScript 5.9, Node 26, pnpm workspaces, vitest.

Spec de référence : `docs/superpowers/specs/2026-08-06-knockport-typescript-rewrite-design.md`.
Ce plan couvre l'**étape 2** de la section 12 de la spec. Les étapes 3 à 7 (web, HTTP, SSH, parité, suppression du Rust) feront chacune leur plan.

## Global Constraints

- Node 26.5.0, pnpm 10.14.0. Les deux sont installés sur la machine, vérifiés le 2026-08-06.
- `packages/core` a **zéro dépendance runtime**. Aucun `dependencies` dans son `package.json`. Toute tentative d'en ajouter une est un échec du plan.
- Outillage autorisé pour ce lot, et rien d'autre : `typescript`, `vitest`.
- Tous les imports relatifs portent l'extension `.ts` explicite. Node 26 exécute le TypeScript par type stripping et l'exige.
- `crates/` n'est ni modifié ni supprimé par ce plan. Le Rust doit rester compilable jusqu'à l'étape 7.
- Aucun commit ne porte de ligne `Co-Authored-By`.
- Prose destinée à un humain (messages de commit, README) : jamais de tiret cadratin (`—`) ni demi-cadratin (`–`), ni les entités `&mdash;` / `&ndash;`.
- Le paramètre `atMs` est toujours un nombre de millisecondes fourni par l'appelant. Le core ne lit jamais l'horloge.

## Pièges de portage Rust vers TypeScript

Ces six divergences sont silencieuses : le code compile et les tests naïfs passent. Chacune est adressée par une tâche nommée ci-dessous.

| Rust | Piège | TypeScript correct |
|---|---|---|
| `str::lines()` | `"a\n".split('\n')` rend `["a", ""]`, Rust rend `["a"]` | helper `lines()`, tâche 1 |
| `chars().count()` | `.length` compte des unités UTF-16, un emoji vaut 2 | `[...s].length` |
| `split_whitespace()` | `"".split(/\s+/)` rend `[""]`, Rust rend `[]` | garde sur la chaîne vide |
| `format!("{name:<9}")` | aucun équivalent implicite | `name.padEnd(9)` |
| `trim_start_matches('/')` | retire **toutes** les barres, pas une | `s.replace(/^\/+/, '')` |
| `u32::MAX` en ordre par défaut | pas de `u32` en JS | `Number.MAX_SAFE_INTEGER` |

## Structure des fichiers

```
package.json              racine du workspace, scripts, devDependencies
pnpm-workspace.yaml
tsconfig.json             strict, nodenext, allowImportingTsExtensions
scripts/
  gen-content.mjs         parcourt content/, ecrit content.generated.ts
packages/core/
  package.json            zero dependencies
  src/
    text.ts               lines(), padEnd et compagnie: les helpers de portage
    output.ts             Style, Span, Line, Effect, Output et leurs fabriques
    session.ts            Event, ContactPayload, ContactStep, Mode, Session, prompt
    content.ts            File, Dir, Content, displayName, resolveDir, resolveFile
    content.generated.ts  genere puis commite
    command.ts            Cmd, parse, execute, dispatch
    complete.ts           complete
    commands/
      fs.ts               resolve, pwd, ls, cd, cat
      info.ts             help, history, show
      contact.ts          CV_URL, BOOK_URL, validEmail, validMessage, start, step
    index.ts              reexports publics
  test/
    text.test.ts  content.test.ts  command.test.ts  fs.test.ts
    info.test.ts  contact.test.ts  complete.test.ts  snapshot.test.ts
    __snapshots__/snapshot.test.ts.snap
```

Découpage par responsabilité, calqué sur le Rust : un fichier par famille de commandes, les helpers de portage isolés dans `text.ts` pour être testés seuls.

---

### Task 1: Workspace, outillage, helpers de portage

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`
- Create: `packages/core/package.json`, `packages/core/src/text.ts`
- Test: `packages/core/test/text.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `lines(text: string): string[]`, `words(input: string): string[]`, `charCount(s: string): number`. Utilisés par les tâches 3, 4, 5, 6, 7.

- [ ] **Step 1: Créer le workspace**

`pnpm-workspace.yaml` :

```yaml
packages:
  - packages/*
```

`package.json` à la racine :

```json
{
  "name": "knockport",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.14.0",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "gen:content": "node scripts/gen-content.mjs"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["packages/**/*.ts", "scripts/**/*.mjs"]
}
```

`packages/core/package.json` :

```json
{
  "name": "@knockport/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

- [ ] **Step 2: Installer**

Run: `pnpm install`
Expected: succès, `node_modules` créé, aucune dépendance runtime dans `packages/core`.

- [ ] **Step 3: Écrire les tests des helpers**

`packages/core/test/text.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { charCount, lines, words } from '../src/text.ts'

describe('lines, aligné sur str::lines() de Rust', () => {
  it('ne produit pas de ligne vide finale', () => {
    expect(lines('a\n')).toEqual(['a'])
  })
  it('conserve une ligne vide interne', () => {
    expect(lines('a\n\n')).toEqual(['a', ''])
  })
  it('rend un tableau vide sur une chaine vide', () => {
    expect(lines('')).toEqual([])
  })
  it('coupe le retour chariot de fin de ligne', () => {
    expect(lines('a\r\nb')).toEqual(['a', 'b'])
  })
  it('garde les lignes ordinaires', () => {
    expect(lines('a\nb')).toEqual(['a', 'b'])
  })
})

describe('words, aligné sur split_whitespace() de Rust', () => {
  it('rend un tableau vide sur du blanc pur', () => {
    expect(words('   ')).toEqual([])
  })
  it('effondre les suites de blancs', () => {
    expect(words('  cat   projects/knockport  ')).toEqual(['cat', 'projects/knockport'])
  })
})

describe('charCount, aligné sur chars().count() de Rust', () => {
  it('compte les points de code, pas les unites UTF-16', () => {
    expect(charCount('ab')).toBe(2)
    expect('🙂'.length).toBe(2)
    expect(charCount('🙂')).toBe(1)
  })
})
```

- [ ] **Step 4: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/text.test.ts`
Expected: FAIL, `Cannot find module '../src/text.ts'`.

- [ ] **Step 5: Implémenter**

`packages/core/src/text.ts` :

```ts
/**
 * Reproduit `str::lines()` de Rust: coupe sur \n, retire un \r final de
 * chaque ligne, et ne produit pas de ligne vide terminale. `"a\n".split('\n')`
 * rendrait `["a", ""]`, ce qui ajouterait une ligne blanche a chaque `cat`.
 */
export function lines(text: string): string[] {
  const out = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  if (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/**
 * Reproduit `split_whitespace()` de Rust. La garde sur la chaine vide est
 * indispensable: `''.split(/\s+/)` rend `['']` et non `[]`.
 */
export function words(input: string): string[] {
  const trimmed = input.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** Reproduit `chars().count()`: des points de code, pas des unites UTF-16. */
export function charCount(s: string): number {
  return [...s].length
}
```

- [ ] **Step 6: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/text.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Committer**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json pnpm-lock.yaml packages/core
git commit -m "feat(core): workspace pnpm et helpers de portage Rust vers TS"
```

---

### Task 2: Types de sortie et de session

**Files:**
- Create: `packages/core/src/output.ts`, `packages/core/src/session.ts`
- Test: `packages/core/test/output.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: les types `Style`, `Span`, `Line`, `Effect`, `Output`, `Event`, `ContactPayload`, `ContactStep`, `Mode`, `Session`. Les fabriques `plainLine`, `styledLine`, `blankLine`, `emptyOutput`, `textOutput`, `failureOutput`, `fromTexts`, `withEffect`. Les fonctions `newSession`, `prompt`. Utilisés par toutes les tâches suivantes.

- [ ] **Step 1: Écrire le test**

`packages/core/test/output.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { failureOutput, fromTexts, styledLine, textOutput } from '../src/output.ts'
import { newSession, prompt } from '../src/session.ts'

describe('fabriques de sortie', () => {
  it('textOutput rend une ligne plain, sans effet et non marquee en echec', () => {
    const out = textOutput('hello')
    expect(out.lines).toHaveLength(1)
    expect(out.lines[0]!.spans[0]!.text).toBe('hello')
    expect(out.lines[0]!.spans[0]!.style).toBe('plain')
    expect(out.effect).toBeUndefined()
    expect(out.failed).toBe(false)
  })

  it('failureOutput prefixe le nom du programme et marque la sortie', () => {
    const out = failureOutput('cd: nowhere: no such directory')
    expect(out.failed).toBe(true)
    expect(out.lines[0]!.spans[0]!.text).toBe('knockport: cd: nowhere: no such directory')
    expect(out.lines[0]!.spans[0]!.style).toBe('accent')
  })

  it('fromTexts rend une ligne par texte', () => {
    const out = fromTexts(['a', 'b', 'c'])
    expect(out.lines).toHaveLength(3)
    expect(out.lines[2]!.spans[0]!.text).toBe('c')
  })

  it('styledLine conserve son style', () => {
    expect(styledLine('dim', 'dim').spans[0]!.style).toBe('dim')
  })
})

describe('prompt', () => {
  it('rend la racine en mode normal', () => {
    expect(prompt(newSession())).toBe('~/$ ')
  })

  it('rend le chemin courant', () => {
    const s = newSession()
    s.cwd = ['projects']
    expect(prompt(s)).toBe('~/projects$ ')
  })

  it('change de question a chaque etape du contact', () => {
    const s = newSession()
    s.mode = { kind: 'contact', step: 'name', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your name> ')
    s.mode = { kind: 'contact', step: 'email', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your email> ')
    s.mode = { kind: 'contact', step: 'message', draft: { name: '', email: '' } }
    expect(prompt(s)).toBe('your message> ')
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/output.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Implémenter `output.ts`**

```ts
export type Style = 'plain' | 'dim' | 'bold' | 'accent'

export type Span = { text: string; style: Style }
export type Line = { spans: Span[] }

export type Effect =
  | { kind: 'clear' }
  | { kind: 'quit' }
  | { kind: 'openUrl'; url: string }
  | { kind: 'submitContact'; payload: ContactPayload }

/**
 * `failed` est porte explicitement et n'est jamais deduit du texte rendu.
 * Le journal a besoin de savoir si le visiteur s'est cogne, et renifler la
 * sortie pour le deviner casserait a la premiere reformulation d'un message.
 */
export type Output = { lines: Line[]; effect?: Effect; failed: boolean }

import type { ContactPayload } from './session.ts'

export function styledLine(text: string, style: Style): Line {
  return { spans: [{ text, style }] }
}

export function plainLine(text: string): Line {
  return styledLine(text, 'plain')
}

export function blankLine(): Line {
  return { spans: [] }
}

export function emptyOutput(): Output {
  return { lines: [], failed: false }
}

export function textOutput(text: string): Output {
  return { lines: [plainLine(text)], failed: false }
}

export function failureOutput(text: string): Output {
  return { lines: [styledLine(`knockport: ${text}`, 'accent')], failed: true }
}

export function fromTexts(texts: string[]): Output {
  return { lines: texts.map(plainLine), failed: false }
}

export function withEffect(out: Output, effect: Effect): Output {
  return { ...out, effect }
}
```

- [ ] **Step 4: Implémenter `session.ts`**

```ts
export type Event = { atMs: number; input: string; ok: boolean }

export type ContactPayload = {
  name: string
  email: string
  message: string
  journal: Event[]
  eggFound: boolean
}

export type ContactStep = 'name' | 'email' | 'message'
export type ContactDraft = { name: string; email: string }

export type Mode =
  | { kind: 'normal' }
  | { kind: 'contact'; step: ContactStep; draft: ContactDraft }

export type Session = {
  cwd: string[]
  mode: Mode
  history: string[]
  journal: Event[]
  eggFound: boolean
}

export function newSession(): Session {
  return { cwd: [], mode: { kind: 'normal' }, history: [], journal: [], eggFound: false }
}

export function prompt(s: Session): string {
  if (s.mode.kind === 'contact') {
    switch (s.mode.step) {
      case 'name': return 'your name> '
      case 'email': return 'your email> '
      case 'message': return 'your message> '
    }
  }
  return `~/${s.cwd.join('/')}$ `
}
```

- [ ] **Step 5: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/output.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Committer**

```bash
git add packages/core/src/output.ts packages/core/src/session.ts packages/core/test/output.test.ts
git commit -m "feat(core): types de sortie et de session en unions discriminees"
```

---

### Task 3: Génération du contenu à la compilation

**Files:**
- Create: `scripts/gen-content.mjs`
- Create: `packages/core/src/content.generated.ts` (produit par le script, puis commité)
- Create: `packages/core/src/content.ts`
- Test: `packages/core/test/content.test.ts`

**Interfaces:**
- Consumes: `lines` n'est pas requis ici.
- Produces: types `File`, `Dir`, `Content`. Fonctions `displayName(f: File): string`, `resolveDir(c: Content, path: string[]): Dir | undefined`, `resolveFile(c: Content, path: string[]): File | undefined`, et la constante `content: Content` exportée par `content.generated.ts`. Utilisés par les tâches 4, 5, 6, 8.

C'est le gain central du passage à TypeScript : `rust-embed` et `gray_matter` faisaient au démarrage un travail connu à la compilation. Ici le parsing a lieu une fois, dans ce script, et le runtime ne reçoit qu'un objet déjà bâti.

- [ ] **Step 1: Écrire le générateur**

`scripts/gen-content.mjs` :

```js
// Parcourt content/, parse le frontmatter, ecrit un module TypeScript.
// Le parseur de frontmatter est ecrit a la main: trois champs connus,
// aucune dependance, ni au build ni au runtime.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT_DIR = join(ROOT, 'content')
const OUT = join(ROOT, 'packages/core/src/content.generated.ts')

const MAX_ORDER = Number.MAX_SAFE_INTEGER

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else if (entry.endsWith('.md')) found.push(full)
  }
  return found
}

/** Trois champs, rien d'autre. Un frontmatter mal forme laisse tout le texte en corps. */
function parseFile(name, text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  const fallback = { name, title: name, order: MAX_ORDER, hidden: false, body: text.trim() }
  if (!match) return fallback

  const fm = { title: undefined, order: undefined, hidden: false }
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^(title|order|hidden)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const value = kv[2].trim().replace(/^["']|["']$/g, '')
    if (kv[1] === 'title') fm.title = value
    else if (kv[1] === 'order') {
      const n = Number.parseInt(value, 10)
      if (Number.isFinite(n) && n >= 0) fm.order = n
    } else fm.hidden = value === 'true'
  }

  return {
    name,
    title: fm.title ?? name,
    order: fm.order ?? MAX_ORDER,
    hidden: fm.hidden,
    body: text.slice(match[0].length).trim(),
  }
}

function insert(root, segments, file) {
  let cursor = root
  for (const segment of segments) {
    let next = cursor.dirs.find((d) => d.name === segment)
    if (!next) { next = { name: segment, dirs: [], files: [] }; cursor.dirs.push(next) }
    cursor = next
  }
  cursor.files.push(file)
}

/** Tri stable: par ordre croissant, puis par nom. Identique au `sort` du Rust. */
function sortDir(dir) {
  dir.files.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  dir.dirs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  dir.dirs.forEach(sortDir)
}

const root = { name: '', dirs: [], files: [] }
for (const path of walk(CONTENT_DIR)) {
  const rel = relative(CONTENT_DIR, path).split(/[\\/]/)
  const stem = rel.pop().replace(/\.md$/, '')
  insert(root, rel, parseFile(stem, readFileSync(path, 'utf8')))
}
sortDir(root)

writeFileSync(
  OUT,
  `// GENERE par scripts/gen-content.mjs. Ne pas editer a la main.\n` +
    `// Regenerer avec: pnpm gen:content\n` +
    `import type { Content } from './content.ts'\n\n` +
    `export const content: Content = ${JSON.stringify({ root }, null, 2)}\n`,
)
console.log(`content.generated.ts ecrit, ${walk(CONTENT_DIR).length} fichiers`)
```

- [ ] **Step 2: Écrire le test de résolution et d'intégrité**

`packages/core/test/content.test.ts` :

```ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { displayName, resolveDir, resolveFile } from '../src/content.ts'

describe('resolution du contenu', () => {
  it('lit un fichier racine avec son frontmatter', () => {
    const whoami = resolveFile(content, ['whoami'])
    expect(whoami?.title).toBe('whoami')
    expect(whoami?.hidden).toBe(false)
    expect(whoami?.body).toContain('Guillaume Flambard')
  })

  it('adresse le fichier cache avec un point initial', () => {
    const egg = resolveFile(content, ['.knock'])
    expect(egg?.hidden).toBe(true)
    expect(egg && displayName(egg)).toBe('.knock')
  })

  it('descend dans les sous-repertoires', () => {
    const dir = resolveDir(content, ['projects'])
    expect(dir?.files.some((f) => f.name === 'knockport')).toBe(true)
  })

  it('rend undefined sur un chemin inconnu', () => {
    expect(resolveDir(content, ['nowhere'])).toBeUndefined()
    expect(resolveFile(content, ['nope'])).toBeUndefined()
  })
})

describe('integrite du contenu livre', () => {
  it('chaque fichier a un titre et un corps', () => {
    const stack = [content.root]
    let seen = 0
    while (stack.length) {
      const dir = stack.pop()!
      for (const f of dir.files) {
        expect(f.title, `${f.name} n'a pas de titre`).not.toBe('')
        expect(f.body.trim(), `${f.name} n'a pas de corps`).not.toBe('')
        seen++
      }
      stack.push(...dir.dirs)
    }
    expect(seen).toBeGreaterThanOrEqual(4)
  })

  it('le fichier genere est a jour par rapport a content/', () => {
    const before = readFileSync('packages/core/src/content.generated.ts', 'utf8')
    execFileSync('node', ['scripts/gen-content.mjs'], { stdio: 'pipe' })
    const after = readFileSync('packages/core/src/content.generated.ts', 'utf8')
    expect(after, 'lance pnpm gen:content et commite le resultat').toBe(before)
  })
})
```

- [ ] **Step 3: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/content.test.ts`
Expected: FAIL, `content.ts` et `content.generated.ts` introuvables.

- [ ] **Step 4: Implémenter `content.ts`**

```ts
export type File = {
  name: string
  title: string
  order: number
  hidden: boolean
  body: string
}

export type Dir = { name: string; dirs: Dir[]; files: File[] }
export type Content = { root: Dir }

/** Un fichier cache s'adresse avec un point initial, comme dans un vrai shell. */
export function displayName(f: File): string {
  return f.hidden ? `.${f.name}` : f.name
}

export function resolveDir(c: Content, path: string[]): Dir | undefined {
  let cursor: Dir | undefined = c.root
  for (const segment of path) {
    cursor = cursor.dirs.find((d) => d.name === segment)
    if (!cursor) return undefined
  }
  return cursor
}

export function resolveFile(c: Content, path: string[]): File | undefined {
  if (path.length === 0) return undefined
  const name = path[path.length - 1]!
  const dir = resolveDir(c, path.slice(0, -1))
  return dir?.files.find((f) => displayName(f) === name)
}
```

- [ ] **Step 5: Générer le contenu**

Run: `pnpm gen:content`
Expected: `content.generated.ts ecrit, 4 fichiers`.

- [ ] **Step 6: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/content.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Committer**

```bash
git add scripts/gen-content.mjs packages/core/src/content.ts packages/core/src/content.generated.ts packages/core/test/content.test.ts package.json
git commit -m "feat(core): contenu genere a la compilation, plus aucun parsing au demarrage"
```

---

### Task 4: Commandes de système de fichiers

**Files:**
- Create: `packages/core/src/commands/fs.ts`
- Test: `packages/core/test/fs.test.ts`

**Interfaces:**
- Consumes: `lines` (tâche 1) ; `Output`, `Line`, `Style`, `failureOutput`, `textOutput`, `emptyOutput`, `plainLine`, `styledLine` (tâche 2) ; `Content`, `displayName`, `resolveDir`, `resolveFile` (tâche 3) ; `Session` (tâche 2).
- Produces: `resolvePath(s: Session, arg: string): string[]`, `pwd(s: Session): Output`, `ls(s: Session, c: Content, args: string[]): Output`, `cd(s: Session, c: Content, args: string[]): Output`, `cat(s: Session, c: Content, args: string[]): Output`. Utilisés par la tâche 8.

Nommée `resolvePath` et non `resolve`, pour ne pas entrer en collision de lecture avec `resolveDir` et `resolveFile`.

- [ ] **Step 1: Écrire le test**

`packages/core/test/fs.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { cat, cd, ls, pwd } from '../src/commands/fs.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('ls', () => {
  it('liste les repertoires puis les fichiers', () => {
    const rendered = flatten(ls(newSession(), content, []))
    expect(rendered).toContain('projects/')
    expect(rendered).toContain('whoami')
  })

  it('cache le fichier cache par defaut', () => {
    expect(flatten(ls(newSession(), content, []))).not.toContain('.knock')
  })

  it('revele le fichier cache avec -a', () => {
    expect(flatten(ls(newSession(), content, ['-a']))).toContain('.knock')
  })

  it('explique un repertoire inconnu', () => {
    const out = ls(newSession(), content, ['nowhere'])
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('no such directory')
  })
})

describe('cd et pwd', () => {
  it('se deplace puis rapporte', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    expect(s.cwd).toEqual(['projects'])
    expect(flatten(pwd(s))).toContain('~/projects')
  })

  it('remonte avec .. et s arrete a la racine', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, ['..'])
    expect(s.cwd).toEqual([])
    cd(s, content, ['..'])
    expect(s.cwd, 'la racine n a pas de parent').toEqual([])
  })

  it('sans argument, revient a la racine', () => {
    const s = newSession()
    cd(s, content, ['projects'])
    cd(s, content, [])
    expect(s.cwd).toEqual([])
  })

  it('refuse un repertoire inconnu sans bouger', () => {
    const s = newSession()
    const out = cd(s, content, ['nowhere'])
    expect(flatten(out)).toContain('no such directory')
    expect(s.cwd).toEqual([])
  })
})

describe('cat', () => {
  it('imprime le corps du fichier', () => {
    expect(flatten(cat(newSession(), content, ['whoami']))).toContain('Guillaume Flambard')
  })

  it('refuse un repertoire', () => {
    expect(flatten(cat(newSession(), content, ['projects']))).toContain('is a directory')
  })

  it('reclame un argument', () => {
    expect(flatten(cat(newSession(), content, []))).toContain('which file')
  })

  it('lire le fichier cache marque la session', () => {
    const s = newSession()
    expect(s.eggFound).toBe(false)
    cat(s, content, ['.knock'])
    expect(s.eggFound).toBe(true)
  })

  it('un fichier ordinaire ne marque pas la session', () => {
    const s = newSession()
    cat(s, content, ['whoami'])
    expect(s.eggFound).toBe(false)
  })

  it('n ajoute pas de ligne vide finale', () => {
    const out = cat(newSession(), content, ['knock'])
    expect(out.lines.at(-1)!.spans[0]!.text).not.toBe('')
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/fs.test.ts`
Expected: FAIL, `../src/commands/fs.ts` introuvable.

- [ ] **Step 3: Implémenter**

`packages/core/src/commands/fs.ts` :

```ts
import type { Content } from '../content.ts'
import { displayName, resolveDir, resolveFile } from '../content.ts'
import type { Line, Output } from '../output.ts'
import { emptyOutput, failureOutput, plainLine, styledLine, textOutput } from '../output.ts'
import type { Session } from '../session.ts'
import { lines } from '../text.ts'

/**
 * `trim_start_matches('/')` en Rust retire TOUTES les barres initiales,
 * pas une seule, d'ou le quantificateur `+`.
 */
export function resolvePath(s: Session, arg: string): string[] {
  const path = arg.startsWith('/') ? [] : [...s.cwd]
  for (const segment of arg.replace(/^\/+/, '').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') path.pop()
    else path.push(segment)
  }
  return path
}

export function pwd(s: Session): Output {
  return textOutput(`~/${s.cwd.join('/')}`)
}

export function ls(s: Session, c: Content, args: string[]): Output {
  const showAll = args.includes('-a')
  const named = args.find((a) => !a.startsWith('-'))
  const target = named === undefined ? [...s.cwd] : resolvePath(s, named)

  const dir = resolveDir(c, target)
  if (!dir) return failureOutput(`ls: ${target.join('/')}: no such directory`)

  const out: Line[] = dir.dirs.map((d) => styledLine(`${d.name}/`, 'accent'))

  for (const file of dir.files) {
    if (file.hidden && !showAll) continue
    out.push({
      spans: [
        { text: displayName(file), style: 'plain' },
        { text: `   ${file.title}`, style: 'dim' },
      ],
    })
  }

  if (out.length === 0) return textOutput('(empty)')
  return { lines: out, failed: false }
}

export function cd(s: Session, c: Content, args: string[]): Output {
  const arg = args[0]
  if (arg === undefined) {
    s.cwd = []
    return emptyOutput()
  }
  const target = resolvePath(s, arg)
  if (!resolveDir(c, target)) return failureOutput(`cd: ${arg}: no such directory`)
  s.cwd = target
  return emptyOutput()
}

export function cat(s: Session, c: Content, args: string[]): Output {
  const arg = args[0]
  if (arg === undefined) return failureOutput('cat: which file? try ls')

  const path = resolvePath(s, arg)
  if (resolveDir(c, path)) return failureOutput(`cat: ${arg}: is a directory`)

  const file = resolveFile(c, path)
  if (!file) return failureOutput(`cat: ${arg}: no such file`)

  if (file.hidden) s.eggFound = true

  return { lines: lines(file.body).map(plainLine), failed: false }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/fs.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Committer**

```bash
git add packages/core/src/commands/fs.ts packages/core/test/fs.test.ts
git commit -m "feat(core): ls, cd, pwd et cat sur le systeme de fichiers virtuel"
```

---

### Task 5: Commandes d'information

**Files:**
- Create: `packages/core/src/commands/info.ts`
- Test: `packages/core/test/info.test.ts`

**Interfaces:**
- Consumes: `lines` (tâche 1) ; `Output`, `Line`, `blankLine`, `plainLine`, `styledLine`, `failureOutput` (tâche 2) ; `Content`, `resolveFile` (tâche 3) ; `Session` (tâche 2).
- Produces: `help(): Output`, `history(s: Session): Output`, `show(c: Content, name: string): Output`. Utilisés par la tâche 8.

L'alignement de `help` est repris au caractère près du Rust (`{name:<9}` puis la description), parce qu'il est figé par le snapshot de la tâche 9.

- [ ] **Step 1: Écrire le test**

`packages/core/test/info.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { content } from '../src/content.generated.ts'
import { help, history, show } from '../src/commands/info.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('help', () => {
  it('liste toutes les commandes principales', () => {
    const rendered = flatten(help())
    for (const name of ['ls', 'cd', 'pwd', 'cat', 'whoami', 'stack', 'cv', 'contact', 'book', 'exit']) {
      expect(rendered, `help ne mentionne pas ${name}`).toContain(name)
    }
  })

  it('ne mentionne jamais le fichier cache', () => {
    expect(flatten(help())).not.toContain('knock')
  })

  it('aligne les noms sur neuf caracteres', () => {
    expect(help().lines[2]!.spans[0]!.text).toBe('  ls       ')
  })
})

describe('history', () => {
  it('numerote les lignes, alignees a droite sur trois caracteres', () => {
    const s = newSession()
    s.history.push('ls', 'whoami')
    const rendered = flatten(history(s))
    expect(rendered).toContain('  1  ls')
    expect(rendered).toContain('  2  whoami')
  })

  it('rend une sortie vide sur une session neuve', () => {
    expect(history(newSession()).lines).toHaveLength(0)
  })
})

describe('show', () => {
  it('imprime le corps du fichier demande', () => {
    expect(flatten(show(content, 'whoami'))).toContain('Guillaume Flambard')
  })

  it('explique un contenu manquant', () => {
    const out = show(content, 'absent')
    expect(out.failed).toBe(true)
    expect(flatten(out)).toContain('content is missing')
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/info.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter**

`packages/core/src/commands/info.ts` :

```ts
import type { Content } from '../content.ts'
import { resolveFile } from '../content.ts'
import type { Line, Output } from '../output.ts'
import { blankLine, failureOutput, plainLine, styledLine } from '../output.ts'
import type { Session } from '../session.ts'
import { lines } from '../text.ts'

const COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['ls', 'list what is here, -a shows everything'],
  ['cd', 'move around, .. goes up'],
  ['pwd', 'where you are right now'],
  ['cat', 'read a file'],
  ['whoami', 'the short version'],
  ['stack', 'what I build with'],
  ['cv', 'the PDF, for your ATS'],
  ['contact', 'leave me a message right here'],
  ['book', 'put something in the calendar'],
  ['history', 'what you have typed'],
  ['clear', 'wipe the screen'],
  ['exit', 'close the session'],
]

export function help(): Output {
  const out: Line[] = [styledLine('commands', 'bold'), blankLine()]
  for (const [name, description] of COMMANDS) {
    out.push({
      spans: [
        // `format!("  {name:<9}")` du Rust: deux espaces puis le nom cale a gauche sur 9.
        { text: `  ${name.padEnd(9)}`, style: 'accent' },
        { text: description, style: 'dim' },
      ],
    })
  }
  return { lines: out, failed: false }
}

export function history(s: Session): Output {
  return {
    // `format!("{:>3}  {entry}")`: le numero cale a droite sur 3, puis deux espaces.
    lines: s.history.map((entry, i) => plainLine(`${String(i + 1).padStart(3)}  ${entry}`)),
    failed: false,
  }
}

export function show(c: Content, name: string): Output {
  const file = resolveFile(c, [name])
  if (!file) return failureOutput(`${name}: content is missing`)
  return { lines: lines(file.body).map(plainLine), failed: false }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/info.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Committer**

```bash
git add packages/core/src/commands/info.ts packages/core/test/info.test.ts
git commit -m "feat(core): help, history et les fiches whoami et stack"
```

---

### Task 6: Le parcours de contact

**Files:**
- Create: `packages/core/src/commands/contact.ts`
- Test: `packages/core/test/contact.test.ts`

**Interfaces:**
- Consumes: `charCount` (tâche 1) ; `Output`, `Effect`, `plainLine`, `blankLine`, `styledLine`, `textOutput`, `emptyOutput` (tâche 2) ; `Session`, `ContactPayload`, `ContactDraft` (tâche 2).
- Produces: `CV_URL`, `BOOK_URL` (constantes), `validEmail(v: string): boolean`, `validMessage(v: string): boolean`, `startContact(s: Session): Output`, `contactStep(s: Session, input: string): Output`. Utilisés par la tâche 8.

`CV_URL` et `BOOK_URL` restent des **marqueurs**, pas des URL. Le core ne connaît pas les URL : la façade les traduit (le web vers `/cv.pdf` et `/book`, le SSH les imprime en clair). Garder les marqueurs identiques au Rust évite de casser les façades.

- [ ] **Step 1: Écrire le test**

`packages/core/test/contact.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  contactStep, startContact, validEmail, validMessage,
} from '../src/commands/contact.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('validEmail', () => {
  it('accepte une adresse ordinaire', () => {
    expect(validEmail('a@b.co')).toBe(true)
    expect(validEmail('guillaume.flambard+jobs@example.com')).toBe(true)
  })

  it('rejette les cas evidents', () => {
    expect(validEmail('nope')).toBe(false)
    expect(validEmail('a@b')).toBe(false)
    expect(validEmail('a b@c.co')).toBe(false)
    expect(validEmail('')).toBe(false)
    expect(validEmail(`${'x'.repeat(300)}@example.com`)).toBe(false)
    expect(validEmail('a@.b.co')).toBe(false)
    expect(validEmail('a@b.co.')).toBe(false)
  })
})

describe('validMessage', () => {
  it('applique les deux bornes', () => {
    expect(validMessage('too short')).toBe(false)
    expect(validMessage('this one is long enough to say something')).toBe(true)
    expect(validMessage('x'.repeat(4001))).toBe(false)
  })

  it('compte des points de code, pas des unites UTF-16', () => {
    // 6 emoji: 6 points de code en Rust, 12 unites UTF-16 en JS.
    expect(validMessage('🙂'.repeat(6))).toBe(false)
  })
})

describe('machine a etats', () => {
  it('start entre en mode contact a l etape du nom', () => {
    const s = newSession()
    startContact(s)
    expect(s.mode).toEqual({ kind: 'contact', step: 'name', draft: { name: '', email: '' } })
  })

  it('un parcours complet emet la charge et revient en mode normal', () => {
    const s = newSession()
    s.eggFound = true
    s.journal.push({ atMs: 5, input: 'ls', ok: true })

    startContact(s)
    contactStep(s, 'Seema')
    contactStep(s, 'seema@example.com')
    const out = contactStep(s, 'we have a role that fits, are you free thursday')

    expect(out.effect?.kind).toBe('submitContact')
    if (out.effect?.kind !== 'submitContact') throw new Error('charge attendue')
    expect(out.effect.payload.name).toBe('Seema')
    expect(out.effect.payload.email).toBe('seema@example.com')
    expect(out.effect.payload.eggFound).toBe(true)
    expect(out.effect.payload.journal).toHaveLength(1)
    expect(s.mode.kind).toBe('normal')
  })

  it('un mail invalide redemande sans avancer', () => {
    const s = newSession()
    startContact(s)
    contactStep(s, 'Seema')
    const out = contactStep(s, 'nope')
    expect(flatten(out)).toContain('does not look like an email')
    expect(s.mode).toMatchObject({ kind: 'contact', step: 'email' })
  })

  it('un nom vide redemande', () => {
    const s = newSession()
    startContact(s)
    const out = contactStep(s, '   ')
    expect(flatten(out)).toContain('A name')
    expect(s.mode).toMatchObject({ kind: 'contact', step: 'name' })
  })

  it('cancel sort du mode contact sans rien envoyer', () => {
    const s = newSession()
    startContact(s)
    const out = contactStep(s, 'cancel')
    expect(out.effect).toBeUndefined()
    expect(s.mode.kind).toBe('normal')
  })

  it('cancel est insensible a la casse', () => {
    const s = newSession()
    startContact(s)
    contactStep(s, 'CANCEL')
    expect(s.mode.kind).toBe('normal')
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/contact.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter**

`packages/core/src/commands/contact.ts` :

```ts
import type { Output } from '../output.ts'
import { blankLine, emptyOutput, plainLine, styledLine, textOutput } from '../output.ts'
import type { Session } from '../session.ts'
import { charCount } from '../text.ts'

// Des marqueurs, pas des URL. Le core ne connait pas les URL: la facade
// traduit (le web vers /cv.pdf et /book, le SSH les imprime en clair).
export const CV_URL = '{{cv_url}}'
export const BOOK_URL = '{{book_url}}'

export function validEmail(value: string): boolean {
  const v = value.trim()
  if (v === '' || v.length > 254 || /\s/.test(v)) return false
  const at = v.indexOf('@')
  if (at <= 0) return false
  const domain = v.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

export function validMessage(value: string): boolean {
  // `chars().count()` en Rust: des points de code. `.length` compterait
  // un emoji pour deux et laisserait passer un message trop court.
  const len = charCount(value.trim())
  return len >= 10 && len <= 4000
}

export function startContact(s: Session): Output {
  s.mode = { kind: 'contact', step: 'name', draft: { name: '', email: '' } }
  return {
    lines: [plainLine('Three questions. Type cancel at any point to drop out.'), blankLine()],
    failed: false,
  }
}

export function contactStep(s: Session, input: string): Output {
  const value = input.trim()

  if (value.toLowerCase() === 'cancel') {
    s.mode = { kind: 'normal' }
    return textOutput('Dropped. Nothing was sent.')
  }

  if (s.mode.kind !== 'contact') return emptyOutput()
  const { step, draft } = s.mode

  switch (step) {
    case 'name':
      if (value === '') return retry('A name, even a first one.')
      s.mode = { kind: 'contact', step: 'email', draft: { ...draft, name: value } }
      return emptyOutput()

    case 'email':
      if (!validEmail(value)) return retry('That does not look like an email address.')
      s.mode = { kind: 'contact', step: 'message', draft: { ...draft, email: value } }
      return emptyOutput()

    case 'message': {
      if (!validMessage(value)) return retry('Between 10 and 4000 characters, please.')
      s.mode = { kind: 'normal' }
      return {
        lines: [plainLine('Sent. I read everything, and I answer.')],
        effect: {
          kind: 'submitContact',
          payload: {
            name: draft.name,
            email: draft.email,
            message: value,
            journal: [...s.journal],
            eggFound: s.eggFound,
          },
        },
        failed: false,
      }
    }
  }
}

function retry(message: string): Output {
  return { lines: [styledLine(message, 'accent')], failed: true }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/contact.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Committer**

```bash
git add packages/core/src/commands/contact.ts packages/core/test/contact.test.ts
git commit -m "feat(core): parcours de contact en trois etapes, cv et book"
```

---

### Task 7: Complétion par Tab

**Files:**
- Create: `packages/core/src/complete.ts`
- Test: `packages/core/test/complete.test.ts`

**Interfaces:**
- Consumes: `Content`, `resolveDir` (tâche 3) ; `Session` (tâche 2).
- Produces: `complete(s: Session, c: Content, partial: string): string[]`. Réexporté par la tâche 8.

Le fichier caché n'est **jamais** complété : l'énigme se trouve à la main, sinon elle n'est plus une énigme.

- [ ] **Step 1: Écrire le test**

`packages/core/test/complete.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { complete } from '../src/complete.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'

describe('complete', () => {
  it('complete un nom de commande', () => {
    expect(complete(newSession(), content, 'wh')).toEqual(['whoami'])
  })

  it('complete un argument de chemin', () => {
    expect(complete(newSession(), content, 'cd pro')).toContain('cd projects')
  })

  it('ne complete jamais le fichier cache', () => {
    expect(complete(newSession(), content, 'cat .kn')).toEqual([])
  })

  it('ne rend rien sans correspondance', () => {
    expect(complete(newSession(), content, 'xyz')).toEqual([])
  })

  it('ne rend rien sur un prefixe d argument vide', () => {
    expect(complete(newSession(), content, 'cd ')).toEqual([])
  })

  it('rend les resultats tries', () => {
    const found = complete(newSession(), content, 'cat ')
    expect(found).toEqual([...found].sort())
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/complete.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter**

`packages/core/src/complete.ts` :

```ts
import type { Content } from './content.ts'
import { resolveDir } from './content.ts'
import type { Session } from './session.ts'

const NAMES = [
  'ls', 'cd', 'cat', 'pwd', 'whoami', 'stack', 'cv',
  'contact', 'book', 'history', 'help', 'clear', 'exit',
] as const

export function complete(s: Session, c: Content, partial: string): string[] {
  const space = partial.indexOf(' ')

  if (space === -1) return NAMES.filter((n) => n.startsWith(partial))

  const command = partial.slice(0, space)
  const prefix = partial.slice(space + 1).replace(/^\s+/, '')
  if (prefix === '') return []

  const dir = resolveDir(c, s.cwd)
  if (!dir) return []

  return [
    ...dir.dirs.map((d) => d.name),
    // Le fichier cache est exclu: l'enigme se trouve a la main.
    ...dir.files.filter((f) => !f.hidden).map((f) => f.name),
  ]
    .filter((name) => name.startsWith(prefix))
    .map((name) => `${command} ${name}`)
    .sort()
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/complete.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Committer**

```bash
git add packages/core/src/complete.ts packages/core/test/complete.test.ts
git commit -m "feat(core): completion par Tab sur les commandes et les chemins"
```

---

### Task 8: Parseur, aiguillage et point d'entrée public

**Files:**
- Create: `packages/core/src/command.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/command.test.ts`

**Interfaces:**
- Consumes: tout ce que produisent les tâches 1 à 7.
- Produces: `parse(input: string): Cmd | undefined`, `execute(s: Session, c: Content, input: string, atMs: number): Output`, et l'ensemble des réexports de `index.ts`. C'est la surface publique que consommeront les façades web et SSH.

- [ ] **Step 1: Écrire le test**

`packages/core/test/command.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { execute, parse } from '../src/command.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'
import type { Output } from '../src/output.ts'

const flatten = (out: Output): string =>
  out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

describe('parse', () => {
  it('lit une commande nue', () => {
    expect(parse('ls')).toEqual({ name: 'ls', args: [] })
  })

  it('lit les arguments et effondre les blancs', () => {
    expect(parse('  cat   projects/knockport  ')).toEqual({
      name: 'cat', args: ['projects/knockport'],
    })
  })

  it('une entree vide n est pas une commande', () => {
    expect(parse('   ')).toBeUndefined()
  })
})

describe('execute', () => {
  it('enregistre l entree dans le journal', () => {
    const s = newSession()
    execute(s, content, 'whoami', 1500)
    expect(s.journal).toHaveLength(1)
    expect(s.journal[0]).toEqual({ atMs: 1500, input: 'whoami', ok: true })
  })

  it('une entree vide ne produit rien et n est pas journalisee', () => {
    const s = newSession()
    const out = execute(s, content, '', 10)
    expect(out.lines).toHaveLength(0)
    expect(s.journal).toHaveLength(0)
    expect(s.history).toHaveLength(0)
  })

  it('une commande inconnue suggere help et est marquee en echec', () => {
    const s = newSession()
    const out = execute(s, content, 'sudo rm -rf /', 20)
    expect(flatten(out)).toContain('help')
    expect(s.journal[0]!.ok).toBe(false)
  })

  it('clear et exit portent leur effet', () => {
    const s = newSession()
    expect(execute(s, content, 'clear', 1).effect).toEqual({ kind: 'clear' })
    expect(execute(s, content, 'exit', 2).effect).toEqual({ kind: 'quit' })
    expect(execute(s, content, 'logout', 3).effect).toEqual({ kind: 'quit' })
  })

  it('cv et book ouvrent un marqueur d URL', () => {
    const s = newSession()
    expect(execute(s, content, 'cv', 1).effect).toEqual({ kind: 'openUrl', url: '{{cv_url}}' })
    expect(execute(s, content, 'book', 2).effect).toEqual({ kind: 'openUrl', url: '{{book_url}}' })
  })

  it('en mode contact, le journal masque la saisie du visiteur', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.journal.at(-1)).toEqual({ atMs: 2, input: '<contact>', ok: true })
  })

  it('en mode contact, la saisie n entre pas dans l historique', () => {
    const s = newSession()
    execute(s, content, 'contact', 1)
    execute(s, content, 'Seema', 2)
    expect(s.history).toEqual(['contact'])
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `pnpm vitest run packages/core/test/command.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter `command.ts`**

```ts
import { cat, cd, ls, pwd } from './commands/fs.ts'
import { help, history, show } from './commands/info.ts'
import { BOOK_URL, CV_URL, contactStep, startContact } from './commands/contact.ts'
import type { Content } from './content.ts'
import type { Output } from './output.ts'
import { emptyOutput, failureOutput, styledLine, textOutput, withEffect } from './output.ts'
import type { Session } from './session.ts'
import { words } from './text.ts'

export type Cmd = { name: string; args: string[] }

export function parse(input: string): Cmd | undefined {
  const [name, ...args] = words(input)
  return name === undefined ? undefined : { name, args }
}

export function execute(s: Session, c: Content, input: string, atMs: number): Output {
  if (s.mode.kind === 'contact') {
    const out = contactStep(s, input)
    // La saisie du visiteur ne va jamais dans le journal en clair: elle
    // contient son nom, son mail et son message, deja portes par la charge.
    s.journal.push({ atMs, input: '<contact>', ok: true })
    return out
  }

  const cmd = parse(input)
  if (!cmd) return emptyOutput()

  s.history.push(input.trim())
  const out = dispatch(s, c, cmd)
  s.journal.push({ atMs, input: input.trim(), ok: !out.failed })
  return out
}

function dispatch(s: Session, c: Content, cmd: Cmd): Output {
  switch (cmd.name) {
    case 'ls': return ls(s, c, cmd.args)
    case 'cd': return cd(s, c, cmd.args)
    case 'pwd': return pwd(s)
    case 'cat': return cat(s, c, cmd.args)
    case 'whoami': return show(c, 'whoami')
    case 'stack': return show(c, 'stack')
    case 'help': return help()
    case 'history': return history(s)
    case 'clear': return withEffect(emptyOutput(), { kind: 'clear' })
    case 'exit':
    case 'quit':
    case 'logout': return withEffect(emptyOutput(), { kind: 'quit' })
    case 'contact':
    case 'hire': return startContact(s)
    case 'cv': return withEffect(textOutput('Opening the CV.'), { kind: 'openUrl', url: CV_URL })
    case 'book': return withEffect(textOutput('Opening the calendar.'), { kind: 'openUrl', url: BOOK_URL })
    default: return unknown(cmd.name)
  }
}

function unknown(name: string): Output {
  const out = failureOutput(`${name}: no such command`)
  out.lines.push(styledLine('try help', 'dim'))
  return out
}
```

- [ ] **Step 4: Implémenter `index.ts`**

```ts
export { parse, execute } from './command.ts'
export type { Cmd } from './command.ts'
export { complete } from './complete.ts'
export { content } from './content.generated.ts'
export { displayName, resolveDir, resolveFile } from './content.ts'
export type { Content, Dir, File } from './content.ts'
export {
  blankLine, emptyOutput, failureOutput, fromTexts, plainLine, styledLine, textOutput, withEffect,
} from './output.ts'
export type { Effect, Line, Output, Span, Style } from './output.ts'
export { newSession, prompt } from './session.ts'
export type {
  ContactDraft, ContactPayload, ContactStep, Event, Mode, Session,
} from './session.ts'
export { BOOK_URL, CV_URL, validEmail, validMessage } from './commands/contact.ts'
export { lines } from './text.ts'
```

- [ ] **Step 5: Lancer le test pour le voir passer**

Run: `pnpm vitest run packages/core/test/command.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Committer**

```bash
git add packages/core/src/command.ts packages/core/src/index.ts packages/core/test/command.test.ts
git commit -m "feat(core): parseur, aiguillage et surface publique du paquet"
```

---

### Task 9: Parité prouvée par les snapshots Rust

**Files:**
- Create: `packages/core/test/snapshot.test.ts`
- Create: `packages/core/test/__snapshots__/snapshot.test.ts.snap`
- Modify: `content/projects/knockport.md`

**Interfaces:**
- Consumes: `execute`, `newSession`, `content` (tâche 8).
- Produces: rien de nouveau. C'est la porte de sortie du plan.

C'est le garde-fou de toute la migration. Les 3 fichiers `crates/core/tests/snapshots/*.snap` sont l'**oracle** : le port n'est validé que si la sortie TypeScript leur est identique au caractère près. Le fichier `.snap` est écrit **à la main** depuis les valeurs Rust, jamais généré par `--update`, sinon il enregistre le bug au lieu de l'attraper.

- [ ] **Step 1: Écrire le test de snapshot**

`packages/core/test/snapshot.test.ts` :

```ts
import { expect, it } from 'vitest'
import { execute } from '../src/command.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'

/** Reproduit exactement le helper `render` de crates/core/tests/snapshots.rs. */
function render(input: string): string {
  const out = execute(newSession(), content, input, 0)
  return out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')
}

it('snapshot help', () => { expect(render('help')).toMatchSnapshot() })
it('snapshot ls root', () => { expect(render('ls')).toMatchSnapshot() })
it('snapshot unknown command', () => { expect(render('deploy to prod')).toMatchSnapshot() })
```

- [ ] **Step 2: Écrire le fichier de snapshot à la main, depuis l'oracle Rust**

`packages/core/test/__snapshots__/snapshot.test.ts.snap`. Le contenu ci-dessous est recopié
de `crates/core/tests/snapshots/*.snap`. Attention aux espaces, ils sont significatifs :
`ls` aligne le nom puis trois espaces puis le titre, `help` cale le nom sur neuf caractères.

```
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`snapshot help 1`] = `
"commands

  ls       list what is here, -a shows everything
  cd       move around, .. goes up
  pwd      where you are right now
  cat      read a file
  whoami   the short version
  stack    what I build with
  cv       the PDF, for your ATS
  contact  leave me a message right here
  book     put something in the calendar
  history  what you have typed
  clear    wipe the screen
  exit     close the session"
`;

exports[`snapshot ls root 1`] = `
"projects/
whoami   whoami
stack   stack"
`;

exports[`snapshot unknown command 1`] = `
"knockport: deploy: no such command
try help"
`;
```

- [ ] **Step 3: Lancer les snapshots**

Run: `pnpm vitest run packages/core/test/snapshot.test.ts`
Expected: PASS, 3 tests.

En cas d'échec, **ne pas lancer `--update`**. L'écart signale une divergence de portage :
comparer le diff caractère par caractère et corriger le code, pas le snapshot.

- [ ] **Step 4: Lancer la suite entière et le typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS sur 62 tests, aucune erreur de type.

- [ ] **Step 5: Corriger le contenu qui ment**

`content/projects/knockport.md` décrit encore l'ancienne architecture. Remplacer la ligne :

```
A Rust core with no I/O, painted by an SSH server and a WebAssembly frontend.
```

par :

```
A TypeScript core with no I/O, painted by an SSH server and a browser.
```

Puis régénérer et vérifier :

Run: `pnpm gen:content && pnpm test`
Expected: PASS. Aucun snapshot ne change, ce fichier n'apparaît dans aucun des trois.

- [ ] **Step 6: Committer**

```bash
git add packages/core/test/snapshot.test.ts packages/core/test/__snapshots__ content/projects/knockport.md packages/core/src/content.generated.ts
git commit -m "test(core): parite prouvee par les trois snapshots Rust"
```

- [ ] **Step 7: Poser le repère de retour en arrière**

Le Rust reste intact et compilable. Le tag marque l'état d'où repartir si le port déraille.

```bash
git tag v0-rust 7100329
git tag -l v0-rust
```

---

## Auto-relecture

**Couverture de la spec.** Section 6 (types, contrat, contenu généré) : tâches 2, 3, 8. Les six pièges de portage : tâche 1, plus les rappels ciblés dans les tâches 4, 5, 6. Section 10, volet core et snapshots et intégrité du contenu : tâches 3 et 9. L'étape 1 de la section 12 (`git tag v0-rust`) : tâche 9, étape 7.

**Hors périmètre, couvert par les plans suivants :** `packages/web` et le design system (plan 2), Hono et le contact HTTP (plan 3), `ssh2`, `ansi.ts` et `editor.ts` (plan 4), déploiement et suppression de `crates/` (plan 5).

**Cohérence des noms, vérifiée d'un bout à l'autre :** `resolvePath` (et non `resolve`, pour ne pas se confondre avec `resolveDir` et `resolveFile`), `startContact` et `contactStep` (et non `start` et `step`, trop génériques une fois exportés), `newSession`, `displayName`, `charCount`. Les champs sont en camelCase partout (`atMs`, `eggFound`), y compris dans `content.generated.ts`.

**Un écart assumé :** `eq_ignore_ascii_case("cancel")` devient `.toLowerCase() === 'cancel'`. La divergence ne porte que sur des caractères non-ASCII qui se replient sur `cancel`, ce qu'aucune saisie réaliste ne produit.
