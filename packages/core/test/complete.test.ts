import { describe, expect, it } from 'vitest'
import type { Content } from '../src/content.ts'
import { complete } from '../src/complete.ts'
import { content } from '../src/content.generated.ts'
import { companyJourney } from './fixture.ts'
import { newSession } from '../src/session.ts'

describe('complete', () => {
  it('completes a command name', () => {
    expect(complete(newSession(), content, 'wh')).toEqual(['whoami'])
  })

  it('completes a path argument', () => {
    expect(complete(newSession(), content, 'cd pro')).toContain('cd projects')
  })

  it('never completes the hidden file', () => {
    expect(complete(newSession(), content, 'cat .kn')).toEqual([])
  })

  it('returns nothing without a match', () => {
    expect(complete(newSession(), content, 'xyz')).toEqual([])
  })

  it('returns nothing on an empty argument prefix', () => {
    expect(complete(newSession(), content, 'cd ')).toEqual([])
  })

  it("completes the journey's own sections as commands", () => {
    expect(complete(newSession(), companyJourney, 'ro')).toEqual(['role'])
  })

  it('never completes the hidden section as a command', () => {
    expect(complete(newSession(), companyJourney, 'kn')).toEqual([])
  })

  it('returns sorted results', () => {
    const fixture: Content = {
      root: {
        name: 'root',
        dirs: [
          { name: 'alpine', dirs: [], files: [] },
          { name: 'zeta', dirs: [], files: [] },
        ],
        files: [
          { name: 'beta', title: '', order: 0, hidden: false, body: '' },
          { name: 'alpha', title: '', order: 1, hidden: false, body: '' },
          { name: 'alto', title: '', order: 2, hidden: false, body: '' },
        ],
      },
    }
    const found = complete(newSession(), fixture, 'cat al')
    expect(found).toEqual(['cat alpha', 'cat alpine', 'cat alto'])
  })
})
