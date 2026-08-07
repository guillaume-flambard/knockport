import {
  BOOK_URL,
  CV_URL,
  execute,
  complete as completeCore,
  newSession,
  prompt as promptOf,
} from '@knockport/core'
import type { Line, Output, Session } from '@knockport/core'

import { findJourneyBySlug, saveContact, saveSessionEvents } from '../db/index.ts'
import type { Journey } from '../db/index.ts'

/**
 * Caps. An open socket on the internet is exposed surface, just like
 * port 22 will be for the SSH facade.
 */
const MAX_CONCURRENT_SESSIONS = 200
const MAX_SESSION_MS = 30 * 60 * 1000
/** Same cap as the Rust version: a real visitor produces tens of events
 *  in ten minutes, not thousands. */
const MAX_EVENTS = 500

/** What the transport must return to the client after a command. */
export type ExecResult = {
  output: Output
  prompt: string
  /** The transport must close the connection after sending the output. */
  done: boolean
  /** URL to open in a tab, already translated from the core marker. */
  openUrl?: string
  /** The client must clear its scrollback. */
  clear: boolean
}

let liveSessions = 0

export class TerminalSession {
  readonly id: string
  readonly journey: Journey
  private readonly session: Session
  private readonly startedAt: number
  private closed = false

  private constructor(id: string, journey: Journey) {
    this.id = id
    this.journey = journey
    this.session = newSession()
    this.startedAt = Date.now()
    liveSessions += 1
  }

  static open(journeySlug: string, sessionId?: string): TerminalSession | undefined {
    if (liveSessions >= MAX_CONCURRENT_SESSIONS) return undefined
    const journey = findJourneyBySlug(journeySlug)
    if (!journey) return undefined
    return new TerminalSession(sessionId ?? crypto.randomUUID(), journey)
  }

  get prompt(): string {
    return promptOf(this.session)
  }

  banner(): Line[] {
    const lines: Line[] = this.journey.banner
      .split('\n')
      .map((text) => ({ spans: [{ text, style: 'plain' as const }] }))

    // The notice goes after the title and before the commands, in gray: early
    // enough to be read, discrete enough not to break the entry.
    if (this.journey.notice) {
      lines.splice(2, 0, { spans: [] }, {
        spans: [{ text: this.journey.notice, style: 'dim' as const }],
      })
    }
    return lines
  }

  expired(): boolean {
    return Date.now() - this.startedAt > MAX_SESSION_MS
  }

  exec(input: string): ExecResult {
    const atMs = Date.now() - this.startedAt
    const output = execute(this.session, this.journey.content, input, atMs)

    const result: ExecResult = {
      output,
      prompt: promptOf(this.session),
      done: false,
      clear: false,
    }

    switch (output.effect?.kind) {
      case 'clear':
        result.clear = true
        break
      case 'quit':
        result.done = true
        break
      case 'openUrl': {
        const url = this.resolveMarker(output.effect.url)
        if (url) {
          result.openUrl = url
        } else {
          // A company's journey may not have a CV or calendar to open.
          // Saying so is better than a click that does nothing.
          output.lines.push({
            spans: [{ text: 'Nothing set up here yet.', style: 'dim' }],
          })
        }
        break
      }
      case 'submitContact':
        // The payload is already here on the server. It has no reason to go
        // back to the client and return via an HTTP route: the candidate's
        // name, email and message never cross the network a second time.
        saveContact({
          journeyId: this.journey.id,
          sessionId: this.id,
          name: output.effect.payload.name,
          email: output.effect.payload.email,
          message: output.effect.payload.message,
          eggFound: output.effect.payload.eggFound,
        })
        break
      default:
        break
    }

    // The effect must not go to the client: it would carry the contact
    // payload, which the client has no use for. The transport reads `result`.
    result.output = { lines: output.lines, failed: output.failed }

    if (this.session.journal.length > MAX_EVENTS) result.done = true

    return result
  }

  complete(partial: string): string[] {
    return completeCore(this.session, this.journey.content, partial)
  }

  /**
   * The core knows no URLs; it emits a marker. The facade translates it,
   * and it alone knows what this journey has configured.
   */
  private resolveMarker(marker: string): string | undefined {
    if (marker === CV_URL) return this.journey.cvUrl ?? undefined
    if (marker === BOOK_URL) return this.journey.bookUrl ?? undefined
    return marker
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    liveSessions -= 1
    try {
      saveSessionEvents(this.journey.id, this.id, this.session.journal)
    } catch (error) {
      console.error('knockport: journal not written', error)
    }
  }
}
