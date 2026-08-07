import type { Line } from '@knockport/core'

/**
 * Le protocole de la session terminal, volontairement minuscule.
 *
 * Il est importe en `import type` des deux cotes, donc il est efface a la
 * compilation et ne pese rien dans le bundle client.
 */

export type ClientMessage =
  | { t: 'exec'; input: string }
  | { t: 'complete'; partial: string }

export type ServerMessage =
  /** Premiere trame apres connexion: la banniere et l'invite de depart. */
  | { t: 'ready'; lines: Line[]; prompt: string }
  /** Reponse a un `exec`. `clear` vide le scrollback, `openUrl` ouvre un onglet. */
  | { t: 'output'; lines: Line[]; prompt: string; clear: boolean; openUrl?: string }
  /** Reponse a un `complete`. Vide si rien ne correspond. */
  | { t: 'complete'; candidates: string[] }
  /** Le serveur ferme: `exit`, expiration, ou plafond atteint. */
  | { t: 'closed'; reason: string }
