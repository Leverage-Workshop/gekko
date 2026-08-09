import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTpoProfile } from './parseTpo'
import type { TpoProfile, TpoRow } from './parseTpo'
import { computeTpoFacts } from './tpoFacts'
import {
  classifyTpoDay,
  DOUBLE_DISTRIBUTION_MIN_BODY_FRACTION,
  MIN_CLASSIFY_PERIODS,
  PINNED_IB_EXTENSION_DISTRIBUTION,
} from './tpoDayType'
import type { IbExtensionDistribution } from './tpoDayType'

const fixtureText = readFileSync(join(__dirname, '..', '..', 'chart-data', 'tpo.data.md'), 'utf8')
const fixture = parseTpoProfile(fixtureText)

const STEP = 2

/** Period letter → `[high, low]` on a 2.0-pt grid, in period order. */
type PeriodSpec = Record<string, [number, number]>

/**
 * Build a price-descending ladder from per-period ranges — the shape the real
 * export has (each period covers a contiguous span; a bin no period traded is
 * absent, exactly as the study writes it).
 */
function ladder(spec: PeriodSpec): TpoRow[] {
  const entries = Object.entries(spec)
  const top = Math.max(...entries.map(([, [high]]) => high))
  const bottom = Math.min(...entries.map(([, [, low]]) => low))
  const rows: TpoRow[] = []
  for (let price = top; price >= bottom - 1e-9; price -= STEP) {
    const letters = entries
      .filter(([, [high, low]]) => price <= high + 1e-9 && price >= low - 1e-9)
      .map(([letter]) => letter)
      .join('')
    if (letters.length > 0) rows.push({ price, tpoCount: letters.length, letters })
  }
  return rows
}

/** A full TpoProfile around a period spec, so the wiring in tpoFacts is exercised too. */
function profile(spec: PeriodSpec, summary?: Partial<TpoProfile['summary']>): TpoProfile {
  const rows = ladder(spec)
  const maxRow = rows.reduce((best, r) => (r.tpoCount > best.tpoCount ? r : best))
  return {
    meta: {
      sessionDate: '2026-06-16',
      session: 'RTH',
      tpoPeriodMinutes: 30,
      tickSize: 0.25,
      binSize: 8,
      step: STEP,
      // Anchorless by default: the live bundles carry no period→clock anchor
      // until the Sierra study ships feat-092's two metadata lines.
      firstPeriod: null,
    },
    summary: {
      pocPrice: maxRow.price,
      valueAreaHigh: rows[0].price,
      valueAreaLow: rows[rows.length - 1].price,
      // Zeros = "the export carries no IB" — overridden per case.
      ibHigh: 0,
      ibLow: 0,
      sessionHigh: rows[0].price,
      sessionLow: rows[rows.length - 1].price,
      ...summary,
    },
    rows,
  }
}

/** Classification of a synthetic session, through the real tpoFacts wiring. */
function classify(spec: PeriodSpec, summary?: Partial<TpoProfile['summary']>) {
  const facts = computeTpoFacts(profile(spec, summary))
  return facts.classification
}

// ---------------------------------------------------------------------------
// Synthetic sessions. Each spec is [high, low] per period, on a 2-pt grid.
// ---------------------------------------------------------------------------

/** One-timeframe slide: A/B set a 12-pt IB, C–F walk it 40 pts lower. */
const TREND_DOWN: PeriodSpec = {
  A: [1000, 990],
  B: [998, 988],
  C: [994, 978],
  D: [984, 968],
  E: [974, 958],
  F: [964, 948],
}

describe('classifyTpoDay on the chart-data fixture', () => {
  const classification = computeTpoFacts(fixture).classification

  it('classifies the session as a double distribution', () => {
    expect(classification).not.toBeNull()
    expect(classification!.dayType).toBe('double-distribution')
    // The two bodies (30044–29988 built by A–D, 29962–29862 built by E–M) are
    // split by E's 12-bin single-print vacuum.
    expect(classification!.dayTypeBasis).toContain('12-bin single-print vacuum 29964–29986')
    // …and the extension also clears the trend threshold, which the basis says
    // rather than silently discarding: this is a double-distribution trend day.
    expect(classification!.dayTypeBasis).toContain('double-distribution trend day')
  })

  it('measures the IB extension against the pinned empirical distribution', () => {
    expect(classification!.extension).toEqual({
      high: 30044,
      low: 29988,
      range: 56,
      source: 'export',
      ratio: 3.25,
      band: 'above-p90',
      up: 0,
      down: 126,
      sides: 'down',
    })
    expect(classification!.distribution).toEqual({
      source: 'pinned-empirical',
      sampleSize: 62,
      p25: 1.25,
      p90: 2.58,
    })
  })

  it('reads the open as an auction around the opening period', () => {
    expect(classification!.openType).toBe('open-auction')
    expect(classification!.openDirection).toBeNull()
    expect(classification!.openTypeBasis).toContain('A 08:30')
  })

  it('lists range extension by period and the periods that printed the extremes', () => {
    expect(classification!.periods).toBe('ABCDEFGHIJKLM')
    // Only periods that actually pushed the range out are listed; A establishes
    // it, and G–M rotated inside it.
    expect(classification!.extensions).toEqual([
      { letter: 'B', clock: '09:00', up: 14, down: 0 },
      { letter: 'E', clock: '10:30', up: 0, down: 118 },
      { letter: 'F', clock: '11:00', up: 0, down: 8 },
    ])
    expect(classification!.highPeriod).toEqual({ letter: 'B', clock: '09:00', price: 30044 })
    expect(classification!.lowPeriod).toEqual({ letter: 'F', clock: '11:00', price: 29862 })
  })
})

describe('classifyTpoDay without a period→clock anchor', () => {
  // The live bundles carry no anchor until the Sierra ACSIL study ships
  // feat-092's two metadata lines, so the classifier must never depend on one:
  // letter SEQUENCE is always available, clock time is best-effort.
  const anchorless = parseTpoProfile(
    fixtureText
      .split('\n')
      .filter((line) => !line.includes('First Period'))
      .join('\n'),
  )
  const facts = computeTpoFacts(anchorless)

  it('has no clock map at all', () => {
    expect(facts.firstPeriod).toBeNull()
    expect(facts.periodClock).toBeNull()
  })

  it('classifies the session identically, with null clocks', () => {
    const withClock = computeTpoFacts(fixture).classification!
    const without = facts.classification!
    expect(without.dayType).toBe(withClock.dayType)
    expect(without.openType).toBe(withClock.openType)
    expect(without.extension).toEqual(withClock.extension)
    expect(without.periods).toBe(withClock.periods)
    expect(without.extensions.map((e) => e.letter)).toEqual(['B', 'E', 'F'])
    expect(without.extensions.every((e) => e.clock === null)).toBe(true)
    expect(without.highPeriod).toEqual({ letter: 'B', clock: null, price: 30044 })
    expect(without.lowPeriod).toEqual({ letter: 'F', clock: null, price: 29862 })
    expect(without.openTypeBasis).toContain('(A)')
  })
})

describe('day type', () => {
  it('calls a one-sided slide in the top decile a trend day', () => {
    const c = classify(TREND_DOWN, { ibHigh: 1000, ibLow: 988 })!
    expect(c.dayType).toBe('trend')
    expect(c.extension).toMatchObject({ ratio: 4.33, sides: 'down', down: 40, up: 0, band: 'above-p90' })
    expect(c.dayTypeBasis).toContain(`p90 of ${PINNED_IB_EXTENSION_DISTRIBUTION.p90}`)
  })

  it('calls a session that held its Initial Balance a normal day', () => {
    const c = classify(
      { A: [1000, 980], B: [998, 982], C: [996, 984] },
      { ibHigh: 1000, ibLow: 980 },
    )!
    expect(c.dayType).toBe('normal')
    expect(c.extension).toMatchObject({ ratio: 1, sides: 'none', band: 'below-p25' })
    expect(c.dayTypeBasis).toContain(`p25 of ${PINNED_IB_EXTENSION_DISTRIBUTION.p25}`)
  })

  it('calls an ordinary one-sided extension a normal-variation day', () => {
    const c = classify(
      { A: [1000, 990], B: [998, 988], C: [1008, 994], D: [1010, 998] },
      { ibHigh: 1000, ibLow: 988 },
    )!
    expect(c.dayType).toBe('normal-variation')
    expect(c.extension).toMatchObject({ ratio: 1.83, sides: 'up', up: 10, band: 'median-p75' })
  })

  it('calls a both-sided extension a neutral day', () => {
    const c = classify(
      { A: [1000, 990], B: [998, 988], C: [1004, 994], D: [992, 982], E: [996, 986] },
      { ibHigh: 1000, ibLow: 988 },
    )!
    expect(c.dayType).toBe('neutral')
    expect(c.extension).toMatchObject({ sides: 'both', up: 4, down: 6 })
  })

  it('calls a neutral day whose last period sits on an extreme a neutral-extreme day', () => {
    const c = classify(
      {
        A: [1000, 990],
        B: [998, 988],
        C: [1004, 994],
        D: [992, 982],
        E: [996, 986],
        F: [1006, 998],
      },
      { ibHigh: 1000, ibLow: 988 },
    )!
    expect(c.dayType).toBe('neutral-extreme')
    expect(c.dayTypeBasis).toContain('last period F sits on the session high')
  })

  it('does not call a lopsided single-print run a double distribution', () => {
    // A 5-bin interior single-print run, but the body above it is 2 of 21 bins
    // — under DOUBLE_DISTRIBUTION_MIN_BODY_FRACTION, so it is a thin start to a
    // slide, not a second distribution.
    expect(DOUBLE_DISTRIBUTION_MIN_BODY_FRACTION).toBeGreaterThan(2 / 21)
    const c = classify({
      A: [1000, 998],
      B: [996, 988],
      C: [986, 962],
      D: [984, 960],
    })!
    expect(c.dayType).toBe('trend')
  })
})

describe('open type', () => {
  it('reads a session that left the opening period and never returned as an open-drive', () => {
    const c = classify(TREND_DOWN, { ibHigh: 1000, ibLow: 988 })!
    expect(c.openType).toBe('open-drive')
    expect(c.openDirection).toBe('down')
    expect(c.openTypeBasis).toContain('without trading back through the opening period')
  })

  it('reads a shallow failed probe followed by a drive as an open-test-drive', () => {
    const c = classify(
      { A: [1000, 990], B: [998, 988], C: [1008, 994], D: [1010, 998] },
      { ibHigh: 1000, ibLow: 988 },
    )!
    expect(c.openType).toBe('open-test-drive')
    expect(c.openDirection).toBe('up')
  })

  it('reads a deep probe reversed further the other way as an open-rejection-reverse', () => {
    const c = classify({ A: [1000, 990], B: [986, 978], C: [1020, 992], D: [1016, 996] })!
    expect(c.openType).toBe('open-rejection-reverse')
    expect(c.openDirection).toBe('up')
  })

  it('reads rotation around the opening period as an open-auction', () => {
    const c = classify(
      { A: [1000, 980], B: [998, 982], C: [996, 984] },
      { ibHigh: 1000, ibLow: 980 },
    )!
    expect(c.openType).toBe('open-auction')
    expect(c.openDirection).toBeNull()
  })
})

describe('degradation', () => {
  it('returns null when the ladder holds fewer than MIN_CLASSIFY_PERIODS periods', () => {
    expect(MIN_CLASSIFY_PERIODS).toBe(3)
    expect(classify({ A: [1000, 990], B: [998, 986] })).toBeNull()
  })

  it('returns null on an empty ladder', () => {
    expect(
      classifyTpoDay({
        rows: [],
        step: STEP,
        ib: null,
        sessionRange: { high: 1000, low: 990 },
        singlePrintZones: [],
        periodClock: null,
        tpoPeriodMinutes: 30,
      }),
    ).toBeNull()
  })

  it('reconstructs the Initial Balance from the first hour when the export carries none', () => {
    // ibHigh/ibLow default to 0 in the helper — the pre-IB export shape.
    const c = classify(TREND_DOWN)!
    expect(c.extension).toMatchObject({ source: 'reconstructed', high: 1000, low: 988, range: 12 })
    expect(c.dayType).toBe('trend')
  })

  it('ignores a sub-bin poke past the IB edge', () => {
    // Session high 1 pt (half a bin) above the IB high: grid noise, not an
    // extension — the day stays one-sided.
    const c = classify(
      { A: [1000, 990], B: [998, 988], C: [994, 978], D: [984, 968] },
      { ibHigh: 999, ibLow: 988, sessionHigh: 1000, sessionLow: 968 },
    )!
    expect(c.extension).toMatchObject({ up: 1, sides: 'down' })
  })
})

describe('the empirical-threshold seam (feat-100)', () => {
  it('scores against a live-computed distribution when one is supplied', () => {
    const rows = ladder(TREND_DOWN)
    const measured: IbExtensionDistribution = {
      source: 'measured',
      sampleSize: 120,
      p25: 1.4,
      median: 2.1,
      p75: 3.4,
      p90: 5.2,
      max: 8,
      sides: { none: 0.03, oneSided: 0.8, bothSides: 0.17 },
    }
    const args = {
      rows,
      step: STEP,
      ib: { high: 1000, low: 988 },
      sessionRange: { high: 1000, low: 948 },
      singlePrintZones: [],
      periodClock: null,
      tpoPeriodMinutes: 30,
    }
    // Same session, same 4.33x extension — a wider measured distribution puts
    // it below the trend decile, and the fact says which distribution judged it.
    expect(classifyTpoDay(args)!.dayType).toBe('trend')
    const withMeasured = classifyTpoDay({ ...args, distribution: measured })!
    expect(withMeasured.dayType).toBe('normal-variation')
    expect(withMeasured.extension).toMatchObject({ ratio: 4.33, band: 'p75-p90' })
    expect(withMeasured.distribution).toEqual({
      source: 'measured',
      sampleSize: 120,
      p25: 1.4,
      p90: 5.2,
    })
    expect(withMeasured.dayTypeBasis).toContain('n=120')
  })
})
