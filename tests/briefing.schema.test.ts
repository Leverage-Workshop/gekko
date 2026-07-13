import { describe, it, expect } from 'vitest'
import {
  Briefing,
  BriefingUpdate,
  EvalResult,
  Objective,
  Direction,
  LevelKind,
  TargetLabel,
  EvalStatus,
} from '@/knowledge/schema/briefing.schema'

// A minimal-but-complete Objective used across Briefing fixtures.
const validObjective = {
  macroGoal: 'Long the reclaim of the value-area low',
  rationale: 'HTF uptrend; absorption at the LVN border',
  direction: 'long' as const,
  entries: [{ label: 'E1', price: 24000, trigger: 'Blue initiative reclaims VAL' }],
  stops: [{ label: 'S1', price: 23950, invalidation: 'Acceptance below the trench' }],
  targets: [
    { label: 'T1' as const, price: 24100, description: 'First magnet' },
    { label: 'T2' as const, price: 24200, description: 'POC' },
    { label: 'T3' as const, price: 24350, description: 'Campaign max' },
  ],
  rr: 3.2,
}

const validBriefing = {
  meta: {
    createdAt: '2026-06-20T16:00:00.000Z',
    triggerReason: 'manual',
    currentPrice: 24010,
    htfTrend: 'bullish',
    ripStatus: 'Green',
  },
  overview: {
    currentPosition: ['Holding above VAL'],
    structuralArchitecture: ['Balanced HTF distribution'],
    orderFlowContext: ['Blue initiative building'],
    keyInflections: [{ level: 24000, why: 'Value-area low' }],
  },
  terrain: {
    zones: [
      { color: 'blue', top: 24400, bottom: 24200, label: 'Stratosphere' },
      { color: 'red', top: 24200, bottom: 24000, label: 'Attic' },
      { color: 'purple', top: 24000, bottom: 23800, label: 'Abyss' },
    ],
    levels: [
      { price: 24200, label: 'POC', kind: 'magnet' as const },
      { price: 24000, label: 'VAL', kind: 'trench' as const },
    ],
  },
  primary: validObjective,
  secondary: { ...validObjective, direction: 'short' as const, rr: 3.0 },
  dangerZones: [{ area: 'Mid-range chop', why: 'No edge between magnets' }],
}

const validEvalResult = {
  meta: { createdAt: '2026-06-20T16:05:00.000Z', currentPrice: 24005, nearEntry: true, zone: 'Attic' },
  status: 'ENTER' as const,
  evaluatedLevel: { label: 'E1', price: 24000, direction: 'long' as const },
  direction: 'long' as const,
  trigger: 'Blue initiative reclaims VAL',
  stop: 23950,
  targets: [24100, 24200, 24350],
  reason: 'Absorption confirmed at the border with blue continuation',
}

describe('enums', () => {
  it('Direction accepts long/short and rejects others', () => {
    expect(Direction.parse('long')).toBe('long')
    expect(Direction.parse('short')).toBe('short')
    expect(Direction.safeParse('sideways').success).toBe(false)
  })

  it('LevelKind matches the contract', () => {
    expect(LevelKind.options).toEqual(['trench', 'wall', 'magnet', 'mgi'])
    expect(LevelKind.safeParse('hvn').success).toBe(false)
  })

  it('TargetLabel is T1/T2/T3 only', () => {
    expect(TargetLabel.options).toEqual(['T1', 'T2', 'T3'])
    expect(TargetLabel.safeParse('T4').success).toBe(false)
  })

  it('EvalStatus matches the contract', () => {
    expect(EvalStatus.options).toEqual(['ENTER', 'WAIT', 'NOT_VALID', 'NO_ENTRY_NEAR'])
    expect(EvalStatus.safeParse('SKIP').success).toBe(false)
  })
})

describe('Briefing', () => {
  it('accepts a complete, valid briefing', () => {
    const parsed = Briefing.parse(validBriefing)
    expect(parsed.primary.direction).toBe('long')
    expect(parsed.secondary.direction).toBe('short')
    expect(parsed.terrain.zones).toHaveLength(3)
    expect(parsed.terrain.levels[0].kind).toBe('magnet')
  })

  it('rejects a missing required section', () => {
    const { terrain: _terrain, ...noTerrain } = validBriefing
    expect(Briefing.safeParse(noTerrain).success).toBe(false)
  })

  it('rejects an invalid level kind', () => {
    const bad = {
      ...validBriefing,
      terrain: {
        ...validBriefing.terrain,
        levels: [{ price: 24000, label: 'VAL', kind: 'lvn' }],
      },
    }
    expect(Briefing.safeParse(bad).success).toBe(false)
  })

  it('rejects a non-numeric currentPrice', () => {
    const bad = { ...validBriefing, meta: { ...validBriefing.meta, currentPrice: '24010' } }
    expect(Briefing.safeParse(bad).success).toBe(false)
  })

  it('strips unknown keys by default (non-strict object)', () => {
    const parsed = Briefing.parse({ ...validBriefing, extra: 'ignored' })
    expect('extra' in parsed).toBe(false)
  })

  it('bounds keyInflections to 1–2 entries (ADHD max-2 doctrine)', () => {
    const inflection = { level: 24000, why: 'Value-area low' }
    const withCount = (n: number) => ({
      ...validBriefing,
      overview: { ...validBriefing.overview, keyInflections: Array(n).fill(inflection) },
    })
    expect(Briefing.safeParse(withCount(0)).success).toBe(false)
    expect(Briefing.safeParse(withCount(1)).success).toBe(true)
    expect(Briefing.safeParse(withCount(2)).success).toBe(true)
    expect(Briefing.safeParse(withCount(3)).success).toBe(false)
  })
})

describe('Objective', () => {
  it('requires an rr number', () => {
    const { rr: _rr, ...noRr } = validObjective
    expect(Objective.safeParse(noRr).success).toBe(false)
  })

  it('rejects a bad target label', () => {
    const bad = {
      ...validObjective,
      targets: [{ label: 'T9', price: 1, description: 'x' }],
    }
    expect(Objective.safeParse(bad).success).toBe(false)
  })
})

describe('BriefingUpdate', () => {
  const validUpdate = {
    meta: validBriefing.meta,
    tacticalRead: {
      location: 'Attic, between VAL 24000 below and POC 24200 above',
      ripStatus: 'Holding as support',
      initiative: 'Blue in control on sustained positive delta',
    },
    primary: validObjective,
    secondary: { ...validObjective, direction: 'short' as const },
    dangerZones: [{ area: 'Mid-range chop', why: 'No edge between magnets' }],
  }

  it('accepts a complete, valid update', () => {
    const parsed = BriefingUpdate.parse(validUpdate)
    expect(parsed.tacticalRead.ripStatus).toBe('Holding as support')
    expect(parsed.primary.direction).toBe('long')
  })

  it('has no overview or terrain — they carry forward from the parent', () => {
    expect('overview' in BriefingUpdate.shape).toBe(false)
    expect('terrain' in BriefingUpdate.shape).toBe(false)
  })

  it('requires all three tactical read lines', () => {
    const { initiative: _i, ...twoLines } = validUpdate.tacticalRead
    const bad = { ...validUpdate, tacticalRead: twoLines }
    expect(BriefingUpdate.safeParse(bad).success).toBe(false)
  })

  it('rejects a missing objective', () => {
    const { secondary: _s, ...noSecondary } = validUpdate
    expect(BriefingUpdate.safeParse(noSecondary).success).toBe(false)
  })
})

describe('EvalResult', () => {
  it('accepts a complete ENTER result', () => {
    const parsed = EvalResult.parse(validEvalResult)
    expect(parsed.status).toBe('ENTER')
    expect(parsed.targets).toEqual([24100, 24200, 24350])
  })

  it('accepts a minimal NO_ENTRY_NEAR result with only required fields', () => {
    const minimal = {
      meta: { createdAt: '2026-06-20T16:05:00.000Z', currentPrice: 24005, nearEntry: false },
      status: 'NO_ENTRY_NEAR' as const,
      reason: 'No active level within range',
    }
    const parsed = EvalResult.parse(minimal)
    expect(parsed.status).toBe('NO_ENTRY_NEAR')
    expect(parsed.evaluatedLevel).toBeUndefined()
    expect(parsed.meta.zone).toBeUndefined()
  })

  it('requires meta.nearEntry to be a boolean', () => {
    const bad = { ...validEvalResult, meta: { ...validEvalResult.meta, nearEntry: 'yes' } }
    expect(EvalResult.safeParse(bad).success).toBe(false)
  })

  it('rejects an invalid status', () => {
    const bad = { ...validEvalResult, status: 'MAYBE' }
    expect(EvalResult.safeParse(bad).success).toBe(false)
  })

  it('requires a reason', () => {
    const { reason: _reason, ...noReason } = validEvalResult
    expect(EvalResult.safeParse(noReason).success).toBe(false)
  })
})
