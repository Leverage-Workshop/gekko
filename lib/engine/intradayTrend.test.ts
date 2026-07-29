import { describe, expect, it } from 'vitest'
import type { ExecBar } from './parseExecBars'
import { computeSessionIntraday } from './sessionIntraday'
import { computeIntradayTrend, type IntradayTrendFacts } from './intradayTrend'

/** Synthetic exec bar: flat OHLC at `price` unless overridden. */
function mkBar(
  time: Date,
  price: number,
  over: Partial<Pick<ExecBar, 'high' | 'low' | 'close' | 'delta'>> = {},
): ExecBar {
  return {
    dateTime: time,
    open: price,
    high: over.high ?? price,
    low: over.low ?? price,
    close: over.close ?? price,
    legVWAP: 0,
    deltaIntensity: 0,
    volume: 750,
    bidVolume: 375,
    askVolume: 375,
    numberOfTrades: 100,
    delta: over.delta ?? 0,
  }
}

function seriesFrom(
  start: string,
  stepMin: number,
  rows: readonly { p: number; high?: number; low?: number; delta?: number }[],
): ExecBar[] {
  const t0 = new Date(start).getTime()
  return rows.map((row, i) =>
    mkBar(new Date(t0 + i * stepMin * 60_000), row.p, {
      high: row.high,
      low: row.low,
      delta: row.delta,
    }),
  )
}

function trendOf(bars: ExecBar[], price: number, rip: 'green' | 'yellow' | 'red' | null): IntradayTrendFacts {
  return computeIntradayTrend({
    bars,
    sessionIntraday: computeSessionIntraday(bars, price),
    ripCondition: rip,
    currentPrice: price,
  })
}

describe('computeIntradayTrend', () => {
  it('throws on an empty series', () => {
    expect(() =>
      computeIntradayTrend({
        bars: [],
        sessionIntraday: computeSessionIntraday(
          seriesFrom('2026-07-28T17:00:00', 5, [{ p: 100 }]),
          100,
        ),
        ripCondition: null,
        currentPrice: 100,
      }),
    ).toThrow()
  })

  it('reads a strong up trend when structure, flow, VWAP and Rip all align', () => {
    // Full session from the Globex open, +4 pts per 5-min bar, blue delta.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      p: 27000 + i * 4,
      low: 27000 + i * 4 - 1,
      high: 27000 + i * 4 + 1,
      delta: 40,
    }))
    const bars = seriesFrom('2026-07-28T17:00:00', 5, rows)
    const price = rows[rows.length - 1].p
    const facts = trendOf(bars, price, 'green')

    expect(facts.direction).toBe('up')
    expect(facts.conviction).toBe('strong')
    expect(facts.character).toBe('trending')
    expect(facts.components.momentum.majority).toBe('up')
    expect(facts.components.oneTimeframing?.vote).toBe('up')
    expect(facts.components.flow.direction).toBe('up')
    expect(facts.components.frame.vwapPosition).toBe('above')
    expect(facts.disagreements).toEqual([])
  })

  it('reads a strong down trend on the mirrored tape', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      p: 28000 - i * 4,
      low: 28000 - i * 4 - 1,
      high: 28000 - i * 4 + 1,
      delta: -40,
    }))
    const bars = seriesFrom('2026-07-28T17:00:00', 5, rows)
    const price = rows[rows.length - 1].p
    const facts = trendOf(bars, price, 'red')

    expect(facts.direction).toBe('down')
    expect(facts.conviction).toBe('strong')
    expect(facts.components.frame.vwapPosition).toBe('below')
  })

  it('reads neutral with rotational character on a flat tape', () => {
    const rows = Array.from({ length: 60 }, () => ({ p: 27000 }))
    const bars = seriesFrom('2026-07-28T17:00:00', 5, rows)
    const facts = trendOf(bars, 27000, 'green')

    expect(facts.direction).toBe('neutral')
    expect(facts.conviction).toBeNull()
    expect(facts.character).toBe('rotational')
  })

  it('surfaces hollow structure: up call against red session delta, weak conviction', () => {
    // Price grinds up but every bar's delta is red, price below no VWAP
    // conflict (rising tape keeps price above VWAP) — flow is the dissenter.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      p: 27000 + i * 4,
      low: 27000 + i * 4 - 1,
      high: 27000 + i * 4 + 1,
      delta: -40,
    }))
    const bars = seriesFrom('2026-07-28T17:00:00', 5, rows)
    const price = rows[rows.length - 1].p
    const facts = trendOf(bars, price, 'yellow')

    expect(facts.direction).toBe('up')
    // VWAP above confirms (1), flow disagrees, rip yellow confirms nothing.
    expect(facts.conviction).toBe('moderate')
    expect(facts.disagreements.join(' ')).toMatch(/cumulative delta .* sides down/)
  })

  it('applies the Dow break rule: a rally through the last micro swing high flips micro structure up', () => {
    // Descending zigzag builds confirmed lower highs/lows, then a straight
    // rally through the last swing high without any new confirmed pivot.
    const zigzag = [
      140, 136, 132, 128, 124, 120,
      124, 128, 132, 134, 134.5, 135,
      130, 125, 120, 115, 110, 105,
      110, 114, 118, 120, 121, 122,
      118, 114, 110, 106, 102, 98,
    ]
    const rally = [102, 106, 110, 114, 118, 122, 126, 130]
    const rows = [...zigzag, ...rally].map((p) => ({ p, high: p + 0.5, low: p - 0.5 }))
    const bars = seriesFrom('2026-07-29T08:30:00', 5, rows)
    const facts = trendOf(bars, 130, null)

    expect(facts.components.microSwing.brokeAbove).toBe(true)
    expect(facts.components.microSwing.state).toBe('up')
    expect(facts.components.microSwing.basis).toMatch(/broke above/)
    expect(facts.direction).toBe('up')
  })

  it('withholds the one-timeframing vote when the developing bar broke the run', () => {
    // Ascending 15-min lows, then the developing bar trades through the prior low.
    const rows = [
      { p: 100, low: 100, high: 104 },
      { p: 101, low: 101, high: 105 },
      { p: 102, low: 102, high: 106 },
      { p: 103, low: 103, high: 107 },
      { p: 104, low: 104, high: 108 },
      { p: 100, low: 100, high: 105 }, // developing bar breaks 104
    ]
    const bars = seriesFrom('2026-07-29T09:00:00', 15, rows)
    const facts = trendOf(bars, 100, null)

    expect(facts.components.oneTimeframing?.state).toBe('up')
    expect(facts.components.oneTimeframing?.developingBarBroke).toBe(true)
    expect(facts.components.oneTimeframing?.vote).toBeNull()
    expect(facts.disagreements.join(' ')).toMatch(/developing 15-min bar/)
  })

  it('reads transitioning when the short momentum window turns against the long one', () => {
    // 3+ h of hard selling, then a sharp 15-min rally: the 180-min window is
    // still down, the 15-min window is up, the 60-min nets out flat.
    const down = Array.from({ length: 40 }, (_, i) => ({ p: 28000 - i * 6 }))
    const up = Array.from({ length: 3 }, (_, i) => ({ p: 27766 + (i + 1) * 15 }))
    const rows = [...down, ...up]
    const bars = seriesFrom('2026-07-29T08:30:00', 5, rows)
    const facts = trendOf(bars, rows[rows.length - 1].p, null)

    expect(facts.character).toBe('transitioning')
  })
})
