import { BuilderForm } from '../../../../components/builder-form.tsx'
import { demoTemplate } from '../../../../journey/seed-demo.ts'

export const metadata = { title: 'new journey | knockport studio' }

type Props = { searchParams: Promise<{ error?: string; blank?: string }> }

export default async function NewJourneyPage({ searchParams }: Props) {
  const { error, blank } = await searchParams
  const template = blank === '1' ? undefined : demoTemplate()
  const draft = template
    ? {
        slug: '',
        companyName: template.companyName,
        website: template.website,
        title: template.title,
        banner: template.banner,
        // The template's notice says "a live example", which is true only of
        // the demo. A new employer must not publish that sentence on their own
        // offer, so the pre-filled journey starts without it.
        notice: null,
        sections: template.sections,
        published: false,
      }
    : undefined

  return (
    <>
      <h1>New journey</h1>
      {draft ? (
        <p className="muted">
          Started from the Memo Labs example: a company, a role and a few
          sections are already written. Change them to be yours, then publish.
          Nothing here is syntax; the terminal is derived from what you write.
        </p>
      ) : (
        <p className="muted">
          Three steps: who you are, what the candidate will explore, and how they
          reach you. The terminal, the ls listing and the plain page are all
          derived from what you write here, so there is no syntax to learn.
        </p>
      )}
      {draft ? (
        <p>
          <a className="link" href="/studio/new?blank=1">
            Start from a blank journey instead
          </a>
        </p>
      ) : null}
      <BuilderForm mode="create" draft={draft} error={error} />
    </>
  )
}
