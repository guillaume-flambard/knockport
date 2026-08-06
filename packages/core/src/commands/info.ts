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
