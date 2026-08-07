/**
 * A tiny in-memory rate limiter for the two endpoints a script can hammer:
 * the studio login (brute force) and the contact submission (spam). Both are
 * currently protected only by a passphrase and a honeypot respectively, which
 * is not enough.
 *
 * In-memory by design: knockport runs on one machine with a single writer,
 * so per-process state is the whole fleet. A fixed window per key; the key is
 * derived from the request, never an IP address stored (the raw IP is used to
 * derive a key and then discarded, so nothing personal persists).
 */

type Bucket = { count: number; resetAt: number }

const windows = new Map<string, Bucket>()
const WINDOW_MS = 15 * 60 * 1000

/** Returns true when the key is over its limit. */
export function isRateLimited(key: string, max: number): boolean {
  const now = Date.now()
  const bucket = windows.get(key)
  if (!bucket || bucket.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  bucket.count += 1
  return bucket.count > max
}

/** Exposed for tests: a fresh slate between cases. */
export function resetRateLimits(): void {
  windows.clear()
}

/** The window holds a fixed count of keys; keep it from growing unbounded. */
export function rateLimitSize(): number {
  return windows.size
}
