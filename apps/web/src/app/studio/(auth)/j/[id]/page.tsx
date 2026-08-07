import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BuilderForm } from '../../../../../components/builder-form.tsx'
import { SavedBanner } from '../../../../../components/saved-banner.tsx'
import { getJourneyForEdit } from '../../../../../db/studio.ts'
import { removeJourney } from '../../../../studio/actions.ts'

export const metadata = { title: 'edit journey | knockport studio' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}

export default async function EditJourneyPage({ params, searchParams }: Props) {
  const { id } = await params
  const { error, saved } = await searchParams
  const draft = getJourneyForEdit(id)
  if (!draft) notFound()

  return (
    <>
      <h1>Edit /j/{id}</h1>
      {saved === '1' ? <SavedBanner slug={id} /> : null}
      <p className="muted">
        <Link href="/studio">all journeys</Link> · <Link href={`/j/${id}`}>view live</Link> ·{' '}
        <Link href={`/studio/j/${id}/inbox`}>applications</Link>
      </p>
      <BuilderForm draft={draft} error={error} />
      <form action={removeJourney.bind(null, id)}>
        <button type="submit" className="link">
          Delete this journey
        </button>
      </form>
    </>
  )
}