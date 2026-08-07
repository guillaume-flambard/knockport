import { notFound } from 'next/navigation'
import type { Dir, File } from '@knockport/core'
import { findJourneyBySlug } from '../../../../db/index.ts'

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
 * The accessible version, served entirely by the server.
 *
 * This is not a convenience. Since the terminal uses WebSocket, a visitor
 * without JavaScript has NO access to the journey, so this page is the only
 * path left. The product's original note is explicit: friction that
 * effectively excludes a disabled candidate is discrimination, not a
 * filtering trick.
 *
 * So it contains no scripts, no puzzles, no games. Just the content.
 */
function Section({ file, prefix }: { file: File; prefix: string }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
        {file.title}
        <span style={{ opacity: 0.5, fontWeight: 400 }}> {prefix}</span>
      </h2>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{file.body}</p>
    </section>
  )
}

function walk(dir: Dir, prefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = dir.files.map((file) => (
    <Section key={`${prefix}${file.name}`} file={file} prefix={`${prefix}${file.name}`} />
  ))
  for (const child of dir.dirs) out.push(...walk(child, `${prefix}${child.name}/`))
  return out
}

export default async function ProfilePage({ params }: Params) {
  const { id } = await params
  const journey = findJourneyBySlug(id)
  if (!journey) notFound()

  return (
    <main
      style={{
        maxWidth: '68ch',
        margin: '0 auto',
        padding: '3rem 1.25rem 5rem',
        font: "16px/1.7 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{journey.title}</h1>
        <p style={{ opacity: 0.7, margin: 0 }}>
          This is the full text of the {journey.companyName} journey, with nothing hidden and
          nothing to solve. The interactive version needs JavaScript and a keyboard;{' '}
          <a href={`/j/${journey.slug}`}>it is here</a> if you would rather use it.
        </p>
      </header>

      {/* The hidden file is shown here like any other: on this path there is
          no puzzle, otherwise the accessible path would be an inferior path. */}
      {walk(journey.content.root, '')}

      <footer style={{ borderTop: '1px solid rgba(128,128,128,.3)', paddingTop: '1.5rem' }}>
        {journey.bookUrl ? <a href={journey.bookUrl}>Apply or get in touch</a> : null}
        {journey.notice ? (
          <p style={{ opacity: 0.6, marginTop: '1rem', fontSize: '0.9rem' }}>{journey.notice}</p>
        ) : null}
      </footer>
    </main>
  )
}
