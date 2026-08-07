import Link from 'next/link'
import { listJourneys } from '../../../db/studio.ts'
import { duplicateJourney } from '../../studio/actions.ts'

export const metadata = { title: 'studio | knockport' }

export default function StudioHome() {
  const journeys = listJourneys()

  return (
    <>
      <h1>Journeys</h1>
      <p className="muted">
        Each journey is a live recruitment offer a candidate types their way
        into. Publish it, share the link, and read the applications here.
      </p>

      {journeys.length === 0 ? (
        <ol className="onboarding">
          <li>
            <strong>Create a journey.</strong> Name your company, write the
            sections that describe the work and the team. <Link href="/studio/new">Start</Link>.
          </li>
          <li>
            <strong>Publish and share the link.</strong> Each journey gets a
            terminal at <code>/j/&lt;slug&gt;</code>. A candidate types their
            way through it, exactly like a shell.
          </li>
          <li>
            <strong>Read the applications.</strong> Everything a candidate did,
            in order, lands in the inbox. No scores, no ranking: their actions
            speak in sequence.
          </li>
        </ol>
      ) : (
        <ul className="journey-list">
          {journeys.map((j) => (
            <li key={j.slug}>
              <div>
                <a href={`/j/${j.slug}`} className="slug">
                  /j/{j.slug}
                </a>
                <div className="meta">{j.title}</div>
              </div>
              <div className="journey-actions">
                <span className={`status ${j.published ? 'status-active' : 'status-draft'}`}>
                  {j.published ? 'ACTIVE' : 'DRAFT'}
                </span>
                <span className="meta">
                  <Link href={`/studio/j/${j.slug}`}>edit</Link> ·{' '}
                  <Link href={`/studio/j/${j.slug}/inbox`}>
                    {j.candidateCount === 0
                      ? 'applications'
                      : `applications (${j.candidateCount})`}
                  </Link>
                  {' · '}
                  <form className="inline-form" action={duplicateJourney.bind(null, j.slug)}>
                    <button type="submit" className="link">
                      duplicate
                    </button>
                  </form>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link href="/studio/new">Create a journey</Link>
      </p>

      <footer className="studio-footer">
        <span className="muted">© 2024 Knockport Studio. Terminal v1.0.4</span>
        <nav aria-label="Legal">
          <Link href="/studio">documentation</Link>
          <Link href="/studio">system status</Link>
          <Link href="/studio">privacy</Link>
        </nav>
      </footer>
    </>
  )
}