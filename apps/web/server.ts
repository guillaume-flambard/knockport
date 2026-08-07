import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
import next from 'next'
import { WebSocketServer, type WebSocket } from 'ws'

import { seedIfEmpty } from './src/journey/seed-demo.ts'
import { attachSession, MAX_FRAME_BYTES } from './src/session/attach.ts'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOSTNAME ?? '0.0.0.0'

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

function attach(ws: WebSocket, slug: string): void {
  attachSession(ws, slug)
}

// On a fresh volume, the database is empty and the demo journey is not there.
// Creating it here avoids a separate deployment step.
seedIfEmpty()

server.listen(port, hostname, () => {
  console.log(`knockport on http://${hostname}:${port}`)
})
