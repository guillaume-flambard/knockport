import { expect, it } from 'vitest'
import { execute } from '../src/command.ts'
import { content } from '../src/content.generated.ts'
import { newSession } from '../src/session.ts'

/** Reproduit exactement le helper `render` de crates/core/tests/snapshots.rs. */
function render(input: string): string {
  const out = execute(newSession(), content, input, 0)
  return out.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')
}

it('snapshot help', () => { expect(render('help')).toMatchSnapshot() })
it('snapshot ls root', () => { expect(render('ls')).toMatchSnapshot() })
it('snapshot unknown command', () => { expect(render('deploy to prod')).toMatchSnapshot() })
