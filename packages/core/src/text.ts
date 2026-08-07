/**
 * Reproduces Rust's `str::lines()`: splits on \n, strips a trailing \r from
 * each line, and does not produce a trailing empty line. `"a\n".split('\n')`
 * would return `["a", ""]`, adding a blank line to every `cat`.
 */
export function lines(text: string): string[] {
  const out = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  if (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/**
 * Reproduces Rust's `split_whitespace()`. The guard against empty strings is
 * essential: `''.split(/\s+/)` returns `['']` not `[]`. Note: Rust relies on
 * Unicode's White_Space property; JS's \s diverges on U+0085 and U+FEFF. The
 * gap is accepted because it is beyond the scope of keyboard input.
 */
export function words(input: string): string[] {
  const trimmed = input.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** Reproduces `chars().count()`: code points, not UTF-16 units. */
export function charCount(s: string): number {
  return [...s].length
}
