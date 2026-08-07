import Script from 'next/script'
import { notFound } from 'next/navigation'
import { findJourneyBySlug } from '../../../db/index.ts'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const journey = findJourneyBySlug(id)
  if (!journey) return { title: 'knockport' }
  return {
    title: `${journey.title} | knockport`,
    description: `A terminal you type into. ${journey.companyName} is hiring.`,
  }
}

/**
 * The candidate page. It sets the CSS, the skip link, and an EMPTY mount
 * point, then loads the terminal script. Nothing else.
 *
 * The terminal builds itself in this mount point, and it is intentional:
 * React must not own anything here. Rendering the scrollback server-side
 * and filling it with JavaScript caused hydration to fail, and a script
 * placed in the React tree does not execute after client-side navigation,
 * which gave an empty terminal.
 */
export default async function JourneyPage({ params }: Params) {
  const { id } = await params
  const journey = findJourneyBySlug(id)
  if (!journey) notFound()

  return (
    <>
      <link rel="stylesheet" href="/terminal/main.css" />
      <link
        rel="preload"
        href="/terminal/ibm-plex-mono-400.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      {/* The skip link stays server-rendered: it must work even if the
          terminal script never loads. */}
      <a className="skip" href={`/j/${journey.slug}/profile`}>
        Plain, accessible version of this page
      </a>
      <main
        className="stage"
        data-journey={journey.slug}
        data-title={`candidate@${journey.companySlug}: ~`}
      />
      <Script src="/terminal/main.js" strategy="afterInteractive" />
    </>
  )
}
