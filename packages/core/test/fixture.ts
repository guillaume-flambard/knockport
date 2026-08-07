import type { Content } from '../src/content.ts'

/**
 * A company journey, which the generated portfolio content cannot stand in for.
 *
 * `content.generated.ts` has exactly two root files, `whoami` and `stack`, and
 * those were once the two names hardcoded into the dispatcher, the help
 * listing and the completion. Every test passed while any third section was
 * listed by `ls` and then rejected by the parser. This fixture has a third one.
 */
export const companyJourney: Content = {
  root: {
    name: '',
    dirs: [
      {
        name: 'projects',
        dirs: [],
        files: [{ name: 'oris', title: 'the product', order: 1, hidden: false, body: 'The product.' }],
      },
    ],
    files: [
      { name: 'whoami', title: 'who we are', order: 1, hidden: false, body: 'Fifteen people.' },
      { name: 'stack', title: 'what you would touch', order: 2, hidden: false, body: 'TypeScript.' },
      { name: 'role', title: 'the role', order: 3, hidden: false, body: 'Product Engineer.' },
      { name: 'knock', title: 'knock', order: 99, hidden: true, body: 'You typed ls -a.' },
    ],
  },
}
