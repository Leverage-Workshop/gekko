import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import { parseHtfBars } from './parseHtfBars'
import { computeAtr, computeHtfStructure, findPivots, SWING_PIVOT_STRENGTH } from './htfStructure'

/**
 * Builds a 30-min bar per path value: open=close=v, high=v+0.5, low=v−0.5, so
 * swing pivots land exactly where the path peaks/troughs are.
 */
function barsFromPath(values: readonly number[]): HtfBar[] {
  const start = new Date('2026-07-20T09:30:00')
  return values.map((v, i) => ({
    dateTime: new Date(start.getTime() + i * 30 * 60 * 1000),
    open: v,
    high: v + 0.5,
    low: v - 0.5,
    close: v,
    volume: 1000,
    bidVolume: 500,
    askVolume: 500,
    delta: 0,
  }))
}

// Zigzag with peaks at indices 5 (120) and 17 (135), troughs at 11 (105) and
// 23 (118) — each with SWING_PIVOT_STRENGTH(=5) strictly lower/higher bars on
// both sides. Higher highs + higher lows = uptrend.
const UP_PATH = [
  100, 104, 108, 112, 116, 120,
  116, 112, 108, 106, 105.5, 105,
  110, 115, 120, 125, 130, 135,
  130, 126, 122, 120, 119, 118,
  121, 124, 127, 130, 133, 136, 139,
]

const DOWN_PATH = UP_PATH.map((v) => 240 - v)

describe('computeHtfStructure', () => {
  it('throws on an empty bar set', () => {
    expect(() => computeHtfStructure([], null)).toThrow(/at least one bar/)
  })

  it('detects an uptrend from higher swing highs and higher swing lows', () => {
    const facts = computeHtfStructure(barsFromPath(UP_PATH), null)

    expect(facts.trend.state).toBe('up')
    expect(facts.trend.basis).toBe('higher swing highs and higher swing lows')
    expect(facts.recentSwingHighs.map((s) => s.price)).toEqual([135.5, 120.5])
    expect(facts.recentSwingLows.map((s) => s.price)).toEqual([117.5, 104.5])
  })

  it('detects a downtrend on the mirrored path', () => {
    const facts = computeHtfStructure(barsFromPath(DOWN_PATH), null)

    expect(facts.trend.state).toBe('down')
    expect(facts.trend.basis).toBe('lower swing highs and lower swing lows')
  })

  it('reads a mixed swing sequence as range', () => {
    // Equal peaks (120/120) with higher lows (105 → 110): not an aligned
    // higher-highs-and-higher-lows sequence, so no trend.
    const path = [
      100, 104, 108, 112, 116, 120,
      116, 112, 108, 106, 105.5, 105,
      108, 111, 114, 116, 118, 120,
      118, 116, 114, 112, 111, 110,
      112, 113, 114, 115, 116, 117,
    ]

    const facts = computeHtfStructure(barsFromPath(path), null)

    expect(facts.trend.state).toBe('range')
    expect(facts.trend.basis).toMatch(/mixed swing sequence/)
  })

  it('reads fewer than two swings per side as range (flat tape has no pivots)', () => {
    const facts = computeHtfStructure(barsFromPath(Array(20).fill(100)), null)

    expect(facts.trend.state).toBe('range')
    expect(facts.trend.basis).toMatch(/fewer than two confirmed swings/)
    expect(facts.recentSwingHighs).toEqual([])
    expect(facts.recentSwingLows).toEqual([])
    expect(facts.rotation).toBeNull()
    expect(facts.currentVsSwings.fromLastSwingHighPts).toBeNull()
    expect(facts.currentVsSwings.fromLastSwingLowAtr).toBeNull()
  })

  it('never confirms a swing inside the final strength window (partial bar cannot pivot)', () => {
    // A spike on the very last bar: higher than everything, but unconfirmed.
    const path = [...UP_PATH, 200]
    const facts = computeHtfStructure(barsFromPath(path), null)

    expect(facts.recentSwingHighs[0].price).toBe(135.5)
  })

  it('measures the rotation between the last confirmed swing high and low', () => {
    const facts = computeHtfStructure(barsFromPath(UP_PATH), null)

    expect(facts.rotation).not.toBeNull()
    expect(facts.rotation!.high).toBe(135.5)
    expect(facts.rotation!.low).toBe(117.5)
    expect(facts.rotation!.extentPts).toBe(18)
    expect(facts.rotation!.extentAtr).toBeGreaterThan(0)
  })

  it('dates each rotation leg so consumers cannot pass it off as the current range', () => {
    // UP_PATH pivots: swing high at index 17, swing low at index 23 — six bars
    // (3 h) apart, and neither is the newest bar. An undated span reads live.
    const facts = computeHtfStructure(barsFromPath(UP_PATH), null)

    expect(facts.rotation!.highDateTime).toBe('2026-07-20 18:00')
    expect(facts.rotation!.lowDateTime).toBe('2026-07-20 21:00')
    expect(facts.rotation!.highDateTime).toBe(facts.recentSwingHighs[0].dateTime)
    expect(facts.rotation!.lowDateTime).toBe(facts.recentSwingLows[0].dateTime)
  })

  it('normalizes current-price distance from the last swings by ATR', () => {
    const bars = barsFromPath(UP_PATH)
    const facts = computeHtfStructure(bars, 140)

    expect(facts.currentVsSwings.fromLastSwingHighPts).toBe(round2(140 - 135.5))
    expect(facts.currentVsSwings.fromLastSwingLowPts).toBe(round2(140 - 117.5))
    const atr = computeAtr(bars)
    expect(facts.atrPoints).toBe(atr)
    expect(facts.currentVsSwings.fromLastSwingHighAtr).toBe(
      Math.round(((140 - 135.5) / atr) * 10) / 10,
    )
  })

  it('falls back to the last close when no current price is available', () => {
    const facts = computeHtfStructure(barsFromPath(UP_PATH), null)

    expect(facts.lastClose).toBe(139)
    expect(facts.currentVsSwings.fromLastSwingHighPts).toBe(round2(139 - 135.5))
  })

  it('reports window metadata off the parsed bars', () => {
    const facts = computeHtfStructure(barsFromPath(UP_PATH), null)

    expect(facts.barsAnalyzed).toBe(UP_PATH.length)
    expect(facts.windowStart).toBe('2026-07-20 09:30')
    expect(facts.windowEnd).toMatch(/^2026-07-2\d \d\d:\d\d$/)
  })

  describe('trend integrity (feat-064)', () => {
    // DOWN_PATH mirror: last swing high 122.5, last swing low 104.5 (18-pt rotation).
    it('reads intact when the counter-move is inside normal rotation', () => {
      const facts = computeHtfStructure(barsFromPath(DOWN_PATH), 106)

      expect(facts.trend.state).toBe('down')
      expect(facts.trend.integrity).toBe('intact')
      expect(facts.trend.integrityBasis).toMatch(/retraced only/)
    })

    it('reads under-test when the counter-move retraces most of the rotation', () => {
      const facts = computeHtfStructure(barsFromPath(DOWN_PATH), 115)

      expect(facts.trend.state).toBe('down')
      expect(facts.trend.integrity).toBe('under-test')
      expect(facts.trend.integrityBasis).toMatch(/retraced ~58%/)
    })

    it('reads broken when price trades through the defining swing high of a downtrend', () => {
      const facts = computeHtfStructure(barsFromPath(DOWN_PATH), 123)

      expect(facts.trend.state).toBe('down')
      expect(facts.trend.integrity).toBe('broken')
      expect(facts.trend.integrityBasis).toMatch(/above the 122.5 defining swing high/)
    })

    it('reads broken when price trades through the defining swing low of an uptrend', () => {
      const facts = computeHtfStructure(barsFromPath(UP_PATH), 117)

      expect(facts.trend.state).toBe('up')
      expect(facts.trend.integrity).toBe('broken')
      expect(facts.trend.integrityBasis).toMatch(/below the 117.5 defining swing low/)
    })

    it('carries no integrity qualifier on a range state', () => {
      const facts = computeHtfStructure(barsFromPath(Array(20).fill(100)), 100)

      expect(facts.trend.state).toBe('range')
      expect(facts.trend.integrity).toBeNull()
      expect(facts.trend.integrityBasis).toBeNull()
    })
  })

  it('computes sane facts from the real sample export (chart-data/)', () => {
    const bars = parseHtfBars(
      readFileSync(join(process.cwd(), 'chart-data', 'htf_bar_data.rolling.csv'), 'utf-8'),
    )
    const facts = computeHtfStructure(bars, 29945.75)

    expect(facts.barsAnalyzed).toBe(bars.length)
    expect(facts.atrPoints).toBeGreaterThan(0)
    expect(facts.recentSwingHighs.length).toBeGreaterThan(0)
    expect(facts.recentSwingLows.length).toBeGreaterThan(0)
    expect(['up', 'down', 'range']).toContain(facts.trend.state)
  })
})

describe('findPivots tie handling (feat-117)', () => {
  // Equal peaks four bars apart — inside the ±SWING_PIVOT_STRENGTH window, so
  // under a symmetric strict rule each disqualifies the other and NEITHER
  // confirms. The 2026-08-21 incident in miniature.
  const DOUBLE_TOP = [100, 101, 102, 103, 104, 120, 110, 108, 110, 120, 104, 103, 102, 101, 100]

  it('confirms the earliest bar of a double top instead of annihilating both', () => {
    const highs = findPivots(barsFromPath(DOUBLE_TOP), 'high', SWING_PIVOT_STRENGTH)

    expect(highs).toHaveLength(1)
    expect(highs[0].index).toBe(5)
    expect(highs[0].price).toBe(120.5)
  })

  it('confirms the earliest bar of a double bottom', () => {
    const lows = findPivots(
      barsFromPath(DOUBLE_TOP.map((v) => 240 - v)),
      'low',
      SWING_PIVOT_STRENGTH,
    )

    expect(lows).toHaveLength(1)
    expect(lows[0].index).toBe(5)
    expect(lows[0].price).toBe(119.5)
  })

  it('reports a flat plateau once, at its first bar', () => {
    const plateau = [100, 101, 102, 103, 104, 120, 120, 120, 104, 103, 102, 101, 100]
    const highs = findPivots(barsFromPath(plateau), 'high', SWING_PIVOT_STRENGTH)

    expect(highs.map((p) => p.index)).toEqual([5])
  })

  it('still rejects a candidate genuinely exceeded on either side', () => {
    const path = [100, 101, 102, 103, 104, 118, 110, 108, 110, 120, 104, 103, 102, 101, 100]
    const highs = findPivots(barsFromPath(path), 'high', SWING_PIVOT_STRENGTH)

    // 118 at index 5 is exceeded by 120 at index 9; 120 at index 9 is clean.
    expect(highs.map((p) => p.index)).toEqual([9])
  })
})

describe('the 2026-08-21 double-top incident (feat-117 regression)', () => {
  // Real 30-min bars from bundle 8455eacd, briefing edfa06a2. The session high
  // 29539.00 printed TWICE (06:30 and 07:30 chart time, four bars apart, at the
  // ONH). Under the old symmetric tie rule both were annihilated, no swing high
  // from that session confirmed, the sequence fell to 'range' — which switches
  // off the integrity qualifier — and the briefing narrated a 13-hour-old 78-pt
  // band as "the current 78-point rotation" while the session had already
  // traded 29220–29539.
  const INCIDENT_PRICE = 29359.5

  function incidentFacts() {
    const bars = parseHtfBars(
      readFileSync(
        join(process.cwd(), 'chart-data', 'incident-fixtures', '2026-08-21-double-top-htf-bars.csv'),
        'utf-8',
      ),
    )
    return computeHtfStructure(bars, INCIDENT_PRICE)
  }

  it('confirms the twice-printed session high as a swing', () => {
    const facts = incidentFacts()

    expect(facts.recentSwingHighs[0]).toEqual({ price: 29539, dateTime: '2026-08-21 06:30' })
  })

  it('spans the rotation to the session high rather than the overnight 78-pt band', () => {
    const facts = incidentFacts()

    expect(facts.rotation).toEqual({
      high: 29539,
      highDateTime: '2026-08-21 06:30',
      low: 29321.25,
      lowDateTime: '2026-08-20 23:30',
      extentPts: 217.75,
      extentAtr: expect.any(Number),
    })
    expect(facts.rotation!.extentPts).not.toBe(78)
  })

  it('restores the integrity qualifier the lost pivot had switched off', () => {
    const facts = incidentFacts()

    expect(facts.trend.state).toBe('up')
    expect(facts.trend.integrity).toBe('under-test')
    expect(facts.trend.integrityBasis).toMatch(/retraced ~82% of the 217.75-pt defining rotation/)
  })
})

describe('computeAtr', () => {
  it('returns 0 for fewer than two bars', () => {
    expect(computeAtr([])).toBe(0)
    expect(computeAtr(barsFromPath([100]))).toBe(0)
  })

  it('equals the constant true range on a uniform tape', () => {
    // o=c=100 every bar: TR = max(1, |100.5−100|, |99.5−100|) = 1.
    expect(computeAtr(barsFromPath(Array(30).fill(100)))).toBe(1)
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Guard the test geometry itself: every intended pivot really has
// SWING_PIVOT_STRENGTH bars of room on both sides.
it('UP_PATH geometry leaves the last pivot confirmable', () => {
  expect(UP_PATH.length - 1 - 23).toBeGreaterThanOrEqual(SWING_PIVOT_STRENGTH)
})
