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

  const shown = dir.files.filter((f) => showAll || !f.hidden)

  // Les titres s'alignent sur le nom le plus long du repertoire. Trois espaces
  // fixes suffisaient tant que le contenu etait le portfolio personnel, ou les
  // deux noms faisaient presque la meme longueur. Sur un parcours d'entreprise
  // quelconque, ca donne des colonnes en escalier.
  const width = Math.max(0, ...shown.map((f) => displayName(f).length))

  for (const file of shown) {
    out.push({
      spans: [
        { text: displayName(file).padEnd(width), style: 'plain' },
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
