import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIGNIFICANT_MOVE_SIGMA,
  MAX_ENTRY_CHASE_FALLBACK_PTS,
  MAX_ENTRY_CHASE_SIGMA,
  MIN_ENTRY_STANDOFF_FALLBACK_PTS,
  MIN_ENTRY_STANDOFF_SIGMA,
  REFERENCE_SESSION_SIGMA_PTS,
  SIGNIFICANT_MOVE_FALLBACK_PTS,
  describeGate,
  resolveGates,
  resolveScaledGate,
} from './scaledGates'
import { SIGMA_NOISE_MAX } from './volatilityScale'

/**
 * The numbers here are the review's measured distribution (docs/
 * data-bundle-review-2026-08-07.md §D3), not values read back out of the
 * implementation: median Parkinson session sigma 283 pts, median 30-min bar
 * range 110 pts, median RTH day range 464 pts.
 */
const MEASURED = { sessionSigmaPts: REFERENCE_SESSION_SIGMA_PTS }
const MEDIAN_BAR_RANGE_PTS = 110
const MEDIAN_DAY_RANGE_PTS = 464

describe('the default multiples against the measured distribution', () => {
  it('the significant-move floor resolves to ~85 pts at the reference sigma', () => {
    const gate = resolveScaledGate(
      DEFAULT_SIGNIFICANT_MOVE_SIGMA,
      SIGNIFICANT_MOVE_FALLBACK_PTS,
      MEASURED,
    )
    // feat-112: 0.3 × 283 = 84.9 (was 0.4 × 283 = 113.2).
    expect(gate.pts).toBe(84.9)
    expect(gate.measured).toBe(true)
  })

  it('asks for well under one median 30-min bar (the retired 50 pts asked for 0.45)', () => {
    // feat-112 re-tune: 0.4σ was chosen BECAUSE it was one median bar range at
    // the 283-pt reference, but that equivalence only held at that sigma — by
    // 2026-08-11 the same multiple had drifted to ~1.5 bars. The floor is no
    // longer pinned to the bar range at all; it is pinned to the operator's
    // rotation (below) and floored by the noise band.
    const floor = resolveScaledGate(
      DEFAULT_SIGNIFICANT_MOVE_SIGMA,
      SIGNIFICANT_MOVE_FALLBACK_PTS,
      MEASURED,
    ).pts
    expect(floor / MEDIAN_BAR_RANGE_PTS).toBeCloseTo(0.77, 2)
    expect(SIGNIFICANT_MOVE_FALLBACK_PTS / MEDIAN_BAR_RANGE_PTS).toBeLessThan(0.5)
  })

  it('asks for a real rotation but never more than the operator normally takes', () => {
    // The 2026-08-11 failure in one assertion: at that bundle's 257-pt
    // recency-weighted sigma the old 0.4 multiple demanded 102.8 pts — 1.01 of
    // the operator's own ~102-pt average rotation, so the engine was rejecting
    // trades of exactly the size they normally trade. 0.3σ asks for ~0.75 of
    // one. It must stay strictly under a full rotation at BOTH sigmas.
    const OPERATOR_ROTATION_PTS = 102
    for (const sigma of [REFERENCE_SESSION_SIGMA_PTS, 257]) {
      const floor = DEFAULT_SIGNIFICANT_MOVE_SIGMA * sigma
      expect(floor / OPERATOR_ROTATION_PTS).toBeLessThan(1)
      expect(floor / OPERATOR_ROTATION_PTS).toBeGreaterThan(0.5)
    }
  })

  it('clears the 87-pt span the 2026-08-11 briefing was exiled from', () => {
    // bundle b6f71b2e: terrain borders 29900 / 29718.75 / 29631.75 / 29450.5,
    // price 29654 inside the 87-pt span. Under 0.4σ the floor resolved to
    // 145.56 and only the outer 181.25-pt pairs qualified, so both objectives
    // anchored 246 pts above and 203 pts below the market. The regression this
    // feature exists to prevent.
    const MEASURED_SIGMA_PTS = 257.45
    const KILL_BOX_SPAN_PTS = 87
    const floor = resolveScaledGate(
      DEFAULT_SIGNIFICANT_MOVE_SIGMA,
      SIGNIFICANT_MOVE_FALLBACK_PTS,
      { sessionSigmaPts: MEASURED_SIGMA_PTS },
    ).pts
    expect(floor).toBeLessThan(KILL_BOX_SPAN_PTS)
    expect(0.4 * MEASURED_SIGMA_PTS).toBeGreaterThan(KILL_BOX_SPAN_PTS)
  })

  it('sits above feat-095 noise band — the band the retired 50-pt floor sat inside', () => {
    // The whole D3 finding in one assertion: 50 pts is 0.18σ, below the 0.25σ
    // the engine already calls "not a meaningful gap", so it could not filter.
    expect(SIGNIFICANT_MOVE_FALLBACK_PTS / REFERENCE_SESSION_SIGMA_PTS).toBeLessThan(
      SIGMA_NOISE_MAX,
    )
    expect(DEFAULT_SIGNIFICANT_MOVE_SIGMA).toBeGreaterThan(SIGMA_NOISE_MAX)
  })

  it('still leaves room for more than one qualifying rotation in a median day', () => {
    const floor = DEFAULT_SIGNIFICANT_MOVE_SIGMA * REFERENCE_SESSION_SIGMA_PTS
    expect(MEDIAN_DAY_RANGE_PTS / floor).toBeGreaterThan(3)
  })

  it('the standoff and chase gates reproduce their legacy points at the reference sigma', () => {
    // Both are unit changes, not re-tunes: at the sigma the fixed values were
    // set under, they resolve back to (just over) those same points.
    const standoff = MIN_ENTRY_STANDOFF_SIGMA * REFERENCE_SESSION_SIGMA_PTS
    const chase = MAX_ENTRY_CHASE_SIGMA * REFERENCE_SESSION_SIGMA_PTS
    expect(standoff).toBeCloseTo(1.42, 2)
    expect(chase).toBeCloseTo(5.66, 2)
    expect(standoff).toBeGreaterThanOrEqual(MIN_ENTRY_STANDOFF_FALLBACK_PTS)
    expect(chase).toBeGreaterThanOrEqual(MAX_ENTRY_CHASE_FALLBACK_PTS)
  })
})

describe('resolveScaledGate', () => {
  it('resolves a multiple against the live scale', () => {
    expect(resolveScaledGate(0.5, 50, { sessionSigmaPts: 600 })).toEqual({
      sigmaMultiple: 0.5,
      pts: 300,
      sessionSigmaPts: 600,
      measured: true,
      fallbackPts: 50,
    })
  })

  it('falls back to the fixed points on a null scale — never a zero-width gate', () => {
    const gate = resolveScaledGate(0.4, 50, null)
    expect(gate.pts).toBe(50)
    expect(gate.measured).toBe(false)
    expect(gate.sessionSigmaPts).toBeNull()
  })

  it('falls back rather than dividing by a zero or negative sigma', () => {
    expect(resolveScaledGate(0.4, 50, { sessionSigmaPts: 0 }).pts).toBe(50)
    expect(resolveScaledGate(0.4, 50, { sessionSigmaPts: -1 }).pts).toBe(50)
    expect(resolveScaledGate(0.4, 50, { sessionSigmaPts: Number.NaN }).pts).toBe(50)
  })

  it('falls back on a non-finite multiple', () => {
    expect(resolveScaledGate(Number.NaN, 50, MEASURED).measured).toBe(false)
    expect(resolveScaledGate(Number.POSITIVE_INFINITY, 50, MEASURED).pts).toBe(50)
  })

  it('never resolves to a non-positive gate', () => {
    // A 0-multiple would silently drop the gate; the fallback holds the line.
    expect(resolveScaledGate(0, 50, MEASURED).pts).toBe(50)
    expect(resolveScaledGate(0, 50, MEASURED).measured).toBe(false)
  })
})

describe('resolveGates', () => {
  it('resolves all three gates against one scale', () => {
    const gates = resolveGates(MEASURED, 0.4)
    expect(gates.significantMove.pts).toBe(113.2)
    expect(gates.entryStandoff.pts).toBe(1.42)
    expect(gates.entryChase.pts).toBe(5.66)
  })

  it('defaults the configured multiple when config is unseeded', () => {
    expect(resolveGates(MEASURED).significantMove.sigmaMultiple).toBe(
      DEFAULT_SIGNIFICANT_MOVE_SIGMA,
    )
  })

  it('degrades every gate together when the scale is unmeasured', () => {
    const gates = resolveGates(null, 0.4)
    expect(gates.significantMove.pts).toBe(SIGNIFICANT_MOVE_FALLBACK_PTS)
    expect(gates.entryStandoff.pts).toBe(MIN_ENTRY_STANDOFF_FALLBACK_PTS)
    expect(gates.entryChase.pts).toBe(MAX_ENTRY_CHASE_FALLBACK_PTS)
    expect(gates.significantMove.measured).toBe(false)
  })
})

describe('describeGate', () => {
  it('leads with the resolved points and qualifies with the multiple', () => {
    expect(describeGate(resolveScaledGate(0.4, 50, MEASURED))).toBe(
      '113.2 pts (0.4σ of the measured 283-pt session sigma)',
    )
  })

  it('names the fallback explicitly when the sigma is unmeasured', () => {
    const text = describeGate(resolveScaledGate(0.4, 50, null))
    expect(text).toContain('50 pts')
    expect(text).toContain('unmeasured')
    expect(text).toContain('fixed fallback')
  })
})
