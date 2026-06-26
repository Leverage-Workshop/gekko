import { describe, it, expect } from 'vitest'
import {
  evaluateRiskReward,
  objectiveRiskReward,
  DEFAULT_RR_MIN,
  type RiskReward,
} from './riskReward'
import type { Objective } from '@/knowledge/schema/briefing.schema'

// A realistic NQ long: enter at a border, hard stop a tick-bundle below, targets above.
// risk = 30400 - 30380 = 20; T1 reward = 30460 - 30400 = 60 → 3.0 R/R exactly.
const LONG = {
  direction: 'long' as const,
  entry: 30400,
  stop: 30380,
  targets: [30460, 30520, 30580],
}

describe('evaluateRiskReward — long geometry', () => {
  it('computes direction-aware risk and per-target reward/rr (T1 headline)', () => {
    const r = evaluateRiskReward(LONG)
    expect(r.risk).toBe(20)
    expect(r.targets[0]).toMatchObject({ price: 30460, reward: 60, rr: 3, meetsGate: true })
    expect(r.targets[1].rr).toBe(6) // 120 / 20
    expect(r.targets[2].rr).toBe(9) // 180 / 20
    expect(r.rr).toBe(3) // headline = nearest target
    expect(r.meetsGate).toBe(true)
    expect(r.valid).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('defaults rrMin to the doctrine 3.0', () => {
    expect(DEFAULT_RR_MIN).toBe(3.0)
    expect(evaluateRiskReward(LONG).rrMin).toBe(3.0)
  })

  it('gates: R/R below the minimum is invalid with a reason', () => {
    // tighten T1 to 30450 → reward 50 / risk 20 = 2.5 < 3
    const r = evaluateRiskReward({ ...LONG, targets: [30450, 30520] })
    expect(r.rr).toBe(2.5)
    expect(r.meetsGate).toBe(false)
    expect(r.valid).toBe(false)
    expect(r.reasons.some((m) => m.includes('below the 3.00 minimum'))).toBe(true)
  })

  it('honours a custom rrMin', () => {
    const r = evaluateRiskReward({ ...LONG, rrMin: 4 })
    expect(r.rrMin).toBe(4)
    expect(r.meetsGate).toBe(false) // 3.0 < 4
    expect(r.valid).toBe(false)
  })

  it('flags a stop on the wrong side of entry (risk 0, invalid)', () => {
    const r = evaluateRiskReward({ ...LONG, stop: 30420 }) // above entry for a long
    expect(r.risk).toBe(0)
    expect(r.rr).toBe(0)
    expect(r.valid).toBe(false)
    expect(r.reasons.some((m) => m.includes('wrong side of entry'))).toBe(true)
  })

  it('flags a nearest target on the wrong side of entry', () => {
    const r = evaluateRiskReward({ ...LONG, targets: [30390] }) // below entry for a long
    expect(r.targets[0].reward).toBe(-10)
    expect(r.rr).toBe(0)
    expect(r.valid).toBe(false)
    expect(r.reasons.some((m) => m.includes('wrong side of entry'))).toBe(true)
  })

  it('flags missing targets', () => {
    const r = evaluateRiskReward({ ...LONG, targets: [] })
    expect(r.rr).toBe(0)
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('no targets supplied')
  })
})

describe('evaluateRiskReward — short geometry (mirror)', () => {
  const SHORT = {
    direction: 'short' as const,
    entry: 30400,
    stop: 30420, // protective side is above for a short
    targets: [30340, 30280], // profit below
  }

  it('inverts risk/reward correctly', () => {
    const r = evaluateRiskReward(SHORT)
    expect(r.risk).toBe(20) // 30420 - 30400
    expect(r.targets[0]).toMatchObject({ price: 30340, reward: 60, rr: 3 })
    expect(r.rr).toBe(3)
    expect(r.valid).toBe(true)
  })

  it('a stop below entry is the wrong side for a short', () => {
    const r = evaluateRiskReward({ ...SHORT, stop: 30380 })
    expect(r.risk).toBe(0)
    expect(r.valid).toBe(false)
  })
})

describe('evaluateRiskReward — stops never widen', () => {
  it('long: a lower (farther) stop than the prior briefing widens → invalid', () => {
    const r = evaluateRiskReward({ ...LONG, stop: 30370, priorStop: 30380 })
    expect(r.stopWidened).toBe(true)
    expect(r.valid).toBe(false)
    expect(r.reasons.some((m) => m.includes('widens vs the prior briefing stop'))).toBe(true)
  })

  it('long: a higher (tighter) stop than prior is allowed', () => {
    const r = evaluateRiskReward({ ...LONG, stop: 30390, priorStop: 30380 })
    expect(r.stopWidened).toBe(false)
    expect(r.valid).toBe(true)
  })

  it('short: a higher (farther) stop than prior widens', () => {
    const r = evaluateRiskReward({
      direction: 'short',
      entry: 30400,
      stop: 30430,
      targets: [30330],
      priorStop: 30420,
    })
    expect(r.stopWidened).toBe(true)
    expect(r.valid).toBe(false)
  })

  it('tolerates sub-tick movement (within 0.25) as not widening', () => {
    const r = evaluateRiskReward({ ...LONG, stop: 30379.8, priorStop: 30380 })
    expect(r.stopWidened).toBe(false)
  })

  it('priorStop null/omitted skips the check', () => {
    const r = evaluateRiskReward({ ...LONG, stop: 30370 })
    expect(r.priorStop).toBeNull()
    expect(r.stopWidened).toBe(false)
  })
})

describe('evaluateRiskReward — input validation', () => {
  it('throws on invalid direction', () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => evaluateRiskReward({ ...LONG, direction: 'up' })).toThrow(/invalid direction/)
  })
  it('throws on non-finite entry', () => {
    expect(() => evaluateRiskReward({ ...LONG, entry: NaN })).toThrow(/no finite entry/)
  })
  it('throws on non-finite stop', () => {
    expect(() => evaluateRiskReward({ ...LONG, stop: Infinity })).toThrow(/no finite stop/)
  })
  it('throws on a non-finite target', () => {
    expect(() => evaluateRiskReward({ ...LONG, targets: [30460, NaN] })).toThrow(/non-finite target/)
  })
  it('throws on a non-finite priorStop', () => {
    expect(() => evaluateRiskReward({ ...LONG, priorStop: NaN })).toThrow(/priorStop must be/)
  })
})

describe('objectiveRiskReward — schema adapter', () => {
  function makeObjective(over: Partial<Objective> = {}): Objective {
    return {
      macroGoal: 'Reclaim value',
      rationale: '3:1 R/R off LVN support with confirmed blue initiative.',
      direction: 'long',
      entries: [
        { label: 'Entry A', price: 30400, trigger: 'blue absorption at border' },
        { label: 'Entry B', price: 30390, trigger: 'deeper tester' },
      ],
      stops: [
        { label: 'Stop A', price: 30385, invalidation: 'soft' },
        { label: 'Stop B', price: 30380, invalidation: 'hard structural' },
      ],
      targets: [
        { label: 'T1', price: 30460, description: 'first shelf' },
        { label: 'T2', price: 30520, description: 'POC' },
        { label: 'T3', price: 30580, description: 'campaign border' },
      ],
      rr: 0,
      ...over,
    }
  }

  it('uses Entry A and the farthest protective stop (most conservative R/R)', () => {
    const r: RiskReward = objectiveRiskReward(makeObjective())
    expect(r.entry).toBe(30400)
    expect(r.stop).toBe(30380) // farthest of the two stops → largest risk
    expect(r.risk).toBe(20)
    expect(r.rr).toBe(3)
    expect(r.valid).toBe(true)
  })

  it('threads priorStop and rrMin through to the no-widen / gate checks', () => {
    const r = objectiveRiskReward(makeObjective(), { priorStop: 30385, rrMin: 4 })
    // worst stop 30380 is below the prior 30385 → widened
    expect(r.stopWidened).toBe(true)
    expect(r.rrMin).toBe(4)
    expect(r.valid).toBe(false)
  })

  it('throws when no entry price is present', () => {
    expect(() => objectiveRiskReward(makeObjective({ entries: [] }))).toThrow(/no entry price/)
  })

  it('throws when no stop sits on the protective side of entry', () => {
    const o = makeObjective({
      stops: [{ label: 'Stop A', price: 30450, invalidation: 'above entry' }],
    })
    expect(() => objectiveRiskReward(o)).toThrow(/protective side/)
  })
})
