import { cat, cd, ls, pwd } from './commands/fs.ts'
import { help, history, show } from './commands/info.ts'
import { contactStep, startContact } from './commands/contact.ts'
import type { Content } from './content.ts'
import { shortcuts } from './content.ts'
import type { Output } from './output.ts'
import { emptyOutput, failureOutput, styledLine, withEffect } from './output.ts'
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
    // Visitor input never goes into the journal in plain text: it carries
    // the name, email, and message that are already included in the payload.
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
    case 'cat': return maybeSuggestContact(s, c, cat(s, c, cmd.args))
    case 'help': return help(c)
    case 'history': return history(s)
    case 'clear': return withEffect(emptyOutput(), { kind: 'clear' })
    case 'exit':
    case 'quit':
    case 'logout': return withEffect(emptyOutput(), { kind: 'quit' })
    case 'contact':
    case 'hire': return startContact(s)
    default: {
      // A root file name is a command of its own. Builtins are matched first,
      // so a section called `ls` cannot shadow the real one.
      const file = shortcuts(c).find((f) => f.name === cmd.name)
      if (file) {
        if (!s.readFiles.includes(file.name)) s.readFiles.push(file.name)
        const out = show(file)
        return maybeSuggestContact(s, c, out)
      }
      return unknown(s, c, cmd.name)
    }
  }
}

/** When the visitor has read every root file, the journey is over in the only
 *  sense that matters: nothing is hidden from them. That is the moment to say
 *  the door for `contact` is open. Once said, never said again. */
function maybeSuggestContact(s: Session, c: Content, out: Output): Output {
  if (s.contactSuggested) return out
  const all = shortcuts(c)
  const seen = s.readFiles.length >= all.length && all.every((f) => s.readFiles.includes(f.name))
  if (!seen) return out
  s.contactSuggested = true
  out.lines.push({ spans: [] })
  out.lines.push({
    spans: [{ text: 'you have seen everything. type contact to leave a message', style: 'dim' }],
  })
  return out
}

function unknown(s: Session, c: Content, name: string): Output {
  const out = failureOutput(`${name}: no such command`)

  // Did you mean: a typo in a command name is the most recoverable mistake in
  // a shell, and the cheapest to fix. Suggest the closest command or file
  // name within one edit, mirroring clig.dev's "suggest what to do on error".
  const names = [
    'ls',
    'cd',
    'pwd',
    'cat',
    'help',
    'history',
    'clear',
    'exit',
    'quit',
    'logout',
    'contact',
    'hire',
    ...shortcuts(c).map((f) => f.name),
  ]
  const guess = closest(name, names)
  if (guess) out.lines.push(styledLine(`did you mean ${guess}?`, 'dim'))
  out.lines.push(styledLine('try help', 'dim'))
  return out
}

/** Smallest Levenshtein distance, within one edit (clig.dev tolerates two for
 *  long words; commands here are short, so one edit keeps it honest). */
function closest(typed: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestDistance = 2
  for (const candidate of candidates) {
    const d = editDistance(typed, candidate)
    if (d < bestDistance) {
      bestDistance = d
      best = candidate
    }
  }
  return best
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!
  }
  return prev[b.length]!
}
