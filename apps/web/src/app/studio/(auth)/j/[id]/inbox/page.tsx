import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJourneyForEdit, listCandidates, getTimelinesForSessions, markInboxRead } from '../../../../../../db/studio.ts'
import type { Candidate, TimelineEvent } from '../../../../../../db/studio.ts'
import { CopyEmail } from './copy-email.tsx'

export const metadata = { title: 'applications | knockport studio' }

type Props = { params: Promise<{ id: string }> }

/** The contact message and the raw timeline, each kept as simple as they came
 *  in. This page shows what the candidate did, never an opinion on it. */
function CandidateCard({ candidate, timeline }: { candidate: Candidate; timeline: TimelineEvent[] }) {

  return (
    <article className="section inbox-card">
      <header className="inbox-card-head">
        <h2>
          {candidate.name}{' '}
          {!candidate.read ? <span className="badge">NEW</span> : null}
        </h2>
        <p className="mono muted">
          {candidate.email} <CopyEmail email={candidate.email} />
        </p>
      </header>
      <div className="inbox-card-body">
        <div className="inbox-col">
          <p className="muted inbox-kicker">Message</p>
          <p>{candidate.message}</p>
        </div>
        <div className="inbox-col">
          <p className="muted inbox-kicker">Session_Log</p>
          {timeline.length === 0 ? (
            <p className="muted">No terminal activity was recorded.</p>
          ) : (
            <ul className="timeline">
              {timeline.map((e, i) => (
                <li key={i}>
                  <code className="timeline-cmd">&gt; {e.input}</code>
                  <span className="timeline-when">
                    {String(Math.round(e.atMs / 1000)).padStart(4)}s
                    {e.ok ? '' : ' · did not land'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
          Found {candidates.length} candidate{candidates.length === 1 ? '' : 's'} in queue.{' '}
          {newCount} unread. Read only: nothing here ranks, grades or sorts by preference.
        </p>
      )}

      {candidates.map((c) => (
        <CandidateCard key={c.id} candidate={c} timeline={timelines.get(c.sessionId) ?? []} />
      ))}
    </>
  )
}