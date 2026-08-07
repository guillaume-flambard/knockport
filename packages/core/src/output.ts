export type Style = 'plain' | 'dim' | 'bold' | 'accent'

export type Span = { text: string; style: Style }
export type Line = { spans: Span[] }

export type Effect =
  | { kind: 'clear' }
  | { kind: 'quit' }
  | { kind: 'openUrl'; url: string }
  | { kind: 'submitContact'; payload: ContactPayload }

/**
 * `failed` is carried explicitly and never inferred from rendered text.
 * The journal needs to know if the visitor encountered an error, and sniffing
 * the output to guess it would break on the first message rewording.
 */
export type Output = { lines: Line[]; effect?: Effect; failed: boolean }

import type { ContactPayload } from './session.ts'

export function styledLine(text: string, style: Style): Line {
  return { spans: [{ text, style }] }
}

export function plainLine(text: string): Line {
  return styledLine(text, 'plain')
}

export function blankLine(): Line {
  return { spans: [] }
}

export function emptyOutput(): Output {
  return { lines: [], failed: false }
}

export function textOutput(text: string): Output {
  return { lines: [plainLine(text)], failed: false }
}

export function failureOutput(text: string): Output {
  return { lines: [styledLine(`knockport: ${text}`, 'accent')], failed: true }
}

export function fromTexts(texts: string[]): Output {
  return { lines: texts.map(plainLine), failed: false }
}

export function withEffect(out: Output, effect: Effect): Output {
  return { ...out, effect }
}
