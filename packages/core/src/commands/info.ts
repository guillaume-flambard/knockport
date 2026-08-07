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
  ['contact', 'leave a message right here'],
  ['history', 'what you have typed'],
  ['clear', 'wipe the screen'],
  ['exit', 'close the session'],
]

/**
 * Grouped help, with an example per group. A flat wall of commands is a scan
 * problem; three short labeled blocks tell a new visitor what exists and,
 * with one example each, what the shape of a command is (clig.dev: nudge,
 * show examples, keep it scannable).
 */
export function help(c: Content): Output {
  const journeySections = shortcuts(c).map((f) => [f.name, f.title] as const)
  const groups: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
    ['navigate', NAVIGATION],
    ['this journey', journeySections],
    ['reach out & session', SESSION],
  ]

  const all = groups.flatMap(([, rows]) => rows)
  const width = Math.max(9, ...all.map(([name]) => name.length + 2))

  const out: Line[] = [styledLine('commands', 'bold'), blankLine()]
  for (const [heading, rows] of groups) {
    if (rows.length > 0) out.push(styledLine(`  ${heading}`, 'bold'))
    for (const [name, description] of rows) {
      out.push({
        spans: [
          { text: `    ${name.padEnd(width)}`, style: 'accent' },
          { text: description, style: 'dim' },
        ],
      })
    }
  }
  out.push(blankLine())
  out.push({ spans: [{ text: '    example: cat <file> reads a file', style: 'dim' }] })
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
