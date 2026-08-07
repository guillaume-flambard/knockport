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
 * Plafonds. Un socket ouvert sur internet est une surface exposee, au meme
 * titre que le port 22 le sera pour la facade SSH.
 */
const MAX_CONCURRENT_SESSIONS = 200
const MAX_SESSION_MS = 30 * 60 * 1000
/** Meme plafond que la version Rust: un visiteur reel produit des dizaines
 *  d'evenements en dix minutes, pas des milliers. */
const MAX_EVENTS = 500

/** Ce que le transport doit renvoyer au client apres une commande. */
export type ExecResult = {
  output: Output
  prompt: string
  /** Le transport doit fermer la connexion apres avoir transmis la sortie. */
  done: boolean
  /** URL a ouvrir dans un onglet, deja traduite depuis le marqueur du core. */
  openUrl?: string
  /** Le client doit vider son scrollback. */
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
    return this.journey.banner
      .split('\n')
      .map((text) => ({ spans: [{ text, style: 'plain' as const }] }))
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
          // Un parcours d'entreprise n'a pas forcement de CV ni d'agenda a
          // ouvrir. Le dire vaut mieux qu'un clic qui ne fait rien.
          output.lines.push({
            spans: [{ text: 'Nothing set up here yet.', style: 'dim' }],
          })
        }
        break
      }
      case 'submitContact':
        // La charge est deja ici, cote serveur. Elle n'a aucune raison de
        // repartir vers le client puis de revenir par une route HTTP: le
        // nom, le mail et le message du candidat ne traversent jamais le
        // reseau une seconde fois.
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

    // L'effet ne doit pas partir vers le client: il porterait la charge de
    // contact, et le client n'a rien a en faire. Le transport lit `result`.
    result.output = { lines: output.lines, failed: output.failed }

    if (this.session.journal.length > MAX_EVENTS) result.done = true

    return result
  }

  complete(partial: string): string[] {
    return completeCore(this.session, this.journey.content, partial)
  }

  /**
   * Le core ne connait aucune URL, il emet un marqueur. C'est la facade qui
   * traduit, et elle est la seule a savoir ce que ce parcours a configure.
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
      console.error('knockport: journal non ecrit', error)
    }
  }
}
