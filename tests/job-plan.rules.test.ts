import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCEPTANCE_MINUTES,
  APPROACH_RECENCY_MINUTES,
  BAND_WIDTH_CAP_PTS,
  EARLY_SESSION_MINUTES,
  EXPORT_SKEW_MAX_SECONDS,
  FAILED_LOOK_MAX_MINUTES,
  HOLDING_WINDOW_MINUTES,
  IMPLEMENTED_RULES,
  MAX_ARMED_BANDS_PER_SIDE,
  MAX_PLAYS,
  MERGE_TOLERANCE_PTS,
  PLANNER_REVISION,
  REACH_SIGMA,
  RESPONSE_DEADLINE_MINUTES,
  RULE_TABLE,
  SOURCE_SIGNIFICANCE,
  r10MidZone,
  r11ResponseDeadline,
  r12SkipBand,
  r12WithinPlayCap,
  r13ExportSkewExceeded,
  r13TradingDayMatches,
  r1SameBand,
  r1WithinCap,
  r2DestinationOnly,
  r2Significance,
  r3AtBand,
  r4WithinReach,
  r5FailedLook,
  r5Grade,
  r6Accepted,
  r7ApproachFailure,
  r8HoldingSide,
  r9TriggerStatus,
  resolveBandTolerance,
} from '@/lib/job-plan/rules'

const PLAN = readFileSync(join(process.cwd(), 'docs/job-planning-task-plan.md'), 'utf8')
const RULES_SOURCE = readFileSync(join(process.cwd(), 'lib/job-plan/rules.ts'), 'utf8')

/** Every `| Rn |` row id in the plan's "Ratified rules" table. */
function planRuleIds(): string[] {
  const section = PLAN.slice(PLAN.indexOf('## Ratified rules'))
  const table = section.slice(0, section.indexOf('## Claude / Codex review notes'))
  return [...table.matchAll(/^\| (R\d+b?)\b[^|]*\|/gm)].map((m) => m[1])
}

describe('rules.ts: the decision log by rule ID', () => {
  it('exports a single non-empty PLANNER_REVISION', () => {
    expect(typeof PLANNER_REVISION).toBe('string')
    expect(PLANNER_REVISION.length).toBeGreaterThan(0)
    expect(RULES_SOURCE.match(/export const PLANNER_REVISION/g)).toHaveLength(1)
  })

  it('declares every R-id in the plan table exactly once', () => {
    const fromPlan = planRuleIds()
    expect(fromPlan).toEqual(['R1', 'R1b', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15'])
    const declared = RULE_TABLE.map((r) => r.id)
    expect([...declared].sort()).toEqual([...fromPlan].sort())
    expect(new Set(declared).size).toBe(declared.length)
    for (const id of fromPlan) {
      expect(RULES_SOURCE.match(new RegExp(`id: '${id}'`, 'g')), id).toHaveLength(1)
    }
  })

  it('implements exactly the planner rows here (feat-126 R1–R10/R13, feat-127 R11/R12); R14 → feat-128, R15 → bench', () => {
    const planner = RULE_TABLE.filter((r) => r.owner === 'feat-126' || r.owner === 'feat-127').map((r) => r.id)
    expect([...planner].sort()).toEqual([...Object.keys(IMPLEMENTED_RULES)].sort())
    expect(RULE_TABLE.filter((r) => r.owner === 'feat-126').map((r) => r.id)).toEqual(['R1', 'R1b', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R13'])
    expect(RULE_TABLE.filter((r) => r.owner === 'feat-127').map((r) => r.id)).toEqual(['R11', 'R12'])
    for (const entry of RULE_TABLE) {
      const implemented = entry.owner === 'feat-126' || entry.owner === 'feat-127'
      expect(entry.predicate !== null, entry.id).toBe(implemented)
      const fns = IMPLEMENTED_RULES[entry.id as keyof typeof IMPLEMENTED_RULES] ?? []
      expect(fns.length > 0, entry.id).toBe(implemented)
      for (const fn of fns) expect(typeof fn).toBe('function')
    }
    expect(RULE_TABLE.find((r) => r.id === 'R14')?.owner).toBe('feat-128')
    expect(RULE_TABLE.find((r) => r.id === 'R15')).toMatchObject({ owner: 'feat-124', ratified: false })
  })

  it('carries the ratified defaults as named constants', () => {
    expect(MERGE_TOLERANCE_PTS).toEqual({ NQ: 20, ES: 5 })
    expect(BAND_WIDTH_CAP_PTS).toEqual({ NQ: 40, ES: 10 })
    expect(REACH_SIGMA).toBe(1)
    expect(FAILED_LOOK_MAX_MINUTES).toBe(30)
    expect(EARLY_SESSION_MINUTES).toBe(90)
    expect(ACCEPTANCE_MINUTES).toBe(20)
    expect(APPROACH_RECENCY_MINUTES).toBe(60)
    expect(HOLDING_WINDOW_MINUTES).toBe(20)
    expect(EXPORT_SKEW_MAX_SECONDS).toBe(300)
    expect(RESPONSE_DEADLINE_MINUTES).toBe(30)
    expect(MAX_ARMED_BANDS_PER_SIDE).toBe(2)
    expect(MAX_PLAYS).toBe(4)
  })
})

describe('R1 / R1b — confluence tolerance', () => {
  it.each([
    ['positive: 20 pts apart chain (NQ)', 29300, 29320, 20, true],
    ['boundary: exactly the tolerance is the same band', 29300, 29320, 20, true],
    ['negative: a tick beyond does not', 29300, 29320.25, 20, false],
    ['ES: 5 pts', 6500, 6505, 5, true],
    ['ES: 5.25 pts', 6500, 6505.25, 5, false],
  ])('%s', (_, a, b, merge, expected) => {
    expect(r1SameBand(a, b, merge)).toBe(expected)
  })

  it('caps the band width inclusively', () => {
    expect(r1WithinCap(29300, 29340, 40)).toBe(true)
    expect(r1WithinCap(29300, 29340.25, 40)).toBe(false)
    expect(r1WithinCap(6500, 6510, 10)).toBe(true)
  })

  it('resolves the per-instrument pair', () => {
    expect(resolveBandTolerance('NQ')).toEqual({ merge: 20, cap: 40 })
    expect(resolveBandTolerance('ES')).toEqual({ merge: 5, cap: 10 })
  })
})

describe('R2 — source significance', () => {
  it('ranks the G line first and the daily rung last, in the ratified order', () => {
    expect(SOURCE_SIGNIFICANCE).toEqual([
      'g-line', 'weekly-job-pivot', 'daily-job-pivot', 'jba-edge', 'rip', 'overnight-extreme',
      'previous-day-extreme', 'profile-balance', 'profile-rotation', 'autoplot', 'mgi-other', 'weekly-rung', 'daily-rung',
    ])
    expect(r2Significance('g-line')).toBe(0)
    expect(r2Significance('daily-rung')).toBe(12)
    expect(r2Significance('weekly-job-pivot')).toBeLessThan(r2Significance('daily-job-pivot'))
    expect(r2Significance('profile-balance')).toBeLessThan(r2Significance('profile-rotation'))
    expect(r2Significance('weekly-rung')).toBeLessThan(r2Significance('daily-rung'))
  })

  it('marks only ladder rungs destination-only', () => {
    for (const source of SOURCE_SIGNIFICANCE) {
      expect(r2DestinationOnly(source), source).toBe(source === 'weekly-rung' || source === 'daily-rung')
    }
  })
})

describe('R3 — "at" a band', () => {
  it.each([
    ['inside the band', 29405, true],
    ['boundary: exactly one tolerance below the low edge', 29380, true],
    ['boundary: exactly one tolerance above the high edge', 29430, true],
    ['negative: a tick further', 29379.75, false],
    ['negative: far above', 29500, false],
  ])('%s', (_, price, expected) => {
    expect(r3AtBand(price, 29400, 29410, 20)).toBe(expected)
  })
})

describe('R4 — within reach', () => {
  it('is inclusive at exactly one sigma', () => {
    expect(r4WithinReach(283, 283)).toBe(true)
    expect(r4WithinReach(0, 283)).toBe(true)
    expect(r4WithinReach(283.01, 283)).toBe(false)
  })
})

describe('R5 — failed look', () => {
  it('closes back within 30 min (inclusive)', () => {
    expect(r5FailedLook(0)).toBe(true)
    expect(r5FailedLook(30)).toBe(true)
    expect(r5FailedLook(30.02)).toBe(false)
    expect(r5FailedLook(-1)).toBe(false)
  })

  it('grades EARLY inside the first 90 min of RTH, LATE otherwise (overnight included)', () => {
    const open = Date.UTC(2026, 7, 24, 8, 30)
    expect(r5Grade(open, open)).toBe('EARLY')
    expect(r5Grade(open + 89 * 60_000, open)).toBe('EARLY')
    expect(r5Grade(open + 90 * 60_000, open)).toBe('LATE')
    expect(r5Grade(open - 60_000, open)).toBe('LATE')
  })
})

describe('R6 — build / hold beyond', () => {
  it('is a single 20-minute threshold', () => {
    expect(r6Accepted(20)).toBe(true)
    expect(r6Accepted(19.98)).toBe(false)
    expect(r6Accepted(0)).toBe(false)
  })
})

describe('R7 — approach failure', () => {
  const ok = { closestApproachPts: 40, retreatPts: 20, minutesSinceClosest: 60 }
  it.each([
    ['positive at every boundary (NQ 2× = 40, 1× = 20, 60 min)', ok, true],
    ['negative: touched the band (0 gap)', { ...ok, closestApproachPts: 0 }, false],
    ['negative: a tick further than 2× tolerance', { ...ok, closestApproachPts: 40.25 }, false],
    ['negative: retreat short of 1× tolerance', { ...ok, retreatPts: 19.75 }, false],
    ['negative: closest approach older than 60 min', { ...ok, minutesSinceClosest: 60.5 }, false],
    ['negative: closest approach in the future', { ...ok, minutesSinceClosest: -1 }, false],
  ])('%s', (_, measure, expected) => {
    expect(r7ApproachFailure(measure, 20)).toBe(expected)
  })

  it('resolves the ES multiples (10 / 5)', () => {
    expect(r7ApproachFailure({ closestApproachPts: 10, retreatPts: 5, minutesSinceClosest: 1 }, 5)).toBe(true)
    expect(r7ApproachFailure({ closestApproachPts: 10.25, retreatPts: 5, minutesSinceClosest: 1 }, 5)).toBe(false)
  })
})

describe('R8 — holding side', () => {
  it.each([
    ['all closes above', [29421, 29430, 29425], 'ABOVE'],
    ['all closes below', [29399, 29390], 'BELOW'],
    ['boundary: a close ON the high edge is not above', [29421, 29420], 'STRADDLING'],
    ['a close inside the band', [29421, 29410], 'STRADDLING'],
    ['closes on both sides', [29421, 29399], 'STRADDLING'],
  ])('%s', (_, closes, expected) => {
    expect(r8HoldingSide(closes, 29400, 29420)).toBe(expected)
  })

  it('has no read without closes', () => {
    expect(r8HoldingSide([], 29400, 29420)).toBeNull()
  })
})

describe('R9 — already-interacted', () => {
  it.each([
    ['untouched this session = fresh', { interactedThisSession: false, failedLookThisSession: false, defendedThisSession: false }, 'fresh'],
    ['touched, no fail, no defense = demoted', { interactedThisSession: true, failedLookThisSession: false, defendedThisSession: false }, 'demoted'],
    ['touched + failed look keeps full status', { interactedThisSession: true, failedLookThisSession: true, defendedThisSession: false }, 'full'],
    ['touched + defense keeps full status', { interactedThisSession: true, failedLookThisSession: false, defendedThisSession: true }, 'full'],
  ])('%s', (_, measure, expected) => {
    expect(r9TriggerStatus(measure)).toBe(expected)
  })
})

describe('R10 — mid-zone', () => {
  it('needs more than 2× tolerance from BOTH edges', () => {
    expect(r10MidZone(40.25, 40.25, 20)).toBe(true)
    expect(r10MidZone(40, 40.25, 20)).toBe(false)
    expect(r10MidZone(100, 10, 20)).toBe(false)
    expect(r10MidZone(10.25, 10.25, 5)).toBe(true)
  })
})

describe('R11 — response deadline (emitted, never evaluated)', () => {
  it('positive: a hold/traverse branch carries the 30-min deadline as text, flagged not evaluated', () => {
    const deadline = r11ResponseDeadline('hold-traverse', 'the G line 29300')
    expect(deadline).toMatchObject({ minutes: 30, evaluatedByPlanner: false })
    expect(deadline?.text).toContain('30 min')
    expect(deadline?.text).toContain('the G line 29300')
    expect(deadline?.text).toContain('does not evaluate')
  })

  it.each(['look-and-fail', 'build-beyond-continuation', 'approach-failure', 'mid-zone-two-way'] as const)(
    'negative: %s carries no deadline',
    (condition) => {
      expect(r11ResponseDeadline(condition, 'x')).toBeNull()
    },
  )

  it('boundary: nothing in the planner compares a clock against the deadline', () => {
    const dir = join(process.cwd(), 'lib/job-plan')
    const modules = ['buildPlan.ts', 'playGrammar.ts', 'playCandidates.ts', 'planPrecedence.ts', 'destinationChain.ts', 'runPlanner.ts']
    for (const file of modules) {
      const text = readFileSync(join(dir, file), 'utf8')
      expect(text, file).not.toMatch(/RESPONSE_DEADLINE_MINUTES/)
    }
    expect(RULES_SOURCE.match(/RESPONSE_DEADLINE_MINUTES/g)!.length).toBeGreaterThanOrEqual(2)
  })
})

describe('R12 — actionable set (origin-precedence half retired 2026-08-31)', () => {
  it('exports no origin-fact precedence: plays are forward conditionals ranked by frame + structure', () => {
    expect(RULES_SOURCE).not.toMatch(/ORIGIN_PRECEDENCE|r12OriginRank/)
  })

  it.each([
    ['positive: lone mgi-other is skipped', { confluence: false, significance: r2Significance('mgi-other'), destinationOnly: false }, true],
    ['positive: lone rung band is skipped (never armed)', { confluence: false, significance: r2Significance('daily-rung'), destinationOnly: true }, true],
    ['negative: lone autoplot (one tier above the catch-all) is not', { confluence: false, significance: r2Significance('autoplot'), destinationOnly: false }, false],
    ['negative: mgi-other WITH confluence is kept', { confluence: true, significance: r2Significance('mgi-other'), destinationOnly: false }, false],
    ['negative: a lone G line is kept', { confluence: false, significance: 0, destinationOnly: false }, false],
  ])('%s', (_, band, expected) => {
    expect(r12SkipBand(band)).toBe(expected)
  })

  it('boundary: the play cap is inclusive at 4', () => {
    expect(r12WithinPlayCap(4)).toBe(true)
    expect(r12WithinPlayCap(5)).toBe(false)
    expect(r12WithinPlayCap(0)).toBe(true)
  })
})

describe('R13 — export skew', () => {
  it('fails closed strictly past 5 min', () => {
    expect(r13ExportSkewExceeded(300)).toBe(false)
    expect(r13ExportSkewExceeded(301)).toBe(true)
    expect(r13ExportSkewExceeded(0)).toBe(false)
  })

  it('requires the study trading day to be the bundle session', () => {
    expect(r13TradingDayMatches('2026-08-24', '2026-08-24')).toBe(true)
    expect(r13TradingDayMatches('2026-08-24', '2026-08-25')).toBe(false)
  })
})
