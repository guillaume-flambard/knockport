import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page" style={{ fontFamily: 'var(--font-mono, monospace)', padding: '3rem 1.5rem', maxWidth: '40rem' }}>
      <p className="muted">404</p>
      <h1>Nothing here.</h1>
      <p>
        The journey you are looking for does not exist, or was never published.
      </p>
      <p>
        <Link href="/">Back to the landing page</Link>
      </p>
    </main>
  )
}
