export type File = {
  name: string
  title: string
  order: number
  hidden: boolean
  body: string
}

export type Dir = { name: string; dirs: Dir[]; files: File[] }
export type Content = { root: Dir }

/** A hidden file is addressed with an initial dot, like in a real shell. */
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

/**
 * The root files, which double as commands.
 *
 * `ls` advertises them, so typing one has to work: a listing that names
 * something the parser then rejects reads as a broken product. Hidden files
 * stay out. They are found by exploring and opened with `cat`, which is what
 * marks the session.
 */
export function shortcuts(c: Content): File[] {
  return c.root.files.filter((f) => !f.hidden)
}

export function resolveFile(c: Content, path: string[]): File | undefined {
  if (path.length === 0) return undefined
  const name = path[path.length - 1]!
  const dir = resolveDir(c, path.slice(0, -1))
  return dir?.files.find((f) => displayName(f) === name)
}
