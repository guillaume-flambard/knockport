import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
import next from 'next'
import { WebSocketServer, type WebSocket } from 'ws'

import { TerminalSession } from './src/session/manager.ts'
import { seedIfEmpty } from './src/journey/seed-demo.ts'
import type { ClientMessage, ServerMessage } from '@knockport/terminal/protocol'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOSTNAME ?? '0.0.0.0'

/** A frame larger than 8 KB is not a terminal command. */
const MAX_FRAME_BYTES = 8 * 1024

const app = next({ dev, hostname, port })

// prepare() first: getUpgradeHandler() throws until Next's internal server
// is built.
await app.prepare()

const handleHttp = app.getRequestHandler()
const handleUpgrade = app.getUpgradeHandler()

const server = createServer((req, res) => {
  handleHttp(req, res).catch((error: unknown) => {
    console.error('knockport: HTTP error', error)
    res.statusCode = 500
    res.end('internal error')
  })
})

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })

/**
 * Next.js manages its own WebSocket in development for hot reloading.
 * So we only intercept `/ws/<slug>` and hand control back to Next for
 * everything else, otherwise hot reload breaks.
 */
server.on('upgrade', (req, socket: Duplex, head) => {
  const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname
  const match = /^\/ws\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path)

  if (!match) {
    // Anything that isn't a journey goes back to Next, which has its own
    // WebSocket for hot reloading in development.
    handleUpgrade(req, socket, head).catch((error: unknown) => {
      console.error('knockport: Next refused the upgrade', path, error)
      socket.destroy()
    })
    return
  }

  const slug = match[1] as string
  wss.handleUpgrade(req, socket, head, (ws) => attach(ws, slug))
})

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

function attach(ws: WebSocket, slug: string): void {
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
      ...(result.openUrl ? { openUrl: result.openUrl } : {}),
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

// On a fresh volume, the database is empty and the demo journey is not there.
// Creating it here avoids a separate deployment step.
seedIfEmpty()

server.listen(port, hostname, () => {
  console.log(`knockport on http://${hostname}:${port}`)
})
