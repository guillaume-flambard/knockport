import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * The studio's auth is a single passphrase, chosen to match the product at
 * this stage: one person building journeys for the companies that already
 * exist. When companies can sign up on their own, this is replaced by the
 * recruiters table that schema.sql already reserves a spot for.
 */

const COOKIE_NAME = 'knockport_studio'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14

/** The signing key. A missing passphrase means the studio is closed. */
function key(): string | null {
  const pass = process.env.KNOCKPORT_STUDIO_PASS
  if (!pass) return null
  return createHmac('sha256', 'knockport-studio-v1').update(pass).digest('base64url')
}

function sign(value: string): string {
  const mac = createHmac('sha256', key() as string).update(value).digest('base64url')
  return `${value}.${mac}`
}

function verify(token: string | undefined): boolean {
  if (!token || !key()) return false
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0) return false
  const value = token.slice(0, lastDot)
  const mac = token.slice(lastDot + 1)
  const expected = createHmac('sha256', key() as string).update(value).digest('base64url')
  // The value is opaque to the server anyway (it is never read back), but
  // comparing the signature in constant time is the cheap, correct habit.
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** True when the studio is open and this request carries a valid cookie. */
export async function isAuthed(): Promise<boolean> {
  const jar = await cookies()
  return verify(jar.get(COOKIE_NAME)?.value)
}

/** Sets the studio cookie. The value is a random nonce that only needs to be
 *  unforgeable, not meaningful. */
export async function setAuth(): Promise<void> {
  const jar = await cookies()
  const value = crypto.randomUUID()
  jar.set(COOKIE_NAME, sign(value), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/studio',
    maxAge: MAX_AGE_SECONDS,
  })}

export async function clearAuth(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}
