import type { Line } from '@knockport/core'

/**
 * The terminal session protocol, deliberately minimal.
 *
 * It is imported as `import type` on both sides, so it is erased at
 * compilation and weighs nothing in the client bundle.
 */

export type ClientMessage =
  | { t: 'exec'; input: string }
  | { t: 'complete'; partial: string }

export type ServerMessage =
  /** First frame after connection: the banner and initial prompt. */
  | { t: 'ready'; lines: Line[]; prompt: string }
  /** Response to an `exec`. `clear` empties the scrollback. */
  | { t: 'output'; lines: Line[]; prompt: string; clear: boolean }
  /** Response to a `complete`. Empty if nothing matches. */
  | { t: 'complete'; candidates: string[] }
  /** Server closing: `exit`, expiration, or limit reached. */
  | { t: 'closed'; reason: string }
