import type { Content } from './content.ts'
import { resolveDir, shortcuts } from './content.ts'
import type { Session } from './session.ts'

// Aliases are left out on purpose: `quit`, `logout` and `hire` are not offered.
// Same two blocks as the help listing, in the same order.
const NAVIGATION = ['ls', 'cd', 'cat', 'pwd'] as const
const SESSION = ['cv', 'contact', 'book', 'history', 'help', 'clear', 'exit'] as const

export function complete(s: Session, c: Content, partial: string): string[] {
  const space = partial.indexOf(' ')

  // The journey's own sections complete like any other command, since that is
  // what they are. Hidden files are excluded by `shortcuts`.
  if (space === -1) {
    const names = [...NAVIGATION, ...shortcuts(c).map((f) => f.name), ...SESSION]
    return names.filter((n) => n.startsWith(partial))
  }

  const command = partial.slice(0, space)
  const prefix = partial.slice(space + 1).replace(/^\s+/, '')
  if (prefix === '') return []

  const dir = resolveDir(c, s.cwd)
  if (!dir) return []

  return [
    ...dir.dirs.map((d) => d.name),
    // The hidden file is excluded: the puzzle is found by manual exploration.
    ...dir.files.filter((f) => !f.hidden).map((f) => f.name),
  ]
    .filter((name) => name.startsWith(prefix))
    .map((name) => `${command} ${name}`)
    .sort()
}
