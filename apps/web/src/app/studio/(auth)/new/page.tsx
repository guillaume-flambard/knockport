import { BuilderForm } from '../../../../components/builder-form.tsx'
import { demoTemplate } from '../../../../journey/seed-demo.ts'

export const metadata = { title: 'new journey | knockport studio' }

type Props = { searchParams: Promise<{ error?: string; from?: string }> }

export default async function NewJourneyPage({ searchParams }: Props) {
  const { error, from } = await searchParams
  const template = from === 'memo-labs' ? demoTemplate() : undefined
  const draft = template
    ? {
        slug: '',
        companyName: template.companyName,
        website: template.website,
        title: template.title,
        banner: template.banner,
        notice: template.notice,
        sections: template.sections,
        published: false,
      }
    : undefined

  return (
    <>
      <h1>New journey</h1>
      {draft ? (
        <p className="muted">
          Started from the Memo Labs example. Change anything, then publish; it
          becomes yours.
        </p>
      ) : (
        <p className="muted">
          Three steps: who you are, what the candidate will explore, and how they
          reach you. The terminal, the ls listing and the plain page are all
          derived from what you write here, so there is no syntax to learn.
        </p>
      )}
      {!draft ? (
        <p>
          <a className="link" href="/studio/new?from=memo-labs">
            Start from the Memo Labs example instead
          </a>
        </p>
      ) : null}
      <BuilderForm mode="create" draft={draft} error={error} />
    </>
  )
}
