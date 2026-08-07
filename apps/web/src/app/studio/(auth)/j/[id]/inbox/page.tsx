import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJourneyForEdit, listCandidates, getTimelinesForSessions, markInboxRead } from '../../../../../../db/studio.ts'
import type { Candidate, TimelineEvent } from '../../../../../../db/studio.ts'
import { CopyEmail } from './copy-email.tsx'

export const metadata = { title: 'applications | knockport studio' }

type Props = { params: Promise<{ id: string }> }

function ago(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

/** The contact message and the raw timeline, each kept as simple as they came
 *  in. This page shows what the candidate did, never an opinion on it. */
function CandidateCard({ candidate, timeline }: { candidate: Candidate; timeline: TimelineEvent[] }) {

  return (
    <article className="section">
      <h2>
        {candidate.name}{' '}
        {!candidate.read ? <span className="badge">new</span> : null}
        <span className="mono muted">{candidate.email}</span> <CopyEmail email={candidate.email} />
      </h2>
      <p className="muted">
        {ago(candidate.createdAt)} ·{' '}
        {candidate.eggFound ? 'found the hidden file' : 'did not reach the hidden file'}
      </p>
      <p>{candidate.message}</p>
      <h3 className="muted">What they did</h3>
      {timeline.length === 0 ? (
        <p className="muted">No terminal activity was recorded for this application.</p>
      ) : (
        <div className="timeline">
          {timeline
            .map(
              (e) =>
                `${String(Math.round(e.atMs / 1000)).padStart(4)}s  ${e.input}${e.ok ? '' : '  (did not land)'}`,
            )
            .join('\n')}
        </div>
      )}
    </article>
  )
}

export default async function InboxPage({ params }: Props) {
  const { id } = await params
  const journey = getJourneyForEdit(id)
  if (!journey) notFound()

  const candidates = listCandidates(id)
  markInboxRead(id)
  const newCount = candidates.filter((c) => !c.read).length
  // One query for every timeline, not one per candidate.
  const timelines = getTimelinesForSessions(candidates.map((c) => c.sessionId))

  return (
    <>
      <h1>Applications — /j/{id}</h1>
      <p className="muted">
        <Link href="/studio">all journeys</Link> · <Link href={`/studio/j/${id}`}>edit</Link> ·{' '}
        <Link href={`/j/${id}`}>view live</Link>
      </p>

      {candidates.length === 0 ? (
        <p className="muted">
          No applications yet. A candidate reaches you by typing <code>contact</code>{' '}
          in the terminal at <a href={`/j/${id}`}>/j/{id}</a>, or through the plain
          page <code>/j/{id}/profile</code>. Share the link and they will appear here.
        </p>
      ) : (
        <p className="muted">
          {candidates.length} application{candidates.length === 1 ? '' : 's'}, most recent
          first. Read only: nothing here ranks, grades or sorts by preference.
          {newCount > 0 ? ` ${newCount} new.` : ''}
        </p>
      )}

      {candidates.map((c) => (
        <CandidateCard key={c.id} candidate={c} timeline={timelines.get(c.sessionId) ?? []} />
      ))}
    </>
  )
}