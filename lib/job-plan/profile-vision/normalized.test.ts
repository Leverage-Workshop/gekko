import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseVbpProfile } from '@/lib/engine/parseProfile'
import { toleranceFor } from './bench'
import type { Instrument } from './instrument'
import {
  fractionToPrice,
  NORMALIZED_PRECISION,
  priceToFraction,
  toNormalizedRead,
  toPriceRead,
} from './normalized'
import { renderProfile } from './renderProfile'
import {
  profileNodesReadNormalizedSchema,
  profileNodesReadSchema,
  type ProfileNodesRead,
} from './schema'

/**
 * Real golden profiles with deliberately different spans and both instruments —
 * the widest NQ and the tightest ES in the golden set — because the whole bet
 * of feat-135 is that a fraction resolves finely enough on ANY of them.
 */
const CASES: readonly { date: string; instrument: Instrument }[] = [
  { date: '2026-02-13', instrument: 'NQ' },
  { date: '2026-02-20', instrument: 'ES' },
  { date: '2026-03-06', instrument: 'NQ' },
  { date: '2026-06-02', instrument: 'ES' },
]

function spanOf(
  date: string,
  instrument: Instrument
): {
  priceLow: number
  priceHigh: number
  step: number
} {
  const path = join(process.cwd(), 'chart-data/job-lvn-golden', date, 'five-day-rolling.vbp.md')
  const profile = parseVbpProfile(readFileSync(path, 'utf8'), { fillMissingRows: true })
  const { meta } = renderProfile(profile, { instrument })
  return { priceLow: meta.priceLow, priceHigh: meta.priceHigh, step: meta.step }
}

describe('fractionToPrice / priceToFraction', () => {
  it('anchors 0 at the bottom edge, 1 at the top, 0.5 at the midpoint', () => {
    const span = { priceLow: 100, priceHigh: 200 }
    expect(fractionToPrice(span, 0)).toBe(100)
    expect(fractionToPrice(span, 1)).toBe(200)
    expect(fractionToPrice(span, 0.5)).toBe(150)
    expect(priceToFraction(span, 100)).toBe(0)
    expect(priceToFraction(span, 200)).toBe(1)
    expect(priceToFraction(span, 150)).toBe(0.5)
  })

  it('clamps a price outside the image to the nearest edge', () => {
    const span = { priceLow: 100, priceHigh: 200 }
    expect(priceToFraction(span, 40)).toBe(0)
    expect(priceToFraction(span, 900)).toBe(1)
  })

  it('rejects a degenerate span and a non-finite input', () => {
    expect(() => fractionToPrice({ priceLow: 5, priceHigh: 5 }, 0.5)).toThrow(
      /priceHigh > priceLow/
    )
    expect(() => priceToFraction({ priceLow: 9, priceHigh: 1 }, 5)).toThrow(/priceHigh > priceLow/)
    expect(() => fractionToPrice({ priceLow: 0, priceHigh: 1 }, NaN)).toThrow(/finite/)
    expect(() => priceToFraction({ priceLow: 0, priceHigh: 1 }, Infinity)).toThrow(/finite/)
  })

  /**
   * The load-bearing claim: a fraction says WHERE precisely enough that the
   * price it converts to is exact for practical purposes. The epsilon is the
   * rounding of the stored fraction (span x 5e-7), which is four orders of
   * magnitude inside the R1 match tolerance the read is scored against.
   */
  it.each(CASES)(
    'round-trips price -> fraction -> price on $date $instrument well inside tolerance',
    ({ date, instrument }) => {
      const span = spanOf(date, instrument)
      const height = span.priceHigh - span.priceLow
      const epsilon = height * 10 ** -NORMALIZED_PRECISION
      expect(epsilon).toBeLessThan(toleranceFor(instrument) / 1000)

      // every 1 % of the span, plus both edges and the odd fractional price
      const probes = [
        span.priceLow,
        span.priceHigh,
        ...Array.from({ length: 101 }, (_, i) => span.priceLow + (i / 100) * height),
        span.priceLow + height / 3,
        span.priceHigh - span.step / 2,
      ]
      for (const price of probes) {
        const y = priceToFraction(span, price)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
        expect(Math.abs(fractionToPrice(span, y) - price)).toBeLessThanOrEqual(epsilon)
      }
    }
  )

  it.each(CASES)(
    'round-trips fraction -> price -> fraction on $date $instrument',
    ({ date, instrument }) => {
      const span = spanOf(date, instrument)
      for (let i = 0; i <= 200; i++) {
        const y = i / 200
        expect(priceToFraction(span, fractionToPrice(span, y))).toBeCloseTo(y, 5)
      }
    }
  )
})

function read(overrides: Partial<ProfileNodesRead> = {}): ProfileNodesRead {
  return {
    nodes: [
      {
        kind: 'lvn',
        priceLow: 24948,
        priceHigh: 24959,
        prominence: 1,
        primary: true,
        position: 'lower',
        shape: 'valley',
        rationale: 'the wall',
      },
      {
        kind: 'hvn-core',
        priceLow: 25350,
        priceHigh: 25380,
        prominence: 1,
        primary: false,
        position: 'top',
        shape: 'notch',
        rationale: 'peak',
      },
    ],
    thinZones: [{ low: 24928, high: 25040 }],
    profileShape: 'double',
    unfinished: false,
    ...overrides,
  }
}

describe('toNormalizedRead / toPriceRead', () => {
  const span = { priceLow: 24621, priceHigh: 25466 }

  it('converts a whole read both ways and preserves every non-band field', () => {
    const normalized = toNormalizedRead(read(), span)
    expect(profileNodesReadNormalizedSchema.safeParse(normalized).success).toBe(true)
    expect(normalized.nodes[0]).toMatchObject({
      kind: 'lvn',
      prominence: 1,
      primary: true,
      position: 'lower',
      shape: 'valley',
      rationale: 'the wall',
    })
    expect(normalized.nodes[0].yLow).toBeCloseTo((24948 - 24621) / 845, 5)
    expect(normalized.nodes[0].yHigh).toBeCloseTo((24959 - 24621) / 845, 5)
    expect(normalized.thinZones[0].yLow).toBeCloseTo((24928 - 24621) / 845, 5)

    // A round trip is exact only to the stored fraction's rounding — 0.000845
    // points on this span, i.e. 1/23000 of the NQ match tolerance.
    const back = toPriceRead(normalized, span)
    expect(profileNodesReadSchema.safeParse(back).success).toBe(true)
    const eps = (span.priceHigh - span.priceLow) * 10 ** -NORMALIZED_PRECISION
    const pairs = back.nodes.map((n) => [n.priceLow, n.priceHigh])
    for (const [i, [low, high]] of [
      [24948, 24959],
      [25350, 25380],
    ].entries()) {
      expect(Math.abs(pairs[i][0] - low)).toBeLessThanOrEqual(eps)
      expect(Math.abs(pairs[i][1] - high)).toBeLessThanOrEqual(eps)
    }
    expect(Math.abs(back.thinZones[0].low - 24928)).toBeLessThanOrEqual(eps)
    expect(Math.abs(back.thinZones[0].high - 25040)).toBeLessThanOrEqual(eps)
    expect(back.profileShape).toBe('double')
    expect(back.unfinished).toBe(false)
  })

  it('keeps a point band a point and never inverts a band', () => {
    const point = read({
      nodes: [
        {
          kind: 'lvn',
          priceLow: 25000,
          priceHigh: 25000,
          prominence: 2,
          primary: true,
          position: 'mid',
          shape: 'notch',
          rationale: 'point',
        },
      ],
      thinZones: [],
    })
    const back = toPriceRead(toNormalizedRead(point, span), span)
    // exactly equal edges — a point stays a point, whatever the rounding does
    expect(back.nodes[0].priceLow).toBe(back.nodes[0].priceHigh)
    expect(back.nodes[0].priceLow).toBeCloseTo(25000, 3)
  })
})
