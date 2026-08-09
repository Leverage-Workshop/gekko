import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import { RTH_BARS_PER_SESSION } from './rthSessions'
import {
  IB_BARS,
  MIN_IB_DISTRIBUTION_SESSIONS,
  PINNED_EXTENSION_QUANTILES,
  PROJECTED_QUANTILES,
  computeIbExtension,
  quantile,
} from './ibExtension'
import { IB_MINUTES, PINNED_IB_EXTENSION_DISTRIBUTION, classifyTpoDay } from './tpoDayType'
import type { TpoRow } from './parseTpo'

/**
 * The numbers below are pinned to an EXTERNAL source — bundle review
 * 2026-08-07 §B7 — not read back from this implementation:
 *
 *   day_range / IB_range :  p25 1.25 | median 1.52 | p75 2.08 | p90 2.58 | max 3.58
 *   day type by extension:  no-extension 4% | one-sided 79% | both-sides 16%
 *   upside extension as a multiple of IB: median 0.15 | p90 0.76
 *   the live session:       IB 29242–29667 (425 pts), range 445 pts → day/IB 1.05,
 *                           below the p25
 *
 * Each fixture is built so the R-7 (NumPy-default) quantile lands exactly on a
 * published value: with n samples, quantile p interpolates at k = (n−1)·p, so
 * pinning the two observations either side of k to the published number makes
 * the quantile that number regardless of the filler around it.
 */

const bar = (time: string, high: number, low: number): HtfBar => ({
  dateTime: new Date(time),
  open: (high + low) / 2,
  high,
  low,
  close: (high + low) / 2,
  volume: 1000,
  bidVolume: 500,
  askVolume: 500,
  delta: 0,
})

const IB_LOW = 29000
const IB_HIGH = 29100
/** Every synthetic session's IB is 100 pts wide, so a multiple IS a point count. */
const IB_RANGE = IB_HIGH - IB_LOW

/**
 * One RTH session: `bars` 30-min bars from 08:30, the first {@link IB_BARS}
 * spanning the Initial Balance, one later bar carrying the up extension and
 * another the down extension (in multiples of the IB range).
 */
function session(
  date: string,
  up: number,
  down: number,
  bars: number = RTH_BARS_PER_SESSION,
): HtfBar[] {
  return Array.from({ length: bars }, (_, i) => {
    const minutes = 8 * 60 + 30 + i * 30
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    const time = `${date}T${hh}:${mm}:00`
    if (i < IB_BARS) return bar(time, IB_HIGH, IB_LOW)
    if (i === IB_BARS) return bar(time, IB_HIGH + up * IB_RANGE, IB_LOW)
    if (i === IB_BARS + 1) return bar(time, IB_HIGH, IB_LOW - down * IB_RANGE)
    return bar(time, IB_HIGH, IB_LOW)
  })
}

/** `count` consecutive calendar dates from 2026-05-01 — only ordering matters here. */
function dates(count: number, from = 0): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 4, 1 + from + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

/** The in-progress session, always dated after every history fixture above. */
const LIVE_DATE = '2026-08-06'

/**
 * 62 day/IB ratios whose R-7 quantiles ARE §B7's published numbers. n = 62, so
 * k = 61·p: p25 → 15.25, median → 30.5, p75 → 45.75, p90 → 54.9. Pinning each
 * bracketing index PAIR to the published value makes every quantile exact; the
 * monotone filler between them cannot move it.
 */
const REVIEW_RATIOS: number[] = Array.from({ length: 62 }, (_, i) => {
  if (i <= 14) return 1.0 + i * 0.016
  if (i <= 16) return 1.25 // p25 (k = 15.25)
  if (i <= 29) return 1.26 + (i - 17) * 0.02
  if (i <= 31) return 1.52 // median (k = 30.5)
  if (i <= 44) return 1.53 + (i - 32) * 0.04
  if (i <= 46) return 2.08 // p75 (k = 45.75)
  if (i <= 53) return 2.09 + (i - 47) * 0.06
  if (i <= 55) return 2.58 // p90 (k = 54.9)
  if (i <= 60) return 2.6 + (i - 56) * 0.15
  return 3.58 // max
})

/** The review's 62 sessions, each extending one-sided UP by (ratio − 1) IBs. */
function reviewSessions(): HtfBar[] {
  const days = dates(REVIEW_RATIOS.length)
  return REVIEW_RATIOS.flatMap((ratio, i) => session(days[i], ratio - 1, 0))
}

describe('the Initial Balance is defined, not assumed (feat-100)', () => {
  it('is the first hour — two 30-min bars — and says so in the fact', () => {
    expect(IB_MINUTES).toBe(60)
    expect(IB_BARS).toBe(2)
    const facts = computeIbExtension({ bars: reviewSessions() })!
    expect(facts.ibMinutes).toBe(60)
    expect(facts.ibBars).toBe(2)
  })

  it('interpolates quantiles the way the review measured them (R-7)', () => {
    // Hand-computed: n=4 → k = 3p. p25 → 0.75 → 1 + 0.75·(2−1) = 1.75;
    // p90 → 2.7 → 3 + 0.7·(4−3) = 3.7; median → 1.5 → 2.5.
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7, 10)
  })
})

describe('the measured distribution reproduces review §B7', () => {
  const facts = computeIbExtension({ bars: reviewSessions() })!

  it('measures the published day/IB quantiles from the export itself', () => {
    expect(facts.distribution.source).toBe('measured')
    expect(facts.distribution.p25).toBe(1.25)
    expect(facts.distribution.median).toBe(1.52)
    expect(facts.distribution.p75).toBe(2.08)
    expect(facts.distribution.p90).toBe(2.58)
    expect(facts.distribution.max).toBe(3.58)
  })

  it('reports the sample size alongside every quantile (B7 is explicit)', () => {
    expect(facts.distribution.sampleSize).toBe(62)
    expect(facts.sessionsAnalyzed).toBe(62)
    expect(facts.fallbackReason).toBeNull()
    expect(facts.windowStart).toBe('2026-05-01')
    expect(facts.windowEnd).toBe('2026-07-01')
  })

  it('agrees with the pinned distribution it replaces', () => {
    // Same sample, same quantiles: the live pass is a measurement of the same
    // thing the review measured, not a different statistic.
    const pinned = PINNED_IB_EXTENSION_DISTRIBUTION
    for (const key of ['p25', 'median', 'p75', 'p90', 'max'] as const) {
      expect(facts.distribution[key]).toBe(pinned[key])
    }
  })
})

describe('day type by extension and the one-sided extension quantiles', () => {
  /**
   * 20 sessions built to §B7's other two lines. Upside multiples sorted:
   * 7 zeros, then 0.05 0.10 [0.15 0.15] 0.20 0.30 0.40 0.50 0.60 0.70
   * [0.76 0.76] 0.90 — n=20 → median k = 9.5 (the 0.15 pair), p90 k = 17.1
   * (the 0.76 pair). Sides: 1 no-extension, 3 both-sided, 16 one-sided.
   */
  const UPS = [0, 0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.15, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.76, 0.76, 0.9]
  const DOWNS = [
    0, // the no-extension session
    0.3, 0.4, 0.5, 0.6, 0.7, 0.8, // six down-only sessions
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // ten up-only sessions
    0.2, 0.3, 0.4, // three both-sided sessions
  ]
  const days = dates(UPS.length)
  const facts = computeIbExtension({
    bars: UPS.flatMap((up, i) => session(days[i], up, DOWNS[i])),
  })!

  it('splits the sample the way B7 does: none / one-sided / both-sides', () => {
    expect(facts.distribution.sampleSize).toBe(20)
    expect(facts.distribution.sides).toEqual({
      none: 0.05,
      oneSided: 0.8,
      bothSides: 0.15,
    })
  })

  it('measures the published upside extension: median 0.15, p90 0.76', () => {
    expect(facts.extensionQuantiles.up.median).toBe(0.15)
    expect(facts.extensionQuantiles.up.p90).toBe(0.76)
  })

  it('projects no rung for a quantile whose extension is zero', () => {
    // The measured downside median is 0 — most sessions never extend below the
    // IB — so there is no downside median PRICE to quote: it would be the IB
    // low itself, already "reached" by construction.
    expect(facts.extensionQuantiles.down.median).toBe(0)
    expect(facts.downProjections.map((p) => p.q)).toEqual(['p75', 'p90'])
  })

  it('measures the downside the same way, which the review never published', () => {
    // Downside sorted ascending: eleven zeros (the no-extension session and the
    // ten up-only ones), then 0.2 0.3 0.3 0.4 0.4 0.5 0.6 0.7 0.8. n=20 →
    // median k = 9.5, both sides of it zero; p90 k = 17.1 → 0.6 + 0.1·(0.7−0.6).
    expect(facts.extensionQuantiles.down.median).toBe(0)
    expect(facts.extensionQuantiles.down.p90).toBe(0.61)
  })
})

describe("the live session, projected from its own IB (the review's worked example)", () => {
  /** The review's live session: IB 29241.25–29667.00, range 445 pts so far. */
  const LIVE_IB_LOW = 29241.25
  const LIVE_IB_HIGH = 29667
  const LIVE_HIGH = 29686.25
  const liveSession = (date: string, bars: number): HtfBar[] =>
    Array.from({ length: bars }, (_, i) => {
      const minutes = 8 * 60 + 30 + i * 30
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
      const time = `${date}T${hh}:${String(minutes % 60).padStart(2, '0')}:00`
      if (i < IB_BARS) return bar(time, LIVE_IB_HIGH, LIVE_IB_LOW)
      return bar(time, LIVE_HIGH, LIVE_IB_LOW)
    })

  const facts = computeIbExtension({
    // 62 sessions of history + the review's live, in-progress session.
    bars: [...reviewSessions(), ...liveSession(LIVE_DATE, 11)],
  })!

  it('reads the live IB and ratio exactly as the review states them', () => {
    expect(facts.session).not.toBeNull()
    expect(facts.session!.ibLow).toBe(29241.25)
    expect(facts.session!.ibHigh).toBe(29667)
    expect(facts.session!.ibRangePts).toBe(425.75)
    expect(facts.session!.rangePts).toBe(445)
    expect(facts.session!.ratio).toBe(1.05)
    expect(facts.session!.band).toBe('below-p25')
    expect(facts.session!.complete).toBe(false)
    expect(facts.session!.upPts).toBe(19.25)
    expect(facts.session!.downPts).toBe(0)
  })

  it('keeps the in-progress session out of the sample it is scored against', () => {
    // 62 complete sessions of history; the truncated live one would deflate
    // every quantile it entered.
    expect(facts.sessionsAnalyzed).toBe(62)
    expect(facts.distribution.sampleSize).toBe(62)
  })

  it('projects each quantile from the live IB into a PRICE', () => {
    // Every history session here extends up by (ratio − 1), so the measured
    // upside p90 is 1.58 IBs: 29667 + 1.58 × 425.75 = 30339.69.
    const p90 = facts.upProjections.find((p) => p.q === 'p90')!
    expect(p90.mult).toBe(facts.extensionQuantiles.up.p90)
    expect(p90.price).toBe(
      Math.round((29667 + facts.extensionQuantiles.up.p90! * 425.75) * 100) / 100,
    )
    expect(p90.reached).toBe(false)
    expect(facts.upProjections.map((p) => p.q)).toEqual([...PROJECTED_QUANTILES])
  })

  it('marks a quantile the session has already passed as reached', () => {
    // The live session has extended 19.25 pts up = 0.045 IBs, so any quantile
    // at or below that is already in the books.
    const shallow = computeIbExtension({
      bars: [
        ...dates(25).flatMap((date, i) => session(date, i === 0 ? 0.04 : 0.01, 0)),
        ...liveSession(LIVE_DATE, 11),
      ],
    })!
    expect(shallow.extensionQuantiles.up.median).toBe(0.01)
    expect(shallow.upProjections.find((p) => p.q === 'median')!.reached).toBe(true)
    expect(shallow.upProjections.find((p) => p.q === 'p90')!.reached).toBe(true)
  })
})

describe('the pinned distribution is the fallback, never a silent one', () => {
  const facts = computeIbExtension({
    bars: dates(12).flatMap((date, i) => session(date, 0.5 + i * 0.1, 0)),
  })!

  it('falls back below the minimum sample and names the reason', () => {
    expect(MIN_IB_DISTRIBUTION_SESSIONS).toBe(20)
    expect(facts.sessionsAnalyzed).toBe(12)
    expect(facts.distribution).toEqual(PINNED_IB_EXTENSION_DISTRIBUTION)
    expect(facts.distribution.source).toBe('pinned-empirical')
    expect(facts.distribution.sampleSize).toBe(62)
    expect(facts.fallbackReason).toContain('12 complete RTH sessions')
    expect(facts.fallbackReason).toContain('need 20')
  })

  it('projects only the two upside quantiles the review published', () => {
    expect(facts.extensionQuantiles).toBe(PINNED_EXTENSION_QUANTILES)
    expect(facts.upProjections.map((p) => p.q)).toEqual(['median', 'p90'])
    expect(facts.downProjections).toEqual([])
  })

  it('measures live the moment the sample clears the minimum', () => {
    const enough = computeIbExtension({
      bars: dates(MIN_IB_DISTRIBUTION_SESSIONS).flatMap((date, i) =>
        session(date, 0.5 + i * 0.1, 0.1),
      ),
    })!
    expect(enough.distribution.source).toBe('measured')
    expect(enough.distribution.sampleSize).toBe(MIN_IB_DISTRIBUTION_SESSIONS)
    expect(enough.fallbackReason).toBeNull()
    expect(enough.downProjections.length).toBeGreaterThan(0)
  })
})

describe('degradations', () => {
  it('returns null when the export carries no RTH bars', () => {
    const overnight = [bar('2026-08-06T19:00:00', 29100, 29000)]
    expect(computeIbExtension({ bars: overnight })).toBeNull()
    expect(computeIbExtension({ bars: [] })).toBeNull()
  })

  it('reports no live session until the Initial Balance has formed', () => {
    const facts = computeIbExtension({
      bars: [...reviewSessions(), ...session(LIVE_DATE, 0.5, 0, 1)],
    })!
    expect(facts.session).toBeNull()
    expect(facts.upProjections).toEqual([])
    // The distribution still stands — the history does not need today.
    expect(facts.distribution.source).toBe('measured')
  })

  it('drops a session whose Initial Balance is a single price', () => {
    const flat = dates(3, 62).flatMap((date) =>
      Array.from({ length: RTH_BARS_PER_SESSION }, (_, i) =>
        bar(`${date}T${String(8 + Math.floor((30 + i * 30) / 60)).padStart(2, '0')}:${String((30 + i * 30) % 60).padStart(2, '0')}:00`, 29000, 29000),
      ),
    )
    const facts = computeIbExtension({ bars: [...reviewSessions(), ...flat] })!
    // 62 measurable sessions, not 65: a zero-width IB makes the ratio infinite.
    expect(facts.sessionsAnalyzed).toBe(62)
    expect(facts.session).toBeNull()
  })

  it('excludes an early-close session from the sample (feat-095 rule)', () => {
    const short = computeIbExtension({
      bars: [...reviewSessions(), ...session(LIVE_DATE, 0.2, 0, RTH_BARS_PER_SESSION - 1)],
    })!
    expect(short.sessionsAnalyzed).toBe(62)
    expect(short.session!.date).toBe(LIVE_DATE)
    expect(short.session!.complete).toBe(false)
  })
})

describe('feat-093 seam: the classifier is scored against the MEASURED sample', () => {
  /** A ladder wide enough to classify: IB in periods A–B, D extends up. */
  const rows: TpoRow[] = [
    { price: 29260, tpoCount: 1, letters: 'D' },
    { price: 29240, tpoCount: 2, letters: 'CD' },
    { price: 29220, tpoCount: 3, letters: 'BCD' },
    { price: 29200, tpoCount: 4, letters: 'ABCD' },
    { price: 29180, tpoCount: 3, letters: 'ABC' },
    { price: 29160, tpoCount: 2, letters: 'AB' },
    { price: 29140, tpoCount: 1, letters: 'A' },
  ]

  it('carries source and sample size from the live distribution into the fact', () => {
    const measured = computeIbExtension({ bars: reviewSessions() })!.distribution
    const withMeasured = classifyTpoDay({
      rows,
      step: 20,
      ib: { high: 29200, low: 29140 },
      sessionRange: { high: 29260, low: 29140 },
      singlePrintZones: [],
      periodClock: null,
      tpoPeriodMinutes: 30,
      distribution: measured,
    })!
    expect(withMeasured.distribution.source).toBe('measured')
    expect(withMeasured.distribution.sampleSize).toBe(62)

    // Same session, pinned thresholds: the classification itself is unchanged
    // (the two distributions agree), only its provenance differs — which is
    // exactly what feat-093's seam promised.
    const withPinned = classifyTpoDay({
      rows,
      step: 20,
      ib: { high: 29200, low: 29140 },
      sessionRange: { high: 29260, low: 29140 },
      singlePrintZones: [],
      periodClock: null,
      tpoPeriodMinutes: 30,
    })!
    expect(withPinned.distribution.source).toBe('pinned-empirical')
    expect(withMeasured.dayType).toBe(withPinned.dayType)
    expect(withMeasured.extension!.ratio).toBe(withPinned.extension!.ratio)
  })
})
