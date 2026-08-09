import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTpoProfile } from './parseTpo'
import type { TpoProfile, TpoRow } from './parseTpo'
import { computeTpoFacts, EXCESS_MIN_BINS, POC_PROMINENCE_MIN } from './tpoFacts'

const fixture = parseTpoProfile(
  readFileSync(join(__dirname, '..', '..', 'chart-data', 'tpo.data.md'), 'utf8'),
)

/** Synthetic profile on a 2.0-pt grid; rows given top-down as [price, count, letters]. */
function profile(rowSpec: Array<[number, number, string]>, summary?: Partial<TpoProfile['summary']>): TpoProfile {
  const rows: TpoRow[] = rowSpec.map(([price, tpoCount, letters]) => ({ price, tpoCount, letters }))
  const maxRow = rows.reduce((best, r) => (r.tpoCount > best.tpoCount ? r : best))
  return {
    meta: {
      sessionDate: '2026-06-16',
      session: 'RTH',
      tpoPeriodMinutes: 30,
      tickSize: 0.25,
      binSize: 8,
      step: 2,
      // Anchorless by default — the synthetic profiles double as the
      // pre-feat-092 export shape.
      firstPeriod: null,
    },
    summary: {
      pocPrice: maxRow.price,
      valueAreaHigh: rows[0].price,
      valueAreaLow: rows[rows.length - 1].price,
      ibHigh: rows[0].price,
      ibLow: rows[rows.length - 1].price,
      sessionHigh: rows[0].price,
      sessionLow: rows[rows.length - 1].price,
      ...summary,
    },
    rows,
  }
}

describe('computeTpoFacts on the chart-data fixture', () => {
  const facts = computeTpoFacts(fixture)

  it('carries the session identity and summary structure', () => {
    expect(facts.sessionDate).toBe('2026-06-16')
    expect(facts.session).toBe('RTH')
    expect(facts.valueArea).toEqual({ high: 29978, low: 29870 })
    expect(facts.initialBalance).toEqual({ high: 30044, low: 29988 })
    expect(facts.sessionRange).toEqual({ high: 30044, low: 29862 })
  })

  it('maps every period letter in the ladder to its clock start (feat-092)', () => {
    expect(facts.firstPeriod).toEqual({ letter: 'A', start: '2026-06-16 08:30:00' })
    expect(facts.periodClock).toEqual({
      A: '08:30',
      B: '09:00',
      C: '09:30',
      D: '10:00',
      E: '10:30',
      F: '11:00',
      G: '11:30',
      H: '12:00',
      I: '12:30',
      J: '13:00',
      K: '13:30',
      L: '14:00',
      M: '14:30',
    })
  })

  it('finds the prominent POC', () => {
    expect(facts.poc.price).toBe(29950)
    expect(facts.poc.tpoCount).toBe(7)
    expect(facts.poc.prominence).toBeGreaterThanOrEqual(POC_PROMINENCE_MIN)
    expect(facts.poc.prominent).toBe(true)
  })

  it('detects the mid-range single-print zone but not the bottom tail', () => {
    // The E-period flush left 29964-29986 single-printed; the F-only prints at
    // 29862-29868 touch the session low and are a tail, not a zone.
    expect(facts.singlePrintZones).toEqual([{ top: 29986, bottom: 29964, letters: 'E' }])
  })

  it('flags the poor high (2-TPO shelf at the session high) and no poor low', () => {
    expect(facts.poorHigh).toEqual({ price: 30044, tpoCount: 2 })
    expect(facts.poorLow).toBeNull()
  })

  it('measures the F-period buying tail the zone detector drops (feat-091)', () => {
    // The same 29862-29868 run `singlePrintZones` discards for touching the
    // session low is the day's excess — 4 bins on a 2-pt grid = 8 pts.
    expect(facts.excess.buyingTail).toEqual({
      kind: 'buying',
      bins: 4,
      points: 8,
      top: 29868,
      bottom: 29862,
      extreme: 29862,
      letters: 'F',
      clock: '11:00',
    })
    // The high is a 2-TPO shelf (poorHigh), so there is no selling excess.
    expect(facts.excess.sellingTail).toBeNull()
    expect(facts.excess.singlePrintBins).toBe(16)
    expect(facts.excess.totalBins).toBe(92)
    expect(facts.excess.singlePrintFraction).toBe(0.17)
  })
})

/**
 * Reference case from bundle 1c15934a (review 2026-08-07 D2): 446 bins on a
 * 1-pt grid, 227 of them single prints in exactly two runs — a 208-bin
 * A-period run off the session low and a 19-bin D-period run at the high.
 * Both were discarded before feat-091.
 */
function referenceProfile(): TpoProfile {
  const rows: TpoRow[] = []
  for (let price = 29686; price >= 29241; price -= 1) {
    if (price >= 29668) rows.push({ price, tpoCount: 1, letters: 'D' })
    else if (price > 29448) rows.push({ price, tpoCount: price === 29550 ? 9 : 3, letters: 'ABCD' })
    else rows.push({ price, tpoCount: 1, letters: 'A' })
  }
  return {
    meta: {
      sessionDate: '2026-08-06',
      session: 'RTH',
      tpoPeriodMinutes: 30,
      tickSize: 0.25,
      binSize: 4,
      step: 1,
      firstPeriod: { letter: 'A', start: '2026-08-06 08:30:00' },
    },
    summary: {
      pocPrice: 29550,
      valueAreaHigh: 29600,
      valueAreaLow: 29500,
      ibHigh: 29600,
      ibLow: 29450,
      sessionHigh: 29686,
      sessionLow: 29241,
    },
    rows,
  }
}

describe('computeTpoFacts excess on the two-run reference profile (feat-091)', () => {
  const facts = computeTpoFacts(referenceProfile())

  it('measures the 208-pt A-period buying tail off the session low', () => {
    expect(facts.excess.buyingTail).toEqual({
      kind: 'buying',
      bins: 208,
      points: 208,
      top: 29448,
      bottom: 29241,
      extreme: 29241,
      letters: 'A',
      clock: '08:30',
    })
  })

  it('measures the 19-pt D-period selling tail at the session high', () => {
    expect(facts.excess.sellingTail).toEqual({
      kind: 'selling',
      bins: 19,
      points: 19,
      top: 29686,
      bottom: 29668,
      extreme: 29686,
      letters: 'D',
      clock: '10:00',
    })
  })

  it('reports the session single-print fraction', () => {
    expect(facts.excess.singlePrintBins).toBe(227)
    expect(facts.excess.totalBins).toBe(446)
    expect(facts.excess.singlePrintFraction).toBe(0.51)
  })

  it('leaves interior singlePrintZones and poor-extreme semantics unchanged', () => {
    // Both runs touch an extreme, so neither is an interior zone — and neither
    // extreme is a 2+ TPO shelf.
    expect(facts.singlePrintZones).toEqual([])
    expect(facts.poorHigh).toBeNull()
    expect(facts.poorLow).toBeNull()
  })
})

describe('computeTpoFacts detection edges', () => {
  it('a single-print run touching the top is a tail, not a zone', () => {
    const facts = computeTpoFacts(
      profile([
        [29954, 1, 'D'],
        [29952, 1, 'D'],
        [29950, 3, 'ABC'],
        [29948, 2, 'AB'],
      ]),
    )
    expect(facts.singlePrintZones).toEqual([])
    expect(facts.poorHigh).toBeNull()
    // ...and feat-091 measures it as excess instead of dropping it.
    expect(facts.excess.sellingTail).toEqual({
      kind: 'selling',
      bins: 2,
      points: 4,
      top: 29954,
      bottom: 29952,
      extreme: 29954,
      letters: 'D',
      clock: null,
    })
    expect(facts.excess.buyingTail).toBeNull()
  })

  it('ignores an extreme single-print run shorter than EXCESS_MIN_BINS', () => {
    expect(EXCESS_MIN_BINS).toBe(2)
    const facts = computeTpoFacts(
      profile([
        [29954, 1, 'D'],
        [29952, 3, 'ABC'],
        [29950, 2, 'AB'],
      ]),
    )
    expect(facts.excess.sellingTail).toBeNull()
    expect(facts.excess.buyingTail).toBeNull()
    expect(facts.excess.singlePrintFraction).toBe(0.33)
  })

  it('reports no excess when both extremes are multi-TPO', () => {
    const facts = computeTpoFacts(
      profile([
        [29954, 2, 'AB'],
        [29952, 1, 'A'],
        [29950, 3, 'ABC'],
      ]),
    )
    expect(facts.excess.buyingTail).toBeNull()
    expect(facts.excess.sellingTail).toBeNull()
    expect(facts.excess.singlePrintBins).toBe(1)
    expect(facts.excess.singlePrintFraction).toBe(0.33)
  })

  it('breaks the tail run at a price gap and orders letters by period', () => {
    const facts = computeTpoFacts(
      profile([
        [29958, 4, 'ABCD'],
        [29956, 1, 'C'],
        [29954, 1, 'B'],
        // 29952 untraded — the tail must not bridge the hole
        [29950, 1, 'A'],
      ]),
    )
    expect(facts.excess.buyingTail).toBeNull()
    expect(facts.excess.sellingTail).toBeNull()
    const contiguous = computeTpoFacts(
      profile([
        [29958, 4, 'ABCD'],
        [29956, 1, 'C'],
        [29954, 1, 'B'],
        [29952, 1, 'A'],
      ]),
    )
    expect(contiguous.excess.buyingTail).toMatchObject({ bins: 3, points: 6, letters: 'ABC' })
  })

  it('reports no tail when the whole ladder is single-printed (no body)', () => {
    const facts = computeTpoFacts(
      profile([
        [29954, 1, 'A'],
        [29952, 1, 'A'],
        [29950, 1, 'A'],
      ]),
    )
    expect(facts.excess.buyingTail).toBeNull()
    expect(facts.excess.sellingTail).toBeNull()
    expect(facts.excess.singlePrintFraction).toBe(1)
  })

  it('a price gap breaks single-print contiguity into separate zones', () => {
    const facts = computeTpoFacts(
      profile([
        [29958, 2, 'AB'],
        [29956, 1, 'A'],
        // 29954 untraded — the run must not bridge the hole
        [29952, 1, 'A'],
        [29950, 4, 'ABCD'],
      ]),
    )
    expect(facts.singlePrintZones).toEqual([
      { top: 29956, bottom: 29956, letters: 'A' },
      { top: 29952, bottom: 29952, letters: 'A' },
    ])
  })

  it('detects a poor low and merges letters across a multi-period zone', () => {
    const facts = computeTpoFacts(
      profile([
        [29958, 3, 'ABE'],
        [29956, 1, 'A'],
        [29954, 1, 'E'],
        [29952, 4, 'CDEF'],
        [29950, 2, 'CD'],
      ]),
    )
    expect(facts.singlePrintZones).toEqual([{ top: 29956, bottom: 29954, letters: 'AE' }])
    expect(facts.poorLow).toEqual({ price: 29950, tpoCount: 2 })
  })

  it('an unremarkable POC is not prominent', () => {
    const facts = computeTpoFacts(
      profile([
        [29956, 2, 'AB'],
        [29954, 3, 'ABC'],
        [29952, 2, 'BC'],
        [29950, 2, 'BC'],
      ]),
    )
    expect(facts.poc.prominence).toBe(1.5)
    expect(facts.poc.prominent).toBe(true)
    const flat = computeTpoFacts(
      profile([
        [29956, 2, 'AB'],
        [29954, 2, 'AB'],
        [29952, 3, 'ABC'],
        [29950, 3, 'BCD'],
      ]),
    )
    expect(flat.poc.prominence).toBe(1.2)
    expect(flat.poc.prominent).toBe(false)
  })

  it('falls back to the max-count row when the summary POC price is off-ladder', () => {
    const facts = computeTpoFacts(
      profile(
        [
          [29954, 2, 'AB'],
          [29952, 5, 'ABCDE'],
          [29950, 2, 'DE'],
        ],
        { pocPrice: 29900 },
      ),
    )
    expect(facts.poc.price).toBe(29952)
    expect(facts.poc.tpoCount).toBe(5)
  })

  it('reports a zeroed Initial Balance as null', () => {
    const facts = computeTpoFacts(
      profile([[29952, 2, 'AB'], [29950, 3, 'ABC']], { ibHigh: 0, ibLow: 0 }),
    )
    expect(facts.initialBalance).toBeNull()
  })

  it('degrades the period clock to null on an anchorless (older) export', () => {
    const facts = computeTpoFacts(profile([[29952, 2, 'AB'], [29950, 3, 'ABC']]))
    expect(facts.firstPeriod).toBeNull()
    expect(facts.periodClock).toBeNull()
  })

  it('throws on an empty ladder', () => {
    expect(() =>
      computeTpoFacts({ ...profile([[29950, 1, 'A']]), rows: [] }),
    ).toThrow(/no rows/)
  })
})
