import { describe, expect, it } from 'vitest'
import { assemble } from '../src/journey/assemble.ts'
import type { Section } from '../src/journey/assemble.ts'

function section(partial: Partial<Section> & { name: string }): Section {
  return { title: '', body: '', order: 1, hidden: false, ...partial }
}

describe('assemble', () => {
  it('puts flat sections in the root, in order', () => {
    const content = assemble([
      section({ name: 'role', title: 'the role', order: 1 }),
      section({ name: 'whoami', title: 'who we are', order: 2 }),
    ])
    expect(content.root.files.map((f) => f.name)).toEqual(['role', 'whoami'])
  })

  it('sorts root files by order then name', () => {
    const content = assemble([
      section({ name: 'zeta', order: 2 }),
      section({ name: 'alpha', order: 1 }),
      section({ name: 'beta', order: 1 }),
    ])
    expect(content.root.files.map((f) => f.name)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('groups sections with a directory under that directory', () => {
    const content = assemble([
      section({ name: 'whoami', order: 1 }),
      section({ name: 'knockport', dir: 'projects', order: 1 }),
    ])
    expect(content.root.dirs.map((d) => d.name)).toEqual(['projects'])
    expect(content.root.dirs[0]!.files.map((f) => f.name)).toEqual(['knockport'])
  })

  it('trims the body', () => {
    const content = assemble([section({ name: 'whoami', body: '  hello  \n' })])
    expect(content.root.files[0]!.body).toBe('hello')
  })

  it('carries the hidden flag', () => {
    const content = assemble([section({ name: 'knock', hidden: true })])
    expect(content.root.files[0]!.hidden).toBe(true)
  })

  it('leaves the hidden flag false by default', () => {
    const content = assemble([section({ name: 'whoami' })])
    expect(content.root.files[0]!.hidden).toBe(false)
  })

  it('handles an empty list with an empty root', () => {
    expect(assemble([]).root.files).toEqual([])
    expect(assemble([]).root.dirs).toEqual([])
  })
})
