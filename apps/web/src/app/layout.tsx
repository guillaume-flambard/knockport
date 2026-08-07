import type { ReactNode } from 'react'

/**
 * Root layout intentionally bare. MUI and Emotion live in the recruiter
 * group's layout, never here: the candidate page must not carry any React
 * component beyond the strict container, and especially not a UI library.
 */
export const metadata = {
  title: 'knockport',
  description: 'A hiring journey you type into.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
