import { describe, expect, it } from 'vitest'
import type { Briefing, Objective } from '@/knowledge/schema/briefing.schema'
import {
  BriefingValidationError,
  assertZoneContiguity,
  enforceCodeOwnedFacts,
} from '@/lib/analyze'

/** A geometrically-sound long: risk 10, T1 reward 30 → rr 3. */
function longObjective(overrides: Partial<Objective> = {}): Objective {
  return {
    macroGoal: 'Take the wall',
    rationale: 'Acceptance above',
    direction: 'long',
    entries: [{ label: 'Entry A', price: 30250, trigger: 'absorption' }],
    stops: [{ label: 'Stop', price: 30240, invalidation: 'lost the shelf' }],
    targets: [{ label: 'T1', price: 30280, description: 'next trench' }],
    rr: 99, // deliberately wrong — the engine must overwrite it
    ...overrides,
  }
}

function briefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    meta: {
      createdAt: '2026-07-06T12:00:00Z',
      triggerReason: 'manual',
      currentPrice: 30255,
      htfTrend: 'up',
      ripStatus: 'green',
    },
    overview: {
      currentPosition: ['inside value'],
      structuralArchitecture: ['balanced'],
      orderFlowContext: ['blue initiative'],
      keyInflections: [],
    },
    terrain: {
      zones: [
        { color: 'red', top: 30300, bottom: 30250, label: 'Attic' },
        { color: 'green', top: 30250, bottom: 30200, label: 'Killbox' },
      ],
      levels: [{ price: 30250, label: 'POC shelf', kind: 'wall' }],
    },
    primary: longObjective(),
    secondary: longObjective({
      direction: 'short',
      entries: [{ label: 'Entry A', price: 30290, trigger: 'exhaustion' }],
      stops: [{ label: 'Stop', price: 30300, invalidation: 'acceptance above' }],
      targets: [{ label: 'T1', price: 30255, description: 'value mid' }],
    }),
    dangerZones: [],
    ...overrides,
  }
}

describe('assertZoneContiguity', () => {
  it('accepts a contiguous descending zone stack', () => {
    expect(() => assertZoneContiguity(briefing())).not.toThrow()
  })

  it('rejects an empty zone stack', () => {
    expect(() =>
      assertZoneContiguity(briefing({ terrain: { zones: [], levels: [] } })),
    ).toThrow(BriefingValidationError)
  })

  it('rejects a gap between zones (No-Gap invariant)', () => {
    const gapped = briefing({
      terrain: {
        zones: [
          { color: 'red', top: 30300, bottom: 30260, label: 'A' },
          { color: 'green', top: 30250, bottom: 30200, label: 'B' },
        ],
        levels: [],
      },
    })
    expect(() => assertZoneContiguity(gapped)).toThrow(/No-Gap/)
  })

  it('rejects an inverted zone', () => {
    const inverted = briefing({
      terrain: {
        zones: [{ color: 'red', top: 30200, bottom: 30300, label: 'A' }],
        levels: [],
      },
    })
    expect(() => assertZoneContiguity(inverted)).toThrow(/inverted/)
  })
})

describe('enforceCodeOwnedFacts', () => {
  it('overwrites the model rr with the engine-computed ratio', () => {
    const result = enforceCodeOwnedFacts(briefing(), { rrMin: 3 })

    expect(result.briefing.primary.rr).toBe(3)
    expect(result.briefing.primary.rr).not.toBe(99)
    expect(result.riskReward.primary.stop).toBe(30240)
    expect(result.riskReward.primary.meetsGate).toBe(true)
  })

  it('warns (not throws) when an objective misses the R/R gate', () => {
    const weak = briefing({
      primary: longObjective({
        targets: [{ label: 'T1', price: 30265, description: 'too close' }],
      }),
    })
    const result = enforceCodeOwnedFacts(weak, { rrMin: 3 })

    expect(result.briefing.primary.rr).toBeLessThan(3)
    expect(result.warnings.some((w) => w.includes('primary'))).toBe(true)
  })

  it('throws on invalid R/R geometry (no protective stop)', () => {
    const broken = briefing({
      primary: longObjective({
        stops: [{ label: 'Stop', price: 30260, invalidation: 'wrong side' }],
      }),
    })
    expect(() => enforceCodeOwnedFacts(broken, { rrMin: 3 })).toThrow(
      BriefingValidationError,
    )
  })

  it('warns when a zone border is not in the engine border set', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      engineBorders: [30300, 30250, 30190],
    })
    expect(result.warnings.some((w) => w.includes('30200'))).toBe(true)
  })

  it('stays silent when all borders are engine borders', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      engineBorders: [30300, 30250, 30200],
    })
    expect(result.warnings.filter((w) => w.includes('border'))).toEqual([])
  })

  it('does not mutate the input briefing', () => {
    const input = briefing()
    enforceCodeOwnedFacts(input, { rrMin: 3 })
    expect(input.primary.rr).toBe(99)
  })
})
