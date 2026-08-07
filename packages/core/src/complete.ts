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
