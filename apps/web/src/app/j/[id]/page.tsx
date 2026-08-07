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
 * La page candidat. Elle pose le CSS, le lien d'evitement et un point de
 * montage VIDE, puis charge le script du terminal. Rien d'autre.
 *
 * Le terminal se construit lui meme dans ce point de montage, et c'est
 * volontaire: React ne doit rien posseder ici. Rendre le scrollback cote
 * serveur puis le remplir en JavaScript faisait echouer l'hydratation, et un
 * `<script>` pose dans l'arbre React ne s'execute pas apres une navigation
 * client, ce qui donnait un terminal vide.
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
      {/* Le lien d'evitement reste rendu par le serveur: il doit fonctionner
          meme si le script du terminal ne se charge jamais. */}
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
