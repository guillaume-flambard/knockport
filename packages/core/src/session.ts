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
}

export function newSession(): Session {
  return { cwd: [], mode: { kind: 'normal' }, history: [], journal: [], eggFound: false }
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
