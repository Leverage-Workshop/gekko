import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import { parseHtfBars } from './parseHtfBars'
import { computeHtfStructure } from './htfStructure'
import {
  BARS_PER_TRADING_DAY,
  DELTA_WALK_SESSIONS,
  DIVERGENCE_WINDOW_BARS,
  computeHtfFlow,
} from './htfFlow'
import { RTH_BARS_PER_SESSION } from './rthSessions'

/**
 * Bars are built at LOCAL times with no zone suffix — chart time is exchange
 * local (CT) throughout the engine, and `minutesOfDay`/`tradingDayOf` read
 * `getHours()`, so an unsuffixed literal is the honest fixture.
 */
type BarSpec = {
  price: number
  high?: number
  low?: number
  delta: number
  volume?: number
}

function htfBar(dateTime: Date, o: BarSpec): HtfBar {
  const volume = o.volume ?? 4500
  const ask = (volume + o.delta) / 2
  return {
    dateTime,
    open: o.price,
    high: o.high ?? o.price + 0.5,
    low: o.low ?? o.price - 0.5,
    close: o.price,
    volume,
    bidVolume: volume - ask,
    askVolume: ask,
    delta: o.delta,
  }
}

/** A run of consecutive 30-min bars starting at `start` (local/chart time). */
function series(start: string, specs: readonly BarSpec[]): HtfBar[] {
  const t0 = new Date(start).getTime()
  return specs.map((spec, i) => htfBar(new Date(t0 + i * 30 * 60 * 1000), spec))
}

/**
 * The same zigzag geometry `htfStructure.test.ts` pivots on: peaks at indices 5
 * and 17, troughs at 11 and 23, each with SWING_PIVOT_STRENGTH(=5) bars of room.
 */
const UP_PATH = [
  100, 104, 108, 112, 116, 120,
  116, 112, 108, 106, 105.5, 105,
  110, 115, 120, 125, 130, 135,
  130, 126, 122, 120, 119, 118,
  121, 124, 127, 130, 133, 136, 139,
]

function pathBars(values: readonly number[], deltas?: readonly number[]): HtfBar[] {
  return series(
    '2026-07-20T09:30:00',
    values.map((v, i) => ({ price: v, delta: deltas?.[i] ?? 0 })),
  )
}

describe('computeHtfFlow', () => {
  it('throws on an empty bar set', () => {
    expect(() => computeHtfFlow([])).toThrow(/at least one bar/)
  })

  describe('cumulative delta', () => {
    it('accumulates over the anchored window and names the anchor bar', () => {
      const bars = series('2026-07-20T09:30:00', [
        { price: 100, delta: 200 },
        { price: 101, delta: -50 },
        { price: 102, delta: 100 },
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 2 })

      // Window = the last 2 bars, so the anchor is the 101-bar, not the export start.
      expect(flow.cumulativeDelta.anchor).toEqual({ dateTime: '2026-07-20 10:00', price: 101 })
      expect(flow.cumulativeDelta.windowBars).toBe(2)
      expect(flow.cumulativeDelta.netDelta).toBe(50)
    })

    it('never emits a bare signed total — every net delta is paired with its price change', () => {
      const bars = series('2026-07-20T09:30:00', [
        { price: 100, delta: -400 },
        { price: 104, delta: -400 },
        { price: 108, delta: -400 },
      ])

      const flow = computeHtfFlow(bars)

      // The hazard the 2026-08-12 control study measured: delta down, price up.
      expect(flow.cumulativeDelta.netDelta).toBe(-1200)
      expect(flow.cumulativeDelta.pricePts).toBe(8)
      expect('total' in flow.cumulativeDelta).toBe(false)
    })

    it('leaves the export window to htfStructure rather than repeating it', () => {
      const flow = computeHtfFlow(series('2026-07-20T09:30:00', [{ price: 100, delta: 1 }]))

      expect(Object.keys(flow).sort()).toEqual(['cumulativeDelta', 'divergence', 'swings'])
    })

    it('caps the window at the length of the series', () => {
      const bars = series('2026-07-20T09:30:00', [{ price: 100, delta: 40 }])

      const flow = computeHtfFlow(bars)

      expect(flow.cumulativeDelta.windowBars).toBe(1)
      expect(flow.cumulativeDelta.netDelta).toBe(40)
    })

    it('classifies the trend rising / falling against the window own delta scale', () => {
      const rising = computeHtfFlow(
        series('2026-07-20T09:30:00', [
          { price: 100, delta: 500 },
          { price: 101, delta: 500 },
          { price: 102, delta: 500 },
        ]),
      )
      expect(rising.cumulativeDelta.trend).toBe('rising')

      const falling = computeHtfFlow(
        series('2026-07-20T09:30:00', [
          { price: 100, delta: -500 },
          { price: 99, delta: -500 },
          { price: 98, delta: -500 },
        ]),
      )
      expect(falling.cumulativeDelta.trend).toBe('falling')
    })

    it('reads a net change small against the window own swings as flat', () => {
      // Cumulative delta swings +2000 / −2000 inside the window and ends +40:
      // a round trip, not a directional build.
      const flow = computeHtfFlow(
        series('2026-07-20T09:30:00', [
          { price: 100, delta: 2000 },
          { price: 101, delta: -2000 },
          { price: 100, delta: 40 },
        ]),
      )

      expect(flow.cumulativeDelta.netDelta).toBe(40)
      expect(flow.cumulativeDelta.trend).toBe('flat')
    })
  })

  describe('per-RTH-session delta walk', () => {
    /** One complete RTH session (15 bars, 08:30 → 15:30 starts) on `date`. */
    function rthSession(date: string, perBarDelta: number, drift = 0): HtfBar[] {
      return series(
        `${date}T08:30:00`,
        Array.from({ length: RTH_BARS_PER_SESSION }, (_, i) => ({
          price: 100 + i * drift,
          delta: perBarDelta,
        })),
      )
    }

    it('nets delta per session, newest first, and flags the in-progress session', () => {
      const bars = [
        ...rthSession('2026-07-20', 100),
        ...rthSession('2026-07-21', -200),
        // In progress: only 3 bars printed so far.
        ...series(
          '2026-07-22T08:30:00',
          Array.from({ length: 3 }, () => ({ price: 100, delta: 50 })),
        ),
      ]

      const flow = computeHtfFlow(bars)
      const walk = flow.cumulativeDelta.sessions

      expect(walk.map((s) => s.date)).toEqual(['2026-07-22', '2026-07-21', '2026-07-20'])
      expect(walk[0]).toMatchObject({ netDelta: 150, complete: false })
      expect(walk[1]).toMatchObject({ netDelta: -200 * RTH_BARS_PER_SESSION, complete: true })
      expect(walk[2]).toMatchObject({ netDelta: 100 * RTH_BARS_PER_SESSION, complete: true })
      expect(walk[0].volume).toBe(3 * 4500)
    })

    it('pairs every session net delta with that session own price change', () => {
      // Sellers net −150 across the session while price closes 28 pts HIGHER —
      // the sign disagreement the 2026-08-12 control study found on 77% of days.
      const flow = computeHtfFlow(rthSession('2026-07-21', -10, 2))
      const session = flow.cumulativeDelta.sessions[0]

      expect(session.netDelta).toBe(-10 * RTH_BARS_PER_SESSION)
      expect(session.pricePts).toBe(2 * (RTH_BARS_PER_SESSION - 1))
    })

    it('excludes overnight bars from the session walk (RTH-only, per rthSessions)', () => {
      const bars = [
        // Globex bars at 17:00/17:30 belong to the NEXT trading day and are not RTH.
        ...series('2026-07-20T17:00:00', [
          { price: 100, delta: 9999 },
          { price: 100, delta: 9999 },
        ]),
        ...rthSession('2026-07-21', 10),
      ]

      const flow = computeHtfFlow(bars)

      expect(flow.cumulativeDelta.sessions).toHaveLength(1)
      expect(flow.cumulativeDelta.sessions[0]).toMatchObject({
        date: '2026-07-21',
        netDelta: 10 * RTH_BARS_PER_SESSION,
      })
      // The overnight flow still counts toward the anchored window's net delta.
      expect(flow.cumulativeDelta.netDelta).toBe(2 * 9999 + 10 * RTH_BARS_PER_SESSION)
    })

    it('walks at most DELTA_WALK_SESSIONS sessions', () => {
      const bars = Array.from({ length: DELTA_WALK_SESSIONS + 3 }, (_, i) =>
        rthSession(`2026-07-${String(6 + i).padStart(2, '0')}`, 10),
      ).flat()

      const flow = computeHtfFlow(bars)

      expect(flow.cumulativeDelta.sessions).toHaveLength(DELTA_WALK_SESSIONS)
    })

    it('walks no sessions when the export carries no RTH bars', () => {
      const flow = computeHtfFlow(
        series('2026-07-20T19:00:00', [
          { price: 100, delta: 10 },
          { price: 100, delta: 10 },
        ]),
      )

      expect(flow.cumulativeDelta.sessions).toEqual([])
    })
  })

  describe('swing annotation', () => {
    it('annotates the same confirmed swings htfStructure reports, with the pivot bar delta and volume', () => {
      const deltas = UP_PATH.map((_, i) => (i % 2 === 0 ? 100 : -60))
      const bars = pathBars(UP_PATH, deltas)

      const flow = computeHtfFlow(bars)
      const structure = computeHtfStructure(bars, null)

      // Same pivots, same order, same rounding — one definition of "a confirmed swing".
      expect(flow.swings.highs.map((s) => ({ price: s.price, dateTime: s.dateTime }))).toEqual(
        structure.recentSwingHighs,
      )
      expect(flow.swings.lows.map((s) => ({ price: s.price, dateTime: s.dateTime }))).toEqual(
        structure.recentSwingLows,
      )

      // The newest swing high is the 135-peak at index 17 (odd → delta −60):
      // the annotation reads the PIVOT BAR's own flow, not a neighbour's.
      const peak = flow.swings.highs[0]
      expect(peak.price).toBe(135.5)
      expect(peak.delta).toBe(-60)
      expect(peak.volume).toBe(4500)
    })

    it('carries no running cumulative delta at a swing (anchor-dependent, unsupported)', () => {
      // Comparing one swing's running total with the next IS swing-level
      // divergence, which the 2026-08-12 control study found no support for.
      const flow = computeHtfFlow(pathBars(UP_PATH, UP_PATH.map(() => 10)))

      expect(Object.keys(flow.swings.highs[0]).sort()).toEqual([
        'dateTime',
        'delta',
        'price',
        'volume',
      ])
    })

    it('reports no swings on a tape with no confirmed pivots', () => {
      const flow = computeHtfFlow(pathBars(Array(20).fill(100)))

      expect(flow.swings.highs).toEqual([])
      expect(flow.swings.lows).toEqual([])
    })

    it('reports no swings on a series shorter than the pivot window', () => {
      const flow = computeHtfFlow(pathBars([100, 105, 100]))

      expect(flow.swings.highs).toEqual([])
      expect(flow.swings.lows).toEqual([])
      expect(flow.divergence.state).toBeNull()
    })
  })

  /**
   * The divergence read is COMPUTED but WITHHELD from every prompt (see the
   * module header and the seam in lib/analyze/prompt.ts). These tests pin the
   * algorithm so the field stays correct and testable if the operator ever
   * chooses to expose it; `tests/prompt-data-sync.test.ts` pins the omission.
   */
  describe('divergence at a fresh extreme (computed, not shipped to the model)', () => {
    const priorUp = Array.from({ length: 9 }, (_, i) => ({
      price: 100 + i * 0.1,
      delta: 100,
    }))

    it('reads bearish when a fresh high prints and cumulative delta does not confirm it', () => {
      const bars = series('2026-07-20T09:30:00', [
        ...priorUp,
        { price: 105, high: 106, low: 104, delta: -300 },
        { price: 105.5, high: 106.5, low: 104.5, delta: -300 },
        { price: 105, high: 107, low: 104, delta: -300 },
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 12 })

      expect(flow.divergence.state).toBe('bearish')
      expect(flow.divergence.basis).toMatch(/fresh \d+-day high/)
      // Descriptive only — never a trade instruction.
      expect(flow.divergence.basis).not.toMatch(/fade|reversal|short this|expect/i)
    })

    it('reads bullish when a fresh low prints and cumulative delta holds above its window low', () => {
      const bars = series('2026-07-20T09:30:00', [
        ...priorUp.map((b) => ({ ...b, price: 100 - (b.price - 100), delta: -100 })),
        { price: 95, high: 96, low: 94, delta: 300 },
        { price: 94.5, high: 95.5, low: 93.5, delta: 300 },
        { price: 95, high: 96, low: 93, delta: 300 },
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 12 })

      expect(flow.divergence.state).toBe('bullish')
      expect(flow.divergence.basis).toMatch(/fresh \d+-day low/)
    })

    it('reads no divergence when the fresh extreme is delta-confirmed', () => {
      const bars = series('2026-07-20T09:30:00', [
        ...priorUp,
        { price: 105, high: 106, low: 104, delta: 200 },
        { price: 106, high: 107, low: 105, delta: 200 },
        { price: 107, high: 108, low: 106, delta: 200 },
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 12 })

      expect(flow.divergence.state).toBeNull()
      expect(flow.divergence.basis).toMatch(/confirm/i)
    })

    it('reads no divergence when both a fresh high and a fresh low print (two-sided rotation)', () => {
      const bars = series('2026-07-20T09:30:00', [
        ...priorUp.map((b) => ({ ...b, price: 100, high: 101, low: 99 })),
        { price: 105, high: 110, low: 99, delta: -700 },
        { price: 95, high: 101, low: 90, delta: 100 },
        { price: 99, high: 100, low: 98, delta: 0 },
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 12 })

      expect(flow.divergence.state).toBeNull()
      expect(flow.divergence.basis).toMatch(/two-sided/)
    })

    it('reads no divergence when no fresh extreme printed at all', () => {
      const bars = series('2026-07-20T09:30:00', [
        { price: 100, high: 110, low: 90, delta: 500 },
        ...Array.from({ length: 8 }, () => ({ price: 100, high: 101, low: 99, delta: -100 })),
      ])

      const flow = computeHtfFlow(bars, { recentWindowBars: 9 })

      expect(flow.divergence.state).toBeNull()
      expect(flow.divergence.basis).toMatch(/no fresh/)
    })
  })

  it('never mutates the input bars', () => {
    const bars = pathBars(UP_PATH, UP_PATH.map((_, i) => i * 10))
    const snapshot = JSON.parse(JSON.stringify(bars))

    computeHtfFlow(bars)

    expect(JSON.parse(JSON.stringify(bars))).toEqual(snapshot)
  })

  describe('real sample export (chart-data/)', () => {
    const bars = parseHtfBars(
      readFileSync(join(process.cwd(), 'chart-data', 'htf_bar_data.rolling.csv'), 'utf-8'),
    )

    it('computes sane facts over the real 30-min bars', () => {
      const flow = computeHtfFlow(bars)

      const window = bars.slice(-DIVERGENCE_WINDOW_BARS)
      expect(flow.cumulativeDelta.windowBars).toBe(DIVERGENCE_WINDOW_BARS)
      expect(flow.cumulativeDelta.netDelta).toBe(
        Math.round(window.reduce((sum, b) => sum + b.delta, 0)),
      )
      expect(flow.cumulativeDelta.anchor.price).toBe(window[0].open)
      expect(flow.cumulativeDelta.pricePts).toBeCloseTo(
        bars[bars.length - 1].close - window[0].open,
        2,
      )
      expect(flow.cumulativeDelta.sessions.length).toBe(DELTA_WALK_SESSIONS)
      expect(flow.cumulativeDelta.sessions[0].date > flow.cumulativeDelta.sessions[1].date).toBe(
        true,
      )
      for (const session of flow.cumulativeDelta.sessions) {
        expect(Number.isFinite(session.pricePts)).toBe(true)
      }
      expect(flow.swings.highs.length).toBeGreaterThan(0)
      expect(flow.swings.lows.length).toBeGreaterThan(0)
      for (const swing of [...flow.swings.highs, ...flow.swings.lows]) {
        expect(swing.volume).toBeGreaterThan(0)
        expect(Number.isFinite(swing.delta)).toBe(true)
      }
      expect([null, 'bullish', 'bearish']).toContain(flow.divergence.state)
      expect(flow.divergence.basis.length).toBeGreaterThan(0)
    })

    it('swings print heavier volume than a typical bar (the study control, on this fixture)', () => {
      // The 2026-08-12 study measured ~55% more volume at confirmed swings than
      // at an ordinary bar (median ~7,526/7,662 vs 4,866). This asserts only the
      // DIRECTION of that effect on the repo fixture — it is the checkable,
      // non-directional half of the feature.
      const flow = computeHtfFlow(bars)
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const swingVolumes = [...flow.swings.highs, ...flow.swings.lows].map((s) => s.volume)

      expect(median(swingVolumes)).toBeGreaterThan(median(bars.map((b) => b.volume)))
    })

    it('the real export really does print BARS_PER_TRADING_DAY bars on a full day', () => {
      // Guards the constant the divergence lookback is sized in: 23 h of 30-min
      // bars (the CME maintenance halt takes the 24th hour).
      const perDay = new Map<string, number>()
      for (const bar of bars) {
        const mins = bar.dateTime.getHours() * 60 + bar.dateTime.getMinutes()
        const day = new Date(bar.dateTime)
        if (mins >= 17 * 60) day.setDate(day.getDate() + 1)
        const key = day.toISOString().slice(0, 10)
        perDay.set(key, (perDay.get(key) ?? 0) + 1)
      }
      const counts = [...perDay.values()].sort((a, b) => b - a)
      expect(counts[0]).toBe(BARS_PER_TRADING_DAY)
    })
  })
})
