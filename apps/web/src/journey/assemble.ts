import type { Content, Dir, File } from '@knockport/core'

/**
 * What a recruiter fills in the journey builder: flat fields, no syntax.
 * Markdown and frontmatter were a convenience for a developer editing files.
 * They have no place in a form meant for someone who does not code.
 */
export type Section = {
  /** Name in the virtual filesystem. Example: "stack". */
  name: string
  /** Label displayed next to the name by `ls`. */
  title: string
  body: string
  /** Position in `ls`. Ascending. */
  order: number
  /** Revealed only by `ls -a`. This is the hidden file of the journey. */
  hidden?: boolean
  /** Optional subdirectory. Example: "projects". */
  dir?: string
}

/**
 * Reproduces the sort from scripts/gen-content.mjs: files by ascending order
 * then by name, directories by name. The core does not sort anything itself;
 * it displays in the order received, so the sort happens here.
 */
function sortDir(dir: Dir): void {
  dir.files.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  dir.dirs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  dir.dirs.forEach(sortDir)
}

export function assemble(sections: readonly Section[]): Content {
  const root: Dir = { name: '', dirs: [], files: [] }

  for (const section of sections) {
    const file: File = {
      name: section.name,
      title: section.title,
      order: section.order,
      hidden: section.hidden ?? false,
      body: section.body.trim(),
    }

    if (!section.dir) {
      root.files.push(file)
      continue
    }

    let dir = root.dirs.find((d) => d.name === section.dir)
    if (!dir) {
      dir = { name: section.dir, dirs: [], files: [] }
      root.dirs.push(dir)
    }
    dir.files.push(file)
  }

  sortDir(root)
  return { root }
}
