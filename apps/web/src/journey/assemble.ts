import type { Content, Dir, File } from '@knockport/core'

/**
 * Ce qu'un recruteur remplit dans le constructeur: des champs plats, aucune
 * syntaxe. Le markdown et le frontmatter etaient une commodite pour un
 * developpeur qui edite des fichiers; ils n'ont rien a faire dans un
 * formulaire destine a quelqu'un qui ne code pas.
 */
export type Section = {
  /** Nom dans le systeme de fichiers virtuel. Ex: "stack". */
  name: string
  /** Libelle affiche a cote du nom par `ls`. */
  title: string
  body: string
  /** Position dans le `ls`. Croissant. */
  order: number
  /** Revele seulement par `ls -a`. C'est l'enigme du parcours. */
  hidden?: boolean
  /** Sous-repertoire optionnel. Ex: "projects". */
  dir?: string
}

/**
 * Reproduit le tri de scripts/gen-content.mjs: fichiers par ordre croissant
 * puis par nom, repertoires par nom. Le core n'ordonne rien lui-meme, il
 * affiche dans l'ordre recu, donc c'est ici que ca se joue.
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
