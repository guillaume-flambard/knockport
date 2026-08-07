import type { Line, Span } from '@knockport/core'
import type { ClientMessage, ServerMessage } from './protocol.ts'

/**
 * The terminal client. It does not contain the engine: that runs server-side
 * and is reached over a WebSocket. This file only builds the terminal,
 * renders it, and captures keypresses.
 *
 * It builds its own DOM from an empty mount point, and this is intentional:
 * React must not own anything here. Rendering the scrollback server-side
 * and filling it with JavaScript caused hydration to fail, and a script
 * placed in the React tree does not execute after client-side navigation.
 *
 * Absolute rendering rule: `textContent`, never `innerHTML`. Contact mode
 * echoes visitor input back into the scrollback, so a
 * `your name> <img onerror=...>` would execute. `textContent` makes the
 * problem nonexistent by construction rather than by escaping.
 */

const mount = document.querySelector<HTMLElement>('[data-journey]')
if (!mount) throw new Error('knockport: mount point missing')

const slug = mount.dataset.journey as string
const windowTitle = mount.dataset.title ?? ''

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

// --- terminal construction --------------------------------------------------

const chrome = el('div', 'chrome')
for (let i = 0; i < 3; i++) chrome.appendChild(el('span', 'dot'))
const title = el('span', 'title')
title.textContent = windowTitle
chrome.appendChild(title)

const scrollback = el('pre', 'scrollback')
scrollback.setAttribute('aria-live', 'polite')
scrollback.setAttribute('aria-atomic', 'false')

const label = el('label', 'visually-hidden')
label.htmlFor = 'cmd'
label.textContent = 'Type a command'

const sigil = el('span', 'sigil')

const input = el('input')
input.id = 'cmd'
input.autocomplete = 'off'
input.spellcheck = false
input.disabled = true

const submitButton = el('button', 'visually-hidden')
submitButton.type = 'submit'
submitButton.tabIndex = -1

const form = el('form', 'prompt')
form.append(label, sigil, input, submitButton)

const body = el('div', 'body')
body.append(scrollback, form)

const windowEl = el('div', 'window')
windowEl.append(chrome, body)
mount.appendChild(windowEl)

// --- rendering --------------------------------------------------------------

/** Local history: the up arrow must respond without network roundtrip. */
const history: string[] = []
let historyIndex = -1
let prompt = ''
let socket: WebSocket | undefined

function writeSpan(span: Span): void {
  const node = document.createElement('span')
  if (span.style !== 'plain') node.className = span.style
  node.textContent = span.text
  scrollback.appendChild(node)
}

function writeLines(lines: readonly Line[]): void {
  for (const line of lines) {
    for (const span of line.spans) writeSpan(span)
    scrollback.appendChild(document.createTextNode('\n'))
  }
  body.scrollTop = body.scrollHeight
}

function writeNotice(text: string): void {
  writeLines([{ spans: [{ text, style: 'accent' }] }])
}

function setPrompt(next: string): void {
  prompt = next
  sigil.textContent = next
}

function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function connect(): void {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${scheme}://${location.host}/ws/${slug}`)

  socket.addEventListener('message', (event) => {
    let message: ServerMessage
    try {
      message = JSON.parse(String(event.data)) as ServerMessage
    } catch {
      return
    }

    switch (message.t) {
      case 'ready':
        writeLines(message.lines)
        setPrompt(message.prompt)
        input.disabled = false
        input.focus()
        break

      case 'output':
        if (message.clear) scrollback.replaceChildren()
        writeLines(message.lines)
        setPrompt(message.prompt)
        break

      case 'complete':
        if (message.candidates.length === 1) {
          input.value = message.candidates[0] as string
        } else if (message.candidates.length > 1) {
          writeLines(message.candidates.map((c) => ({ spans: [{ text: c, style: 'dim' }] })))
        }
        break

      case 'closed':
        writeNotice(message.reason)
        input.disabled = true
        break
    }
  })

  // Freezing with no response is the worst answer: the visitor thinks the
  // product is broken. We tell them clearly.
  socket.addEventListener('close', () => {
    if (input.disabled) return
    input.disabled = true
    writeNotice('Connection lost. Reload to start again.')
  })

  socket.addEventListener('error', () => {
    input.disabled = true
    writeNotice('Could not reach the server. Reload to try again.')
  })
}

// --- input ------------------------------------------------------------------

function submit(): void {
  const typed = input.value
  if (typed.trim() === '' || input.disabled) return

  writeLines([{ spans: [{ text: `${prompt}${typed}`, style: 'plain' }] }])
  history.push(typed)
  historyIndex = history.length
  send({ t: 'exec', input: typed })
  input.value = ''
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  submit()
})

input.addEventListener('keydown', (event) => {
  // Enter is handled here rather than relying on the form's implicit
  // submission, which doesn't trigger the same way across browsers and input
  // methods. Form submit stays wired for the button, which is the keyboard
  // path for assistive technologies.
  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    if (input.value !== '') send({ t: 'complete', partial: input.value })
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (historyIndex > 0) {
      historyIndex -= 1
      input.value = history[historyIndex] as string
    }
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (historyIndex < history.length - 1) {
      historyIndex += 1
      input.value = history[historyIndex] as string
    } else {
      historyIndex = history.length
      input.value = ''
    }
  }
})

// Focus returns to the input when clicking anywhere in the window, unless
// the visitor is selecting text to copy.
mount.addEventListener('click', () => {
  if (window.getSelection()?.toString() === '') input.focus()
})

connect()
