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

  it('warns when the protective stop sits inside the entry border band (degenerate risk)', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          stops: [{ label: 'Stop', price: 30247.75, invalidation: 'other band member' }],
        }),
      }),
      { rrMin: 3 },
    )
    expect(
      result.warnings.some((w) => w.includes('primary') && w.includes('inside the entry\'s own border band')),
    ).toBe(true)
  })

  it('does not warn on a structurally-distanced stop', () => {
    const result = enforceCodeOwnedFacts(briefing(), { rrMin: 3 }) // 10-pt stop
    expect(
      result.warnings.some((w) => w.includes('inside the entry\'s own border band')),
    ).toBe(false)
  })

  it('warns when an objective has a single entry (Gem template: Entry A + Entry B)', () => {
    const result = enforceCodeOwnedFacts(briefing(), { rrMin: 3 })
    expect(result.warnings.some((w) => w.includes('primary objective has a single entry'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('secondary objective has a single entry'))).toBe(true)
  })

  it('stays silent on entries when both Entry A and Entry B are present', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          entries: [
            { label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' },
            { label: 'Entry B (Add-on)', price: 30260, trigger: 'reclaim' },
          ],
        }),
      }),
      { rrMin: 3 },
    )
    expect(result.warnings.some((w) => w.includes('primary objective has a single entry'))).toBe(false)
  })

  it('warns when a single-target objective ignores available ladder rungs', () => {
    // Long from 30250 with engine borders at 30280/30320/30360 and extreme 30400:
    // two-plus rungs available, one target shipped.
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      engineBorders: [30400, 30360, 30320, 30280, 30250, 30200],
    })
    expect(
      result.warnings.some((w) => w.includes('primary') && w.includes('T1→T2→T3 ladder is expected')),
    ).toBe(true)
  })

  it('does not demand a ladder when no rungs exist before the campaign extreme', () => {
    // Only the entry border and the extreme in the trade direction: nothing to ladder onto.
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      engineBorders: [30280, 30250, 30200],
    })
    expect(
      result.warnings.some((w) => w.includes('primary') && w.includes('ladder is expected')),
    ).toBe(false)
  })

  it('does not warn on targets when the ladder is present', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          targets: [
            { label: 'T1', price: 30280, description: 'first obstacle' },
            { label: 'T2', price: 30320, description: 'next border' },
            { label: 'T3', price: 30360, description: 'campaign max' },
          ],
        }),
      }),
      { rrMin: 3, engineBorders: [30400, 30360, 30320, 30280, 30250, 30200] },
    )
    expect(
      result.warnings.some((w) => w.includes('primary') && w.includes('ladder is expected')),
    ).toBe(false)
  })

  it('does not mutate the input briefing', () => {
    const input = briefing()
    enforceCodeOwnedFacts(input, { rrMin: 3 })
    expect(input.primary.rr).toBe(99)
  })

  it('overwrites drifted code-owned meta fields, warning per field', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      meta: {
        createdAt: '2026-07-06T13:00:00Z',
        currentPrice: 30260,
        triggerReason: 'scheduled',
        ripStatus: 'yellow',
      },
    })

    expect(result.briefing.meta.createdAt).toBe('2026-07-06T13:00:00Z')
    expect(result.briefing.meta.currentPrice).toBe(30260)
    expect(result.briefing.meta.triggerReason).toBe('scheduled')
    expect(result.briefing.meta.ripStatus).toBe('yellow')
    // htfTrend stays model-owned.
    expect(result.briefing.meta.htfTrend).toBe('up')
    expect(result.warnings.some((w) => w.includes('meta.createdAt'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.currentPrice'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.triggerReason'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.ripStatus'))).toBe(true)
  })

  it('keeps the model ripStatus when the engine computed none (rip absent)', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      meta: {
        createdAt: '2026-07-06T12:00:00Z',
        currentPrice: 30255,
        triggerReason: 'manual',
        ripStatus: null,
      },
    })

    expect(result.briefing.meta.ripStatus).toBe('green')
    expect(result.warnings.filter((w) => w.includes('meta.'))).toEqual([])
  })

  it('stays silent when the model meta matches the code-owned values', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      meta: {
        createdAt: '2026-07-06T12:00:00Z',
        currentPrice: 30255,
        triggerReason: 'manual',
        ripStatus: 'green',
      },
    })

    expect(result.warnings.filter((w) => w.includes('meta.'))).toEqual([])
  })
})
