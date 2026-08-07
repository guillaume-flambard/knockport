import type { Content, File } from '../content.ts'
import { shortcuts } from '../content.ts'
import type { Line, Output } from '../output.ts'
import { blankLine, plainLine, styledLine } from '../output.ts'
import type { Session } from '../session.ts'
import { lines } from '../text.ts'

// Neutral voice, intentionally. A journey can be someone's or a company's.
// "What I build with" or "leave me a message" ring false when spoken by a company.

/** Moving around. Same in every journey. */
const NAVIGATION: ReadonlyArray<readonly [string, string]> = [
  ['ls', 'list what is here, -a shows everything'],
  ['cd', 'move around, .. goes up'],
  ['pwd', 'where you are right now'],
  ['cat', 'read a file'],
]

/** Reaching out and running the session. Same in every journey. */
const SESSION: ReadonlyArray<readonly [string, string]> = [
  ['cv', 'the PDF version'],
  ['contact', 'leave a message right here'],
  ['book', 'put something in the calendar'],
  ['history', 'what you have typed'],
  ['clear', 'wipe the screen'],
  ['exit', 'close the session'],
]

/**
 * The journey's own sections sit between the two fixed blocks, right where a
 * reader looks first. They used to be hardcoded as `whoami` and `stack`,
 * which were the root files of the one journey that existed at the time.
 */
export function help(c: Content): Output {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ...NAVIGATION,
    ...shortcuts(c).map((f) => [f.name, f.title] as const),
    ...SESSION,
  ]

  // Rust padded to a fixed 9, which was enough for its own command names.
  // A journey names its own sections, so the column has to be measured.
  const width = Math.max(9, ...rows.map(([name]) => name.length + 2))

  const out: Line[] = [styledLine('commands', 'bold'), blankLine()]
  for (const [name, description] of rows) {
    out.push({
      spans: [
        { text: `  ${name.padEnd(width)}`, style: 'accent' },
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

export function show(file: File): Output {
  return { lines: lines(file.body).map(plainLine), failed: false }
}
