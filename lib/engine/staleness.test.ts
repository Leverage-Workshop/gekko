import { describe, it, expect } from 'vitest'
import {
  assessStaleness,
  DEFAULT_STALENESS_MARGIN_MS,
} from './staleness'

// Fixed "now" so every age is deterministic.
const NOW = '2026-06-27T15:00:00.000Z'
const NOW_MS = Date.parse(NOW)

/** receivedAt that is `seconds` before NOW. */
function ago(seconds: number): string {
  return new Date(NOW_MS - seconds * 1000).toISOString()
}

describe('assessStaleness — freshness boundary', () => {
  it('a brand-new bundle (~30s old export) is fresh', () => {
    const r = assessStaleness({ receivedAt: ago(30), now: NOW })
    expect(r.isStale).toBe(false)
    expect(r.hasData).toBe(true)
    expect(r.ageSeconds).toBe(30)
    expect(r.warning).toBeNull()
    expect(r.marginMs).toBe(DEFAULT_STALENESS_MARGIN_MS)
  })

  it('exactly at the margin is still fresh (strictly-greater is stale)', () => {
    const margin = 60_000
    const r = assessStaleness({ receivedAt: ago(60), now: NOW, marginMs: margin })
    expect(r.ageMs).toBe(margin)
    expect(r.isStale).toBe(false)
    expect(r.warning).toBeNull()
  })

  it('one millisecond past the margin is stale', () => {
    const margin = 60_000
    const r = assessStaleness({ receivedAt: NOW_MS - (margin + 1), now: NOW, marginMs: margin })
    expect(r.isStale).toBe(true)
    expect(r.warning).toMatch(/STALE/)
  })

  it('well past the default margin is stale with an age-bearing warning', () => {
    const r = assessStaleness({ receivedAt: ago(10 * 60), now: NOW })
    expect(r.isStale).toBe(true)
    expect(r.hasData).toBe(true)
    expect(r.ageSeconds).toBe(600)
    expect(r.warning).toMatch(/10m 0s old/)
    expect(r.warning).toMatch(/offline/)
  })
})

describe('assessStaleness — no data', () => {
  it.each([null, undefined, 'not-a-date'])(
    'treats %s receivedAt as maximally stale with no data',
    (bad) => {
      const r = assessStaleness({ receivedAt: bad as never, now: NOW })
      expect(r.isStale).toBe(true)
      expect(r.hasData).toBe(false)
      expect(r.ageMs).toBe(Infinity)
      expect(r.ageSeconds).toBe(Infinity)
      expect(r.receivedAt).toBeNull()
      expect(r.warning).toMatch(/No bundle available/)
    },
  )
})

describe('assessStaleness — input handling', () => {
  it('accepts ISO string, epoch ms, and Date for receivedAt', () => {
    const iso = assessStaleness({ receivedAt: ago(45), now: NOW })
    const ms = assessStaleness({ receivedAt: NOW_MS - 45_000, now: NOW })
    const date = assessStaleness({ receivedAt: new Date(NOW_MS - 45_000), now: NOW })
    expect(iso.ageSeconds).toBe(45)
    expect(ms.ageSeconds).toBe(45)
    expect(date.ageSeconds).toBe(45)
  })

  it('clamps a future-dated bundle (clock skew) to fresh, not negative-age', () => {
    const r = assessStaleness({ receivedAt: new Date(NOW_MS + 5_000), now: NOW })
    expect(r.ageMs).toBe(0)
    expect(r.isStale).toBe(false)
  })

  it('normalises receivedAt and evaluatedAt to ISO', () => {
    const r = assessStaleness({ receivedAt: NOW_MS - 30_000, now: NOW })
    expect(r.evaluatedAt).toBe(NOW)
    expect(r.receivedAt).toBe(new Date(NOW_MS - 30_000).toISOString())
  })

  it('defaults `now` to the wall clock when omitted', () => {
    const r = assessStaleness({ receivedAt: new Date() })
    expect(r.isStale).toBe(false)
    expect(r.hasData).toBe(true)
  })

  it.each([0, -1, NaN, Infinity])('rejects non-positive/non-finite margin %s', (m) => {
    expect(() => assessStaleness({ receivedAt: ago(10), now: NOW, marginMs: m })).toThrow(
      /marginMs/,
    )
  })

  it('rejects an invalid `now`', () => {
    expect(() => assessStaleness({ receivedAt: ago(10), now: 'nope' })).toThrow(/now/)
  })
})
