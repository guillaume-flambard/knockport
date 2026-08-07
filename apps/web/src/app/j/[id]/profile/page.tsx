import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import type { Dir, File } from '@knockport/core'
import { findJourneyBySlug } from '../../../../db/index.ts'
import '../../../site.css'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const journey = findJourneyBySlug(id)
  if (!journey) return { title: 'knockport' }
  return {
    title: `${journey.title} | plain text`,
    description: `The full ${journey.companyName} journey as plain text, no JavaScript required.`,
  }
}

/**
 * The accessible version, rendered entirely by the server.
 *
 * This is not a convenience. Since the terminal moved to a WebSocket, a
 * visitor without JavaScript has no access to the journey at all, so this
 * page is the only path left to them. The product's founding note is
 * explicit: a friction that in practice excludes a disabled candidate is
 * discrimination, not a filtering trick.
 *
 * It therefore carries no script, no puzzle and no game. Just the content.
 */
/**
 * Journey text is hard wrapped for a terminal about 78 columns wide. Kept as
 * is in a prose column it produces broken half lines, which is the opposite
 * of what this page is for. Single newlines are therefore unwrapped into
 * spaces and only blank lines start a new paragraph, the way any prose
 * renderer treats a hard wrapped source.
 */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').join(' ').trim())
    .filter((block) => block !== '')
}

function Section({ file, path }: { file: File; path: string }) {
  return (
    <section>
      <h2>
        {file.title}
        <span className="path">{path}</span>
      </h2>
      {paragraphs(file.body).map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </section>
  )
}

function walk(dir: Dir, prefix: string): ReactNode[] {
  const out: ReactNode[] = dir.files.map((file) => (
    <Section key={`${prefix}${file.name}`} file={file} path={`${prefix}${file.name}`} />
  ))
  for (const child of dir.dirs) out.push(...walk(child, `${prefix}${child.name}/`))
  return out
}

export default async function ProfilePage({ params }: Params) {
  const { id } = await params
  const journey = findJourneyBySlug(id)
  if (!journey) notFound()

  return (
    <main className="page">
      <p className="wordmark">knockport</p>

      <h1>{journey.title}</h1>
      <p className="muted">
        The full {journey.companyName} journey as plain text, with nothing hidden and nothing to
        solve. The interactive version needs JavaScript and a keyboard;{' '}
        <a href={`/j/${journey.slug}`}>it is here</a> if you would rather use that.
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '2.5rem 0' }} />

      {/* The hidden file is shown here like any other: on this path there is no
          puzzle, otherwise the accessible route would be the lesser one. */}
      {walk(journey.content.root, '')}

      <footer>
        {journey.bookUrl ? (
          <p>
            <a href={journey.bookUrl}>Apply or get in touch</a>
          </p>
        ) : null}
        {journey.notice ? <p className="muted">{journey.notice}</p> : null}
      </footer>
    </main>
  )
}
