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
  // Neutral voice, intentionally. A journey can be someone's or a company's.
  // "What I build with" or "leave me a message" ring false when spoken by a company.
  ['whoami', 'the short version'],
  ['stack', 'what it is built with'],
  ['cv', 'the PDF version'],
  ['contact', 'leave a message right here'],
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
        // Rust's `format!("  {name:<9}")`: two spaces then the name left-aligned to 9.
        { text: `  ${name.padEnd(9)}`, style: 'accent' },
        { text: description, style: 'dim' },
      ],
    })
  }
  return { lines: out, failed: false }
}

export function history(s: Session): Output {
  return {
    // Rust's `format!("{:>3}  {entry}")`: number right-aligned to 3, then two spaces.
    lines: s.history.map((entry, i) => plainLine(`${String(i + 1).padStart(3)}  ${entry}`)),
    failed: false,
  }
}

export function show(c: Content, name: string): Output {
  const file = resolveFile(c, [name])
  if (!file) return failureOutput(`${name}: content is missing`)
  return { lines: lines(file.body).map(plainLine), failed: false }
}
