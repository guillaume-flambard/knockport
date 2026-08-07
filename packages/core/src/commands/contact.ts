import type { Output } from '../output.ts'
import { blankLine, emptyOutput, plainLine, styledLine, textOutput } from '../output.ts'
import type { Session } from '../session.ts'
import { charCount } from '../text.ts'

// Markers, not URLs. The core knows nothing of URLs; the facade translates
// (web maps to /cv.pdf and /book, SSH prints them in plaintext).
export const CV_URL = '{{cv_url}}'
export const BOOK_URL = '{{book_url}}'

export function validEmail(value: string): boolean {
  const v = value.trim()
  if (v === '' || v.length > 254 || /\s/.test(v)) return false
  const at = v.indexOf('@')
  if (at <= 0) return false
  // Original Rust accepted multiple @ (split_once cut at the first).
  // TypeScript tightens: reject if @ appears more than once.
  if (v.indexOf('@') !== v.lastIndexOf('@')) return false
  const domain = v.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

export function validMessage(value: string): boolean {
  // `chars().count()` in Rust counts code points. `.length` would count
  // an emoji as two and allow a message that is too short.
  const len = charCount(value.trim())
  return len >= 10 && len <= 4000
}

export function startContact(s: Session): Output {
  s.mode = { kind: 'contact', step: 'name', draft: { name: '', email: '' } }
  return {
    lines: [plainLine('Three questions. Type cancel at any point to drop out.'), blankLine()],
    failed: false,
  }
}

export function contactStep(s: Session, input: string): Output {
  const value = input.trim()

  if (value.toLowerCase() === 'cancel') {
    s.mode = { kind: 'normal' }
    return textOutput('Dropped. Nothing was sent.')
  }

  if (s.mode.kind !== 'contact') return emptyOutput()
  const { step, draft } = s.mode

  switch (step) {
    case 'name':
      if (value === '') return retry('A name, even a first one.')
      s.mode = { kind: 'contact', step: 'email', draft: { ...draft, name: value } }
      return emptyOutput()

    case 'email':
      if (!validEmail(value)) return retry('That does not look like an email address.')
      s.mode = { kind: 'contact', step: 'message', draft: { ...draft, email: value } }
      return emptyOutput()

    case 'message': {
      if (!validMessage(value)) return retry('Between 10 and 4000 characters, please.')
      s.mode = { kind: 'normal' }
      return {
        // Company voice belongs to the default: this is a hiring journey,
        // and the string is expected after a message to the company.
        lines: [plainLine('Sent. We read everything, and we answer.')],
        effect: {
          kind: 'submitContact',
          payload: {
            name: draft.name,
            email: draft.email,
            message: value,
            journal: [...s.journal],
            eggFound: s.eggFound,
          },
        },
        failed: false,
      }
    }
  }
}

function retry(message: string): Output {
  return { lines: [styledLine(message, 'accent')], failed: true }
}
