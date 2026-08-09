import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import {
  GARMAN_KLASS_CLOSE_OPEN_COEFF,
  MIN_SIGMA_ESTIMATION_SESSIONS,
  PARKINSON_VARIANCE_SCALING,
  RTH_BARS_PER_SESSION,
  SIGMA_ESTIMATION_SESSIONS,
  classifySigmaDistance,
  computeVolatilityScale,
  garmanKlassVariance,
  parkinsonVariance,
  pointsForSigma,
  sessionOhlc,
  sigmaOfPoints,
} from './volatilityScale'

/**
 * Every number below is HAND-COMPUTED from the published formulas, not read
 * back from the implementation:
 *
 *   ln(20000/19800) = 0.010050335853501506   ln(...)² = 1.0100925076817785e-4
 *   ln(19950/19850) = 0.0050251362026729795  ln(...)² = 2.525199385541461e-5
 *
 *   Parkinson    σ² = ln(H/L)² / (4·ln2)
 *   Garman-Klass σ² = ½·ln(H/L)² − (2·ln2 − 1)·ln(C/O)²
 *
 * Window fixture: 3 sessions × 15 bars — 14 narrow bars (19950/19850) and one
 * wide bar (20000/19800), every bar Open = Close = 19900.
 *
 *   mean bar σ²(Parkinson)     = (42·9.10773e-6 + 3·3.64314e-5) / 45
 *                              = 1.0929308557931211e-5
 *   bar σ  → √(…) · 20000      = 66.12 pts
 *   session OHLC per session   = O 19900 / H 20000 / L 19800 / C 19900
 *   session σ (Parkinson)      = √(3.64314e-5) · 20000 = 120.72 pts
 *   session σ (Garman-Klass)   = √(5.05046e-5) · 20000 = 142.13 pts
 */

const bar = (time: string, o: number, h: number, l: number, c: number): HtfBar => ({
  dateTime: new Date(time),
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 1000,
  bidVolume: 500,
  askVolume: 500,
  delta: 0,
})

type Shape = { open: number; high: number; low: number; close: number }

/** `count` consecutive 30-min bars starting at 08:30 on `date` (RTH). */
function rthSession(date: string, count: number, shape: Shape, wide?: Shape): HtfBar[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = 8 * 60 + 30 + i * 30
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    // The wide bar sits mid-session, so the session's open/close come from
    // narrow bars and the session range comes from this one.
    const s = wide && i === Math.floor(count / 2) ? wide : shape
    return bar(`${date}T${hh}:${mm}:00`, s.open, s.high, s.low, s.close)
  })
}

const NARROW: Shape = { open: 19900, high: 19950, low: 19850, close: 19900 }
const WIDE: Shape = { open: 19900, high: 20000, low: 19800, close: 19900 }

/** Three complete sessions, each 14 narrow bars + one wide bar. */
function threeSessions(): HtfBar[] {
  return ['2026-08-05', '2026-08-06', '2026-08-07'].flatMap((date) =>
    rthSession(date, RTH_BARS_PER_SESSION, NARROW, WIDE),
  )
}

describe('range-based estimators (feat-095)', () => {
  it('derives 15 30-min bars per RTH session (08:30–16:00, the CME halt)', () => {
    expect(RTH_BARS_PER_SESSION).toBe(15)
  })

  it('computes Parkinson variance to the hand-computed value', () => {
    expect(parkinsonVariance({ high: 20000, low: 19800 })).toBeCloseTo(3.6431386e-5, 11)
    expect(parkinsonVariance({ high: 19950, low: 19850 })).toBeCloseTo(9.1077316e-6, 11)
  })

  it('computes Garman-Klass variance to the hand-computed value', () => {
    expect(
      garmanKlassVariance({ open: 19900, high: 20000, low: 19800, close: 19950 }),
    ).toBeCloseTo(4.8072073e-5, 11)
  })

  it('Garman-Klass subtracts the close-open term: a bar closing on its high reads lowest', () => {
    // O=L, C=H → |ln(C/O)| = ln(H/L), so σ² = (½ − (2ln2 − 1))·ln(H/L)².
    expect(
      garmanKlassVariance({ open: 19800, high: 20000, low: 19800, close: 20000 }),
    ).toBeCloseTo(1.1485321e-5, 11)
    // Close == Open keeps the whole range term: σ² = ½·ln(H/L)².
    expect(
      garmanKlassVariance({ open: 19900, high: 20000, low: 19800, close: 19900 }),
    ).toBeCloseTo(5.0504625e-5, 11)
  })

  it('exports the textbook coefficients', () => {
    expect(PARKINSON_VARIANCE_SCALING).toBeCloseTo(0.3606737602222409, 12)
    expect(GARMAN_KLASS_CLOSE_OPEN_COEFF).toBeCloseTo(0.386294361119891, 12)
  })

  it('is 0 (never NaN) on a degenerate or non-positive period', () => {
    expect(parkinsonVariance({ high: 0, low: 0 })).toBe(0)
    expect(parkinsonVariance({ high: 19800, low: 20000 })).toBe(0)
    expect(garmanKlassVariance({ open: 0, high: 100, low: 90, close: 95 })).toBe(0)
  })

  it('never returns a negative Garman-Klass variance', () => {
    // |ln(C/O)| ≤ ln(H/L) for any well-formed period, so the term cannot win.
    for (const [o, c] of [
      [19800, 20000],
      [20000, 19800],
      [19900, 19900],
    ]) {
      expect(
        garmanKlassVariance({ open: o, high: 20000, low: 19800, close: c }),
      ).toBeGreaterThanOrEqual(0)
    }
  })

  it('collapses a session into one OHLC period', () => {
    const session = rthSession('2026-08-07', RTH_BARS_PER_SESSION, NARROW, WIDE)
    expect(sessionOhlc(session)).toEqual({
      open: 19900,
      high: 20000,
      low: 19800,
      close: 19900,
    })
  })
})

describe('computeVolatilityScale', () => {
  it('throws on empty input', () => {
    expect(() => computeVolatilityScale({ bars: [], currentPrice: 20000 })).toThrow(
      /at least one/,
    )
  })

  it('reports both estimators at both granularities, hand-computed', () => {
    const scale = computeVolatilityScale({ bars: threeSessions(), currentPrice: 20000 })!
    expect(scale).not.toBeNull()
    expect(scale.barsAnalyzed).toBe(45)
    expect(scale.sessionsAnalyzed).toBe(3)
    expect(scale.referencePrice).toBe(20000)
    expect(scale.estimator).toBe('parkinson')
    expect(scale.parkinson.barSigmaPts).toBe(66.12)
    expect(scale.parkinson.sessionSigmaPts).toBe(120.72)
    expect(scale.garmanKlass.barSigmaPts).toBe(77.85)
    expect(scale.garmanKlass.sessionSigmaPts).toBe(142.13)
    // Headline sigma IS the Parkinson session sigma.
    expect(scale.sessionSigmaPts).toBe(scale.parkinson.sessionSigmaPts)
    expect(scale.medianBarRangePts).toBe(100)
    expect(scale.medianSessionRangePts).toBe(200)
    expect(scale.windowStart).toBe('2026-08-05 08:30')
    expect(scale.windowEnd).toBe('2026-08-07 15:30')
  })

  it('does NOT scale the bar sigma up to a session (no √t assumption)', () => {
    const scale = computeVolatilityScale({ bars: threeSessions(), currentPrice: 20000 })!
    // √15 × the bar sigma would read 256.08 pts — the session statistic reads
    // 120.72. Intraday ranges rotate; they do not compound with √t.
    expect(scale.parkinson.barSigmaPts * Math.sqrt(RTH_BARS_PER_SESSION)).toBeGreaterThan(250)
    expect(scale.parkinson.sessionSigmaPts).toBe(120.72)
  })

  it('reproduces the review-measured regime on realistic NQ sessions', () => {
    // 464-pt RTH sessions around 29000 — the bundle review's median day range.
    // It measured a 283-pt median Parkinson session sigma over 61 RTH sessions;
    // ln(29464/29000)/(2·√ln2) · 29000 = 276.45 pts.
    const bars = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'].flatMap((date) =>
      rthSession(
        date,
        RTH_BARS_PER_SESSION,
        { open: 29100, high: 29200, low: 29100, close: 29150 },
        { open: 29100, high: 29464, low: 29000, close: 29150 },
      ),
    )
    const scale = computeVolatilityScale({ bars, currentPrice: 29000 })!
    expect(scale.medianSessionRangePts).toBe(464)
    expect(scale.sessionSigmaPts).toBe(276.45)
  })

  it('degrades to null below MIN_SIGMA_ESTIMATION_SESSIONS complete sessions', () => {
    const bars = ['2026-08-06', '2026-08-07'].flatMap((date) =>
      rthSession(date, RTH_BARS_PER_SESSION, NARROW, WIDE),
    )
    expect(MIN_SIGMA_ESTIMATION_SESSIONS).toBe(3)
    expect(computeVolatilityScale({ bars, currentPrice: 20000 })).toBeNull()
  })

  it('degrades to null on an overnight-only export (no RTH bars at all)', () => {
    const bars = Array.from({ length: 30 }, (_, i) =>
      bar(
        `2026-08-07T0${Math.floor(i / 30)}:${String((i * 2) % 60).padStart(2, '0')}:00`,
        19900,
        20000,
        19800,
        19900,
      ),
    )
    expect(computeVolatilityScale({ bars, currentPrice: 20000 })).toBeNull()
  })

  it('excludes the in-progress (partial) session from the window', () => {
    const bars = [
      ...threeSessions(),
      // Today so far: 4 bars, a much wider range that would skew the scale.
      ...rthSession('2026-08-10', 4, { open: 19900, high: 20400, low: 19400, close: 19900 }),
    ]
    const scale = computeVolatilityScale({ bars, currentPrice: 20000 })!
    expect(scale.sessionsAnalyzed).toBe(3)
    expect(scale.barsAnalyzed).toBe(45)
    expect(scale.windowEnd).toBe('2026-08-07 15:30')
    expect(scale.sessionSigmaPts).toBe(120.72)
  })

  it('measures only the newest SIGMA_ESTIMATION_SESSIONS complete sessions', () => {
    const bars = Array.from({ length: SIGMA_ESTIMATION_SESSIONS + 4 }, (_, i) =>
      rthSession(`2026-07-${String(i + 1).padStart(2, '0')}`, RTH_BARS_PER_SESSION, NARROW, WIDE),
    ).flat()
    const scale = computeVolatilityScale({ bars, currentPrice: 20000 })!
    expect(scale.sessionsAnalyzed).toBe(SIGMA_ESTIMATION_SESSIONS)
    expect(scale.barsAnalyzed).toBe(SIGMA_ESTIMATION_SESSIONS * RTH_BARS_PER_SESSION)
    // 14 sessions exported, the newest 10 measured.
    expect(scale.windowStart).toBe('2026-07-05 08:30')
  })

  it('excludes overnight bars from the estimate', () => {
    // A dead-flat overnight session would halve the mean variance if counted.
    const overnight = Array.from({ length: 10 }, (_, i) =>
      bar(
        `2026-08-04T${String(17 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}:00`,
        19900,
        19901,
        19899,
        19900,
      ),
    )
    const scale = computeVolatilityScale({
      bars: [...overnight, ...threeSessions()],
      currentPrice: 20000,
    })!
    expect(scale.barsAnalyzed).toBe(45)
    expect(scale.sessionSigmaPts).toBe(120.72)
  })

  it('falls back to the last close when no current price is available', () => {
    const scale = computeVolatilityScale({ bars: threeSessions(), currentPrice: null })!
    expect(scale.referencePrice).toBe(19900)
  })
})

describe('sigma-normalized distances', () => {
  it('reports every structural distance in points AND sigma', () => {
    const scale = computeVolatilityScale({
      bars: threeSessions(),
      currentPrice: 20000,
      structure: [
        { label: 'PDH (nearest Tier-1 above)', price: 20029 },
        { label: 'PDL (nearest Tier-1 below)', price: 19850 },
      ],
    })!
    expect(scale.distancesToStructure).toEqual([
      // 29 pts overhead is 0.24σ on a 120.72-pt session sigma — inside the noise.
      { label: 'PDH (nearest Tier-1 above)', price: 20029, pts: 29, sigma: 0.24, band: 'noise' },
      {
        label: 'PDL (nearest Tier-1 below)',
        price: 19850,
        pts: -150,
        sigma: 1.24,
        band: 'large',
      },
    ])
  })

  it('is empty when the caller supplies no structure', () => {
    expect(
      computeVolatilityScale({ bars: threeSessions(), currentPrice: 20000 })!
        .distancesToStructure,
    ).toEqual([])
  })

  it('bands a sigma multiple at the documented boundaries', () => {
    expect(classifySigmaDistance(0)).toBe('noise')
    expect(classifySigmaDistance(0.25)).toBe('noise')
    expect(classifySigmaDistance(0.26)).toBe('minor')
    expect(classifySigmaDistance(0.5)).toBe('minor')
    expect(classifySigmaDistance(0.51)).toBe('meaningful')
    expect(classifySigmaDistance(1)).toBe('meaningful')
    expect(classifySigmaDistance(1.01)).toBe('large')
    // Sign never changes the band — direction is carried by `pts`.
    expect(classifySigmaDistance(-1.5)).toBe('large')
  })
})

describe('sigma ↔ points resolvers', () => {
  // The review's measured median session sigma.
  const scale = { sessionSigmaPts: 283 }

  it('converts points to sigma multiples', () => {
    // The review's own example: 29 pts away reads as 0.10σ — inside the noise.
    expect(sigmaOfPoints(29, scale)).toBe(0.1)
    expect(sigmaOfPoints(283, scale)).toBe(1)
  })

  it('resolves a sigma multiple to its live point value (feat-096 consumer)', () => {
    expect(pointsForSigma(0.5, scale)).toBe(141.5)
    expect(pointsForSigma(1, scale)).toBe(283)
  })

  it('degrades to null rather than dividing by a missing scale', () => {
    expect(sigmaOfPoints(29, null)).toBeNull()
    expect(pointsForSigma(0.5, null)).toBeNull()
    expect(sigmaOfPoints(29, { sessionSigmaPts: 0 })).toBeNull()
    expect(pointsForSigma(0.5, { sessionSigmaPts: 0 })).toBeNull()
    expect(sigmaOfPoints(Number.NaN, scale)).toBeNull()
  })
})
