import { describe, expect, it } from 'vitest'
import { isRateLimited, resetRateLimits, rateLimitSize } from '../src/session/rate-limit.ts'

describe('rate-limit', () => {
  it('allows requests up to the limit, then blocks', () => {
    resetRateLimits()
    for (let i = 1; i <= 5; i++) expect(isRateLimited('k1', 5)).toBe(false)
    expect(isRateLimited('k1', 5)).toBe(true)
    expect(isRateLimited('k1', 5)).toBe(true)
  })

  it('tracks keys independently', () => {
    resetRateLimits()
    expect(isRateLimited('a', 2)).toBe(false)
    expect(isRateLimited('b', 2)).toBe(false)
    expect(isRateLimited('a', 2)).toBe(false)
    expect(isRateLimited('a', 2)).toBe(true)
    expect(isRateLimited('b', 2)).toBe(false)
  })

  it('reset gives a fresh slate', () => {
    resetRateLimits()
    isRateLimited('x', 1)
    expect(isRateLimited('x', 1)).toBe(true)
    resetRateLimits()
    expect(isRateLimited('x', 1)).toBe(false)
  })
})
