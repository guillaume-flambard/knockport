'use client'

import { useEffect, useState } from 'react'

/**
 * The post-save payoff: a confirmation that the journey is live, with the one
 * thing the employer came for, the link to share. Copy is a fallback for the
 * select-by-hand path, which is the path everyone finds first.
 */
export function SavedBanner({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const url = `/j/${slug}`

  // Reaching this banner means the save went through, so the browser's draft
  // of the not-yet-created journey is spent. Clearing it keeps the next visit
  // to /studio/new from restoring a journey that already exists.
  useEffect(() => {
    window.localStorage.removeItem('knockport:draft')
  }, [])

  return (
    <p className="saved-banner" role="status">
      Saved. It is live at{' '}
      <a href={url} className="slug">
        {url}
      </a>
      {copied ? (
        <span className="muted"> · copied</span>
      ) : (
        <>
          {' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              void navigator.clipboard.writeText(new URL(url, window.location.href).toString())
              setCopied(true)
            }}
          >
            copy the link
          </button>
        </>
      )}
    </p>
  )
}
