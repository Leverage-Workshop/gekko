import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTpoProfile } from './parseTpo'
import type { TpoProfile, TpoRow } from './parseTpo'
import { computeTpoFacts, POC_PROMINENCE_MIN } from './tpoFacts'

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
