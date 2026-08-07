export type Event = { atMs: number; input: string; ok: boolean }

export type ContactPayload = {
  name: string
  email: string
  message: string
  journal: Event[]
  eggFound: boolean
}

export type ContactStep = 'name' | 'email' | 'message'
export type ContactDraft = { name: string; email: string }

export type Mode =
  | { kind: 'normal' }
  | { kind: 'contact'; step: ContactStep; draft: ContactDraft }

export type Session = {
  cwd: string[]
  mode: Mode
  history: string[]
  journal: Event[]
  eggFound: boolean
  /** Files already read via `cat` or a root-file command. Used to tell when
   *  the journey has been seen in full, which is the right moment to point
   *  the visitor at `contact`. Never a score: it is a count of what was
   *  opened, and it is not shown as one. */
  readFiles: string[]
  /** Set once the "you have seen everything" nudge is printed, so it is not
   *  repeated on every following command. */
  contactSuggested: boolean
}

export function newSession(): Session {
  return {
    cwd: [],
    mode: { kind: 'normal' },
    history: [],
    journal: [],
    eggFound: false,
    readFiles: [],
    contactSuggested: false,
  }
}

export function prompt(s: Session): string {
  if (s.mode.kind === 'contact') {
    switch (s.mode.step) {
      case 'name': return 'your name> '
      case 'email': return 'your email> '
      case 'message': return 'your message> '
    }
  }
  return `~/${s.cwd.join('/')}$ `
}
