import type { Line, Span } from '@knockport/core'
import type { ClientMessage, ServerMessage } from './protocol.ts'

/**
 * Le client terminal. Il ne contient pas le moteur: celui ci tourne cote
 * serveur et parle par WebSocket, a l'image du js-sdk d'Ojin. Ce fichier ne
 * fait que construire le terminal, le peindre et capturer des touches.
 *
 * Il construit son propre DOM a partir d'un point de montage vide, et c'est
 * volontaire: React ne doit rien posseder ici. Rendre le scrollback cote
 * serveur puis le remplir en JavaScript faisait echouer l'hydratation, et un
 * script pose dans l'arbre React ne s'execute pas apres une navigation client.
 *
 * Regle absolue de rendu: `textContent`, jamais `innerHTML`. Le mode contact
 * reaffiche la saisie du visiteur dans le scrollback, donc un
 * `your name> <img onerror=...>` serait execute. `textContent` rend le
 * probleme inexistant par construction plutot que par echappement.
 */

const mount = document.querySelector<HTMLElement>('[data-journey]')
if (!mount) throw new Error('knockport: point de montage absent')

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

// --- construction du terminal ------------------------------------------------

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

// --- rendu -------------------------------------------------------------------

/** Historique local: la fleche haut doit repondre sans aller retour reseau. */
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
        if (message.openUrl) window.open(message.openUrl, '_blank', 'noopener,noreferrer')
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

  // Se figer sans rien dire est la pire des reponses: le visiteur croit que le
  // produit est casse. On le dit, en clair.
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

// --- saisie ------------------------------------------------------------------

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
  // Entree est gerée ici plutot que de dependre de la soumission implicite du
  // formulaire, qui ne se declenche pas de la meme facon selon le navigateur
  // et les methodes de saisie. Le `submit` du formulaire reste branche pour le
  // bouton, qui est la voie clavier des technologies d'assistance.
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

// Le focus revient sur la saisie quand on clique n'importe ou dans la fenetre,
// sauf si le visiteur est en train de selectionner du texte pour le copier.
mount.addEventListener('click', () => {
  if (window.getSelection()?.toString() === '') input.focus()
})

connect()
