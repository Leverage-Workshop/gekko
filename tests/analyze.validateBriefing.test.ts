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

  it('stays silent on a single-entry objective (single-entry doctrine)', () => {
    const result = enforceCodeOwnedFacts(briefing(), { rrMin: 3 })
    expect(result.warnings.some((w) => w.includes('single-entry doctrine'))).toBe(false)
  })

  it('trims Entry B rungs to the Entry A entry with a warning', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          entries: [
            { label: 'Entry B (Add-on)', price: 30260, trigger: 'reclaim' },
            { label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' },
          ],
        }),
      }),
      { rrMin: 3 },
    )
    expect(result.briefing.primary.entries).toEqual([
      { label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' },
    ])
    expect(
      result.warnings.some(
        (w) => w.includes('primary objective emitted 2 entries') && w.includes('Entry A (Ideal)'),
      ),
    ).toBe(true)
  })

  it('keeps the first entry when no rung is labeled Entry A', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          entries: [
            { label: 'Ideal', price: 30250, trigger: 'absorption' },
            { label: 'Add-on', price: 30260, trigger: 'reclaim' },
          ],
        }),
      }),
      { rrMin: 3 },
    )
    expect(result.briefing.primary.entries).toEqual([
      { label: 'Ideal', price: 30250, trigger: 'absorption' },
    ])
  })

  it('trims extra stops to the worst-case protective stop with a warning', () => {
    const result = enforceCodeOwnedFacts(
      briefing({
        primary: longObjective({
          stops: [
            { label: 'Stop (Entry B)', price: 30244, invalidation: 'lost the reclaim' },
            { label: 'Stop (Entry A)', price: 30240, invalidation: 'lost the shelf' },
          ],
        }),
      }),
      { rrMin: 3 },
    )
    // The long protects below entry 30250: 30240 is the worst-case (farthest) stop.
    expect(result.briefing.primary.stops).toEqual([
      { label: 'Stop (Entry A)', price: 30240, invalidation: 'lost the shelf' },
    ])
    expect(
      result.warnings.some(
        (w) => w.includes('primary objective emitted 2 stops') && w.includes('30240'),
      ),
    ).toBe(true)
    // R/R still computes from the kept stop: risk 10, T1 reward 30 → rr 3.
    expect(result.riskReward.primary.stop).toBe(30240)
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

describe('distinct objective anchors', () => {
  /** A short counter-scenario re-anchored onto the given entry price. */
  function shortAt(entry: number): Objective {
    return longObjective({
      direction: 'short',
      entries: [{ label: 'Entry A (Fade)', price: entry, trigger: 'failed hold' }],
      stops: [{ label: 'Stop', price: entry + 10, invalidation: 'reclaimed' }],
      targets: [{ label: 'T1', price: entry - 30, description: 'next trench' }],
    })
  }

  it('throws when both objectives straddle the same level (opposite directions)', () => {
    const input = briefing({ secondary: shortAt(30250) }) // primary long is also @ 30250
    expect(() => enforceCodeOwnedFacts(input, { rrMin: 3 })).toThrow(BriefingValidationError)
    expect(() => enforceCodeOwnedFacts(input, { rrMin: 3 })).toThrow(/distinct structural borders/)
  })

  it('throws when the entries sit inside the separation band', () => {
    const input = briefing({ secondary: shortAt(30253) }) // 3 pts from the primary entry
    expect(() => enforceCodeOwnedFacts(input, { rrMin: 3 })).toThrow(/3 pts apart/)
  })

  it('accepts objectives anchored at distinct borders', () => {
    // Default fixture: primary @ 30250, secondary @ 30290 — 40 pts apart.
    expect(() => enforceCodeOwnedFacts(briefing(), { rrMin: 3 })).not.toThrow()
  })

  it('compares the surviving Entry A rungs after single-entry trimming', () => {
    // Primary's Entry A collides with the secondary only via its Entry B rung —
    // trimming keeps Entry A @ 30250, so no collision with the secondary @ 30290.
    const primary = longObjective({
      entries: [
        { label: 'Entry A', price: 30250, trigger: 'absorption' },
        { label: 'Entry B', price: 30290, trigger: 'breakout' },
      ],
    })
    expect(() => enforceCodeOwnedFacts(briefing({ primary }), { rrMin: 3 })).not.toThrow()
  })
})

describe('entry standoff (enforceEntryStandoff)', () => {
  const meta = {
    createdAt: '2026-07-06T12:00:00Z',
    triggerReason: 'manual',
    ripStatus: 'green',
  }

  it('throws when an entry is pinned at current price', () => {
    // Primary entry 30250 vs current price 30252 — the 2026-07-20 at-price defect.
    expect(() =>
      enforceCodeOwnedFacts(briefing(), {
        rrMin: 3,
        enforceEntryStandoff: true,
        meta: { ...meta, currentPrice: 30252 },
      }),
    ).toThrow(/stand off at least 15 pts/)
  })

  it('passes when every entry clears the standoff', () => {
    // 30220: primary 30 pts away, secondary 70 pts away.
    expect(() =>
      enforceCodeOwnedFacts(briefing(), {
        rrMin: 3,
        enforceEntryStandoff: true,
        meta: { ...meta, currentPrice: 30220 },
      }),
    ).not.toThrow()
  })

  it('is skipped without the flag (update path: price approaching the plan is success)', () => {
    expect(() =>
      enforceCodeOwnedFacts(briefing(), {
        rrMin: 3,
        meta: { ...meta, currentPrice: 30252 },
      }),
    ).not.toThrow()
  })
})

describe('entry anchor advisory', () => {
  it('warns when an entry price matches no engine anchor', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      anchorPrices: [30300, 30250, 30200], // secondary @ 30290 is off-anchor
    })
    const anchorWarnings = result.warnings.filter((w) => w.includes('engine anchor'))
    expect(anchorWarnings).toHaveLength(1)
    expect(anchorWarnings[0]).toContain('secondary')
    expect(anchorWarnings[0]).toContain('30290')
  })

  it('stays silent when every entry sits on an anchor', () => {
    const result = enforceCodeOwnedFacts(briefing(), {
      rrMin: 3,
      anchorPrices: [30300, 30290, 30250, 30200],
    })
    expect(result.warnings.filter((w) => w.includes('engine anchor'))).toEqual([])
  })
})
