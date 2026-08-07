import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import './helpers.ts'
import { attachSession } from '../src/session/attach.ts'
import { upsertJourney, type JourneyDraft } from '../src/db/studio.ts'
import { getDb } from '../src/db/index.ts'

/**
 * Integration test for the real WebSocket protocol. The browser connects to
 * /ws/<slug>, sends JSON frames, and the server replies with ready/output/
 * complete/closed. Here the same transport is exercised in-process: a real
 * ws server, the real attachSession, and a real client socket.
 */

function draft(overrides: Partial<JourneyDraft> = {}): JourneyDraft {
  return {
    slug: 'acme',
    companyName: 'Acme',
    website: 'https://acme.example',
    title: 'Working at Acme',
    banner: 'Welcome to Acme.',
    notice: null,
    sections: [
      { name: 'whoami', title: 'who we are', body: 'We are Acme.', order: 1, hidden: false },
    ],
    published: true,
    ...overrides,
  }
}

let httpServer: ReturnType<typeof createServer>
let wss: WebSocketServer
let url: string

beforeAll(async () => {
  httpServer = createServer()
  wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', (ws, req) => {
    const slug = (req.url ?? '/ws/').replace(/^\/ws\//, '').replace(/[^a-z0-9-]/g, '')
    attachSession(ws as WebSocket, slug)
  })
  httpServer.listen(0)
  await once(httpServer, 'listening')
  const addr = httpServer.address() as { port: number }
  url = `ws://127.0.0.1:${addr.port}`
})

afterAll(() => {
  wss.close()
  httpServer.close()
})

/** Connects, returns a helper that sends a frame and collects messages. */
async function connect(slug: string) {
  const ws = new WebSocket(`${url}/ws/${slug}`)
  const messages: unknown[] = []
  ws.on('message', (data) => messages.push(JSON.parse(String(data))))
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  // wait for the ready frame
  await new Promise((r) => setTimeout(r, 20))
  return { ws, messages, send: (m: unknown) => ws.send(JSON.stringify(m)) }
}

function flatten(messages: unknown[]): string[] {
  return messages.flatMap((m) => {
    const mm = m as { t: string; lines?: { spans: { text: string }[] }[] }
    if (mm.t === 'ready' || mm.t === 'output') {
      return mm.lines!.map((l) => l.spans.map((s) => s.text).join(''))
    }
    return [JSON.stringify(m)]
  })
}

describe('websocket protocol', () => {
  it('greets with a ready frame, then ls lists the journey', async () => {
    upsertJourney(draft())
    const { ws, messages, send } = await connect('acme')
    expect(messages[0]).toMatchObject({ t: 'ready' })

    send({ t: 'exec', input: 'ls' })
    await new Promise((r) => setTimeout(r, 20))
    const text = flatten(messages)
    expect(text).toContain('Welcome to Acme.')
    expect(text.some((l) => l.includes('whoami'))).toBe(true)
    ws.close()
  })

  it('answers complete with command candidates', async () => {
    upsertJourney(draft())
    const { ws, messages, send } = await connect('acme')
    send({ t: 'complete', partial: 'w' })
    await new Promise((r) => setTimeout(r, 20))
    const complete = messages.find((m) => (m as { t: string }).t === 'complete') as {
      candidates: string[]
    }
    expect(complete.candidates).toContain('whoami')
    ws.close()
  })

  it('closes with a reason for an unknown journey', async () => {
    const { ws, messages } = await connect('nope')
    await new Promise((r) => setTimeout(r, 20))
    const closed = messages.find((m) => (m as { t: string }).t === 'closed') as {
      reason: string
    }
    expect(closed.reason).toContain('Journey unavailable')
    ws.close()
  })

  it('runs a full contact flow and lands the candidate in the inbox', async () => {
    upsertJourney(draft())
    const { ws, messages, send } = await connect('acme')
    send({ t: 'exec', input: 'contact' })
    await new Promise((r) => setTimeout(r, 20))
    send({ t: 'exec', input: 'Ada' })
    await new Promise((r) => setTimeout(r, 20))
    send({ t: 'exec', input: 'ada@example.com' })
    await new Promise((r) => setTimeout(r, 20))
    send({ t: 'exec', input: 'Interested.' })
    await new Promise((r) => setTimeout(r, 20))

    const text = flatten(messages)
    expect(text.some((l) => l.includes('Sent.'))).toBe(true)
    ws.close()
    await new Promise((r) => setTimeout(r, 20))

    const row = getDb().prepare('SELECT name, email FROM candidate_contacts').get() as
      | { name: string; email: string }
      | undefined
    expect(row?.name).toBe('Ada')
    expect(row?.email).toBe('ada@example.com')
  })

  it('journals the session when the socket closes', async () => {
    upsertJourney(draft())
    const { ws, send } = await connect('acme')
    send({ t: 'exec', input: 'whoami' })
    await new Promise((r) => setTimeout(r, 20))
    ws.close()
    await new Promise((r) => setTimeout(r, 30))

    const journeyId = (
      getDb().prepare('SELECT id FROM journeys WHERE slug = ?').get('acme') as { id: string }
    ).id
    const events = getDb()
      .prepare('SELECT input FROM session_events WHERE journey_id = ?')
      .all(journeyId) as { input: string }[]
    expect(events.map((e) => e.input)).toContain('whoami')
  })

  it('handles many concurrent sessions independently', async () => {
    upsertJourney(draft())
    const sockets = await Promise.all(
      Array.from({ length: 10 }, () => connect('acme')),
    )
    for (const s of sockets) s.send({ t: 'exec', input: 'ls' })
    await new Promise((r) => setTimeout(r, 40))
    for (const s of sockets) {
      const text = flatten(s.messages)
      expect(text.some((l) => l.includes('whoami'))).toBe(true)
      s.ws.close()
    }
  })
})
