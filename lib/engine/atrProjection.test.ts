import { describe, expect, it } from 'vitest'
import {
  ATR_PROJECTION_MULTIPLES,
  computeAtrProjections,
  type AtrProjectionReference,
} from './atrProjection'
import type { HtfStructureFacts, HtfSwing } from './htfStructure'
import {
  DEFAULT_SIGNIFICANT_MOVE_SIGMA,
  SIGNIFICANT_MOVE_FALLBACK_PTS,
  resolveScaledGate,
} from './scaledGates'

const ATR = 100

function htf(overrides: Partial<HtfStructureFacts> = {}): HtfStructureFacts {
  const swing = (price: number): HtfSwing => ({ price, dateTime: '2026-08-09 09:00' })
  return {
    barsAnalyzed: 200,
    windowStart: '2026-08-01 08:30',
    windowEnd: '2026-08-09 09:00',
    lastClose: 20000,
    atrPoints: ATR,
    trend: { state: 'range', basis: 'test', integrity: null, integrityBasis: null },
    recentSwingHighs: [swing(20400)],
    recentSwingLows: [swing(19600)],
    rotation: null,
    currentVsSwings: {
      fromLastSwingHighPts: null,
      fromLastSwingHighAtr: null,
      fromLastSwingLowPts: null,
      fromLastSwingLowAtr: null,
    },
    ...overrides,
  }
}

/** A measured scale where 0.4σ resolves to 118 pts — the fixture's own geometry. */
const measuredGate = resolveScaledGate(
  DEFAULT_SIGNIFICANT_MOVE_SIGMA,
  SIGNIFICANT_MOVE_FALLBACK_PTS,
  { sessionSigmaPts: 295 },
)
/** Unmeasured scale: the gate falls back to the fixed 50 pts. */
const fallbackGate = resolveScaledGate(
  DEFAULT_SIGNIFICANT_MOVE_SIGMA,
  SIGNIFICANT_MOVE_FALLBACK_PTS,
  null,
)

const pricesFor = (
  facts: ReturnType<typeof computeAtrProjections>,
  reference: AtrProjectionReference,
) => facts!.rungs.filter((r) => r.reference === reference)

describe('computeAtrProjections', () => {
  it('projects current price in BOTH directions at every multiple', () => {
    const facts = computeAtrProjections(htf(), 20000, measuredGate)!
    const rungs = pricesFor(facts, 'current-price')

    expect(rungs).toHaveLength(ATR_PROJECTION_MULTIPLES.length * 2)
    for (const magnitude of ATR_PROJECTION_MULTIPLES) {
      for (const direction of [1, -1]) {
        const expected = 20000 + magnitude * direction * ATR
        const rung = rungs.find((r) => r.multiple === magnitude * direction)
        expect(rung, `${magnitude}x ${direction}`).toBeDefined()
        expect(rung!.price).toBe(expected)
        expect(rung!.referencePrice).toBe(20000)
        expect(rung!.projectionPts).toBe(magnitude * ATR)
      }
    }
    // Concrete: the operator's "current price plus one ATR".
    expect(rungs.map((r) => r.price)).toContain(20100)
    expect(rungs.map((r) => r.price)).toContain(19900)
  })

  it('projects the confirmed swings OUTWARD only — the reversal rungs', () => {
    const facts = computeAtrProjections(htf(), 20000, measuredGate)!

    const highs = pricesFor(facts, 'last-swing-high')
    expect(highs).toHaveLength(ATR_PROJECTION_MULTIPLES.length)
    expect(highs.every((r) => r.multiple > 0 && r.price > 20400)).toBe(true)

    const lows = pricesFor(facts, 'last-swing-low')
    expect(lows).toHaveLength(ATR_PROJECTION_MULTIPLES.length)
    expect(lows.every((r) => r.multiple < 0 && r.price < 19600)).toBe(true)

    // The operator's "swing low minus one ATR".
    expect(lows.map((r) => r.price)).toContain(19500)
    expect(highs.map((r) => r.price)).toContain(20500)
  })

  it('carries a quotable attribution label naming the reference and the multiple', () => {
    const facts = computeAtrProjections(htf(), 20000, measuredGate)!
    const labels = facts.rungs.map((r) => r.label)

    expect(labels).toContain('current price (20000) +1× ATR')
    expect(labels).toContain('current price (20000) −0.5× ATR')
    expect(labels).toContain('last swing high (20400) +2× ATR')
    expect(labels).toContain('last swing low (19600) −1.5× ATR')
    // Every rung is attributable — no bare numbers.
    for (const rung of facts.rungs) {
      expect(rung.label).toContain('ATR')
      expect(rung.label).toContain(String(rung.referencePrice))
    }
  })

  it('NEVER fabricates a swing rung when that side has no confirmed swing', () => {
    const noHighs = computeAtrProjections(
      htf({ recentSwingHighs: [] }),
      20000,
      measuredGate,
    )!
    expect(pricesFor(noHighs, 'last-swing-high')).toHaveLength(0)
    expect(pricesFor(noHighs, 'last-swing-low').length).toBeGreaterThan(0)

    const noSwings = computeAtrProjections(
      htf({ recentSwingHighs: [], recentSwingLows: [] }),
      20000,
      measuredGate,
    )!
    expect(noSwings.rungs.every((r) => r.reference === 'current-price')).toBe(true)
    expect(noSwings.rungs).toHaveLength(ATR_PROJECTION_MULTIPLES.length * 2)
  })

  it('degrades to null with no HTF export and with an unmeasurable ATR', () => {
    expect(computeAtrProjections(null, 20000, measuredGate)).toBeNull()
    expect(computeAtrProjections(htf({ atrPoints: 0 }), 20000, measuredGate)).toBeNull()
  })

  it('returns rungs price-descending', () => {
    const facts = computeAtrProjections(htf(), 20000, measuredGate)!
    const prices = facts.rungs.map((r) => r.price)
    expect([...prices].sort((a, b) => b - a)).toEqual(prices)
  })

  /**
   * The constraint this feature exists to surface (feat-096 / feat-108): one
   * ATR is ~0.4σ, which is the significant-move floor itself, so the sub-1x
   * rungs cannot host a target — and WHICH rungs clear is a per-run question,
   * not a property of the multiple.
   */
  describe('the significant-move relationship', () => {
    it('marks every rung under the resolved floor as unable to host a target', () => {
      const facts = computeAtrProjections(htf(), 20000, measuredGate)!
      expect(measuredGate.pts).toBe(118)

      for (const rung of facts.rungs) {
        expect(rung.clearsSignificantMove, rung.label).toBe(rung.projectionPts >= 118)
      }
      // At a 100-pt ATR against a 118-pt floor, BOTH 0.5x and 1x fall short.
      const shortfall = facts.rungs.filter((r) => !r.clearsSignificantMove)
      expect(new Set(shortfall.map((r) => Math.abs(r.multiple)))).toEqual(new Set([0.5, 1]))
    })

    it('re-resolves per run: the same multiples clear under the fixed fallback', () => {
      const facts = computeAtrProjections(htf(), 20000, fallbackGate)!
      expect(fallbackGate.measured).toBe(false)
      expect(facts.significantMovePts).toBe(SIGNIFICANT_MOVE_FALLBACK_PTS)
      // 0.5x = 50 pts, which meets the 50-pt fallback — a static filter on the
      // multiple would have been wrong in this regime.
      expect(facts.rungs.every((r) => r.clearsSignificantMove)).toBe(true)
      expect(facts.atrSigma).toBeNull()
    })

    it('SAYS SO in a quotable note rather than emitting the near rungs silently', () => {
      const facts = computeAtrProjections(htf(), 20000, measuredGate)!
      expect(facts.atrSigma).toBe(0.34)
      expect(facts.significantMoveNote).toContain('one 30-min ATR is 100 pts')
      expect(facts.significantMoveNote).toContain('significant-move floor')
      expect(facts.significantMoveNote).toContain('8 of these rungs are flagged')
      expect(facts.significantMoveNote).toContain('entry or stop structure only')

      const clean = computeAtrProjections(htf({ atrPoints: 400 }), 20000, measuredGate)!
      expect(clean.rungs.every((r) => r.clearsSignificantMove)).toBe(true)
      expect(clean.significantMoveNote).toContain('every rung here clears the floor')
    })
  })
})
