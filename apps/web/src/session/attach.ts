import type { WebSocket } from 'ws'
import { TerminalSession } from './manager.ts'
import type { ClientMessage, ServerMessage } from '@knockport/terminal/protocol'

/** A frame larger than 8 KB is not a terminal command. */
export const MAX_FRAME_BYTES = 8 * 1024

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

/**
 * Wires one WebSocket connection to a terminal session. Extracted from the
 * server so the protocol layer can be tested without booting Next: a test
 * opens a WebSocketServer, calls this with the raw socket, and drives the
 * same JSON frames the browser sends.
 */
export function attachSession(ws: WebSocket, slug: string): void {
  const session = TerminalSession.open(slug)

  if (!session) {
    send(ws, { t: 'closed', reason: 'Journey unavailable. Reload to try again.' })
    ws.close()
    return
  }

  send(ws, { t: 'ready', lines: session.banner(), prompt: session.prompt })

  ws.on('message', (raw) => {
    if (session.expired()) {
      send(ws, { t: 'closed', reason: 'Session expired. Reload to start again.' })
      ws.close()
      return
    }

    let message: ClientMessage
    try {
      message = JSON.parse(String(raw)) as ClientMessage
    } catch {
      return
    }

    if (message.t === 'complete') {
      send(ws, { t: 'complete', candidates: session.complete(message.partial) })
      return
    }

    if (message.t !== 'exec' || typeof message.input !== 'string') return

    const result = session.exec(message.input)
    send(ws, {
      t: 'output',
      lines: result.output.lines,
      prompt: result.prompt,
      clear: result.clear,
    })

    if (result.done) {
      send(ws, { t: 'closed', reason: 'Session closed. Reload to start again.' })
      ws.close()
    }
  })

  // The log goes to the database here, in one transaction. This is the only
  // time we write: logging keystroke by keystroke would cost a disk write per
  // keystroke.
  ws.on('close', () => session.close())
  ws.on('error', () => session.close())
}
