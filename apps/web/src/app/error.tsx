'use client'

/**
 * Catches render errors so a crash on one journey never shows a raw Next
 * stack trace to a candidate. The message is deliberately quiet.
 */
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main style={{ fontFamily: 'var(--font-mono, monospace)', padding: '3rem 1.5rem', maxWidth: '40rem' }}>
      <h1>Something went wrong.</h1>
      <p>Reload the page to try again. Nothing you typed was saved.</p>
      <button
        type="button"
        onClick={reset}
        style={{ background: 'none', border: '1px solid currentColor', padding: '0.4rem 1rem', font: 'inherit', cursor: 'pointer' }}
      >
        Try again
      </button>
    </main>
  )
}
