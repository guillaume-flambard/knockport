/**
 * Reproduit `str::lines()` de Rust: coupe sur \n, retire un \r final de
 * chaque ligne, et ne produit pas de ligne vide terminale. `"a\n".split('\n')`
 * rendrait `["a", ""]`, ce qui ajouterait une ligne blanche a chaque `cat`.
 */
export function lines(text: string): string[] {
  const out = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  if (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/**
 * Reproduit `split_whitespace()` de Rust. La garde sur la chaine vide est
 * indispensable: `''.split(/\s+/)` rend `['']` et non `[]`.
 */
export function words(input: string): string[] {
  const trimmed = input.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** Reproduit `chars().count()`: des points de code, pas des unites UTF-16. */
export function charCount(s: string): number {
  return [...s].length
}
