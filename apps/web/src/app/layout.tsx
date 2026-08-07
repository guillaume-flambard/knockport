import type { ReactNode } from 'react'

/**
 * Layout racine volontairement nu. MUI et Emotion vivent dans le layout du
 * groupe recruteur, jamais ici : la page candidat ne doit embarquer aucun
 * composant React au dela du strict conteneur, et surtout pas une
 * bibliotheque d'interface.
 */
export const metadata = {
  title: 'knockport',
  description: 'Un parcours de candidature qui se traverse au clavier.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
