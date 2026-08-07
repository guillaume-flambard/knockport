'use client'

import { useState } from 'react'

/** One-click copy of a candidate's address. The inbox never ranks anyone; a
 *  copy button is just the least-friction path to the natural next step. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="link"
      aria-label={`Copy ${email}`}
      onClick={() => {
        void navigator.clipboard.writeText(email)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}
