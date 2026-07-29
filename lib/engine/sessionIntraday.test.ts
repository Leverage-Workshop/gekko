import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { parseExecBars, type ExecBar } from './parseExecBars'
import {
  computeSessionIntraday,
  resampleBars,
  OTF_TIMEFRAME_MINUTES,
} from './sessionIntraday'

const FIXTURE = join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv')

/** Synthetic exec bar: flat OHLC at `price` unless high/low/close overridden. */
function mkBar(
  time: string | Date,
  price: number,
  over: Partial<Pick<ExecBar, 'open' | 'high' | 'low' | 'close' | 'delta' | 'volume'>> = {},
): ExecBar {
  return {
    dateTime: time instanceof Date ? time : new Date(time),
    open: over.open ?? price,
    high: over.high ?? price,
    low: over.low ?? price,
    close: over.close ?? price,
    legVWAP: 0,
    deltaIntensity: 0,
    volume: over.volume ?? 750,
    bidVolume: 375,
    askVolume: 375,
    numberOfTrades: 100,
    delta: over.delta ?? 0,
  }
}

/** Bars every `stepMin` minutes from `start`, prices supplied per bar. */
function seriesFrom(
  start: string,
  stepMin: number,
  prices: readonly { p: number; high?: number; low?: number; delta?: number }[],
): ExecBar[] {
  const t0 = new Date(start).getTime()
  return prices.map((row, i) =>
    mkBar(new Date(t0 + i * stepMin * 60_000), row.p, {
      high: row.high,
      low: row.low,
      delta: row.delta,
    }),
  )
}

describe('resampleBars', () => {
  it('groups volume bars into time buckets and aggregates OHLC/volume/delta', () => {
    const bars = [
      mkBar('2026-07-29T11:01:00', 100, { open: 100, high: 105, low: 99, close: 104, delta: 10 }),
      mkBar('2026-07-29T11:03:30', 104, { high: 110, low: 103, close: 108, delta: -5 }),
      mkBar('2026-07-29T11:06:00', 108, { high: 112, low: 107, close: 111, delta: 20 }),
    ]
    const out = resampleBars(bars, 5)

    expect(out).toHaveLength(2)
    expect(out[0].open).toBe(100)
    expect(out[0].high).toBe(110)
    expect(out[0].low).toBe(99)
    expect(out[0].close).toBe(108)
    expect(out[0].volume).toBe(1500)
    expect(out[0].delta).toBe(5)
    expect(out[1].open).toBe(108)
    expect(out[1].delta).toBe(20)
  })
})

describe('computeSessionIntraday', () => {
  it('throws on an empty series', () => {
    expect(() => computeSessionIntraday([], null)).toThrow()
  })

  it('reads partial coverage from a mid-session export and nulls session anchors', () => {
    const bars = seriesFrom(
      '2026-07-29T11:00:00',
      15,
      [100, 101, 102, 103].map((p) => ({ p })),
    )
    const facts = computeSessionIntraday(bars, 103)

    expect(facts.coverage).toBe('partial')
    expect(facts.vwap).toBeNull()
    expect(facts.cumulativeDelta).toBeNull()
    expect(facts.sessionDate).toBe('2026-07-29')
  })

  it('reads full coverage from a Globex-open export and dates the session to the next day', () => {
    const bars = seriesFrom(
      '2026-07-28T17:02:00',
      30,
      Array.from({ length: 10 }, () => ({ p: 100 })),
    )
    const facts = computeSessionIntraday(bars, 100)

    expect(facts.coverage).toBe('full')
    expect(facts.sessionDate).toBe('2026-07-29')
    expect(facts.vwap).not.toBeNull()
    expect(facts.cumulativeDelta).not.toBeNull()
  })

  it('computes the Globex session VWAP with distance and position', () => {
    // Flat trade at 100 → VWAP is exactly 100.
    const bars = seriesFrom(
      '2026-07-28T17:00:00',
      30,
      Array.from({ length: 8 }, () => ({ p: 100 })),
    )
    const facts = computeSessionIntraday(bars, 110)

    expect(facts.vwap?.globex.value).toBe(100)
    expect(facts.vwap?.globex.distancePts).toBe(10)
    expect(facts.vwap?.globex.position).toBe('above')
    // All bars pre-08:30 → no RTH anchor yet.
    expect(facts.vwap?.rth).toBeNull()
    expect(facts.cumulativeDelta?.rth).toBeNull()
  })

  it('reads a rising VWAP slope when late trade lifts the average', () => {
    const prices = [
      ...Array.from({ length: 12 }, () => ({ p: 100 })),
      ...Array.from({ length: 7 }, () => ({ p: 200 })),
    ]
    const bars = seriesFrom('2026-07-28T17:00:00', 5, prices)
    const facts = computeSessionIntraday(bars, 200)

    expect(facts.vwap?.globex.slope).toBe('rising')
    expect(facts.vwap?.globex.slopePtsPer30Min).toBeGreaterThan(2)
  })

  it('anchors an RTH VWAP and cumulative delta once RTH bars exist', () => {
    const overnight = seriesFrom(
      '2026-07-28T17:00:00',
      60,
      Array.from({ length: 15 }, () => ({ p: 100, delta: 10 })),
    )
    const rth = seriesFrom(
      '2026-07-29T08:30:00',
      5,
      Array.from({ length: 12 }, () => ({ p: 120, delta: -20 })),
    )
    const facts = computeSessionIntraday([...overnight, ...rth], 120)

    expect(facts.vwap?.rth?.value).toBe(120)
    expect(facts.vwap?.globex.value).toBeGreaterThan(100)
    expect(facts.vwap?.globex.value).toBeLessThan(120)
    expect(facts.cumulativeDelta?.globex.total).toBe(15 * 10 + 12 * -20)
    expect(facts.cumulativeDelta?.rth?.total).toBe(12 * -20)
  })

  it('reads the cumulative-delta trend from the last 30 minutes', () => {
    const prices = [
      ...Array.from({ length: 12 }, () => ({ p: 100, delta: 0 })),
      ...Array.from({ length: 6 }, () => ({ p: 100, delta: 30 })),
    ]
    const bars = seriesFrom('2026-07-28T17:00:00', 5, prices)
    const facts = computeSessionIntraday(bars, 100)

    // Bars strictly inside the last 30 min: 6 × 30 = 180 > epsilon → rising.
    expect(facts.cumulativeDelta?.globex.last30MinChange).toBe(180)
    expect(facts.cumulativeDelta?.globex.trend).toBe('rising')
  })

  it('reads up one-timeframing from ascending 15-min lows', () => {
    // One exec bar per 15-min bucket; last bar is the developing one.
    const bars = seriesFrom('2026-07-29T11:00:00', OTF_TIMEFRAME_MINUTES, [
      { p: 100, low: 100, high: 105 },
      { p: 101, low: 101, high: 106 },
      { p: 102, low: 102, high: 107 },
      { p: 103, low: 103, high: 108 },
      { p: 104, low: 104, high: 109 },
      { p: 105, low: 105, high: 110 }, // developing
    ])
    const facts = computeSessionIntraday(bars, 105)

    expect(facts.oneTimeframing?.state).toBe('up')
    expect(facts.oneTimeframing?.barsHeld).toBe(4)
    expect(facts.oneTimeframing?.since).toBe('2026-07-29 11:15')
    expect(facts.oneTimeframing?.breakLevel).toBe(104)
    expect(facts.oneTimeframing?.developingBarBroke).toBe(false)
  })

  it('reads down one-timeframing from descending 15-min highs', () => {
    const bars = seriesFrom('2026-07-29T11:00:00', OTF_TIMEFRAME_MINUTES, [
      { p: 110, low: 105, high: 110 },
      { p: 109, low: 104, high: 109 },
      { p: 108, low: 103, high: 108 },
      { p: 107, low: 102, high: 107 },
      { p: 106, low: 101, high: 106 }, // developing
    ])
    const facts = computeSessionIntraday(bars, 106)

    expect(facts.oneTimeframing?.state).toBe('down')
    expect(facts.oneTimeframing?.breakLevel).toBe(107)
  })

  it('flags the developing bar breaking the run in real time', () => {
    const bars = seriesFrom('2026-07-29T11:00:00', OTF_TIMEFRAME_MINUTES, [
      { p: 100, low: 100, high: 105 },
      { p: 101, low: 101, high: 106 },
      { p: 102, low: 102, high: 107 },
      { p: 103, low: 103, high: 108 },
      { p: 99, low: 99, high: 104 }, // developing bar trades through 103
    ])
    const facts = computeSessionIntraday(bars, 99)

    expect(facts.oneTimeframing?.state).toBe('up')
    expect(facts.oneTimeframing?.developingBarBroke).toBe(true)
  })

  it('reads two-timeframing (none) when an outside bar breaks both runs', () => {
    const bars = seriesFrom('2026-07-29T11:00:00', OTF_TIMEFRAME_MINUTES, [
      { p: 100, low: 100, high: 105 },
      { p: 101, low: 101, high: 106 },
      { p: 102, low: 99, high: 108 }, // outside bar: lower low AND higher high
      { p: 102, low: 99, high: 108 }, // developing
    ])
    const facts = computeSessionIntraday(bars, 102)

    expect(facts.oneTimeframing?.state).toBe('none')
    expect(facts.oneTimeframing?.barsHeld).toBe(0)
    expect(facts.oneTimeframing?.breakLevel).toBeNull()
  })

  it('returns null one-timeframing when too few completed bars exist', () => {
    const bars = seriesFrom('2026-07-29T11:00:00', OTF_TIMEFRAME_MINUTES, [
      { p: 100 },
      { p: 101 },
      { p: 102 },
    ])
    expect(computeSessionIntraday(bars, 102).oneTimeframing).toBeNull()
  })

  it('handles the real export fixture (rolling window captured at 21:52 — covers the young Globex session)', () => {
    const bars = parseExecBars(readFileSync(FIXTURE, 'utf8'))
    const facts = computeSessionIntraday(bars, 29945.75)

    // The fixture reaches back to the PRIOR session's RTH, but the current
    // session (Globex reopen 17:00 → 21:52) is fully covered from its open.
    expect(facts.sessionDate).toBe('2026-07-10')
    expect(facts.coverage).toBe('full')
    expect(facts.vwap?.globex.value).toBeGreaterThan(29000)
    expect(facts.vwap?.rth).toBeNull()
    expect(facts.cumulativeDelta?.globex).toBeDefined()
    expect(facts.oneTimeframing).not.toBeNull()
    expect(facts.barCount).toBe(bars.length)
  })
})
