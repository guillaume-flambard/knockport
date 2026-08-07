import { cat, cd, ls, pwd } from './commands/fs.ts'
import { help, history, show } from './commands/info.ts'
import { BOOK_URL, CV_URL, contactStep, startContact } from './commands/contact.ts'
import type { Content } from './content.ts'
import type { Output } from './output.ts'
import { emptyOutput, failureOutput, styledLine, textOutput, withEffect } from './output.ts'
import type { Session } from './session.ts'
import { words } from './text.ts'

export type Cmd = { name: string; args: string[] }

export function parse(input: string): Cmd | undefined {
  const [name, ...args] = words(input)
  return name === undefined ? undefined : { name, args }
}

export function execute(s: Session, c: Content, input: string, atMs: number): Output {
  if (s.mode.kind === 'contact') {
    const out = contactStep(s, input)
    // Visitor input never goes into the journal in plain text: it carries
    // the name, email, and message that are already included in the payload.
    s.journal.push({ atMs, input: '<contact>', ok: true })
    return out
  }

  const cmd = parse(input)
  if (!cmd) return emptyOutput()

  s.history.push(input.trim())
  const out = dispatch(s, c, cmd)
  s.journal.push({ atMs, input: input.trim(), ok: !out.failed })
  return out
}

function dispatch(s: Session, c: Content, cmd: Cmd): Output {
  switch (cmd.name) {
    case 'ls': return ls(s, c, cmd.args)
    case 'cd': return cd(s, c, cmd.args)
    case 'pwd': return pwd(s)
    case 'cat': return cat(s, c, cmd.args)
    case 'whoami': return show(c, 'whoami')
    case 'stack': return show(c, 'stack')
    case 'help': return help()
    case 'history': return history(s)
    case 'clear': return withEffect(emptyOutput(), { kind: 'clear' })
    case 'exit':
    case 'quit':
    case 'logout': return withEffect(emptyOutput(), { kind: 'quit' })
    case 'contact':
    case 'hire': return startContact(s)
    case 'cv': return withEffect(textOutput('Opening the CV.'), { kind: 'openUrl', url: CV_URL })
    case 'book': return withEffect(textOutput('Opening the calendar.'), { kind: 'openUrl', url: BOOK_URL })
    default: return unknown(cmd.name)
  }
}

function unknown(name: string): Output {
  const out = failureOutput(`${name}: no such command`)
  out.lines.push(styledLine('try help', 'dim'))
  return out
}
