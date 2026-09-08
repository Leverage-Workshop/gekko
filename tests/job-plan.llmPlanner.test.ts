import { describe, expect, it } from 'vitest'
import { buildPlan } from '@/lib/job-plan/buildPlan'
import type { JobContext } from '@/lib/job-plan/contextTypes'
import { frameCandidatesPayload, llmContextPayload } from '@/lib/job-plan/llm-planner/contextPayload'
import { diffJudgment, stabilityAcross, stabilityDiff } from '@/lib/job-plan/llm-planner/diff'
import {
  buildLlmPlannerPrompt,
  FORBIDDEN_PHRASES,
  LLM_PLANNER_REVISION,
  MECHANISM,
  ROLE,
  RULE_CANARIES,
} from '@/lib/job-plan/llm-planner/prompt'
import { runLlmPlanner, type LlmPlannerGenerate } from '@/lib/job-plan/llm-planner/runLlmPlanner'
import { LlmPlanJudgmentSchema, type LlmPlanJudgment } from '@/lib/job-plan/llm-planner/schema'
import { validateJudgment } from '@/lib/job-plan/llm-planner/validate'
import { synthContext } from './helpers/jobPlanContext'

/**
 * feat-144 — LLM shadow planner: prompt canaries (positive + the operator's
 * entry-action prohibition as a NEGATIVE canary), payload shape, the hard
 * gates, the one-retry loop, and the A/B diff.
 */

// NQ, price 19930 — near the daily pivot so the context is directional, not
// mid-zone: G line out of reach above, weekly pivot (+ overnight confluence)
// in reach above, current + historical daily pivots below, a destination-only
// rung above.
function context(): JobContext {
  return synthContext({
    price: 19930,
    refs: [
      { id: 'g', source: 'g-line', price: 20450, label: 'G line' },
      { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
      { id: 'on', source: 'overnight-extreme', price: 20155, label: 'ON High' },
      { id: 'dp', source: 'daily-job-pivot', price: 19900, label: 'Daily Pivot' },
      { id: 'dph', source: 'daily-job-pivot', price: 19850, label: 'Prior Daily Pivot', pivotRole: 'historical' },
      { id: 'rung', source: 'weekly-rung', price: 20300, label: '1A' },
    ],
  })
}

function bandOf(ctx: JobContext, memberId: string): string {
  const band = ctx.bands.find((b) => b.members.some((m) => m.id === memberId))
  if (!band) throw new Error(`no band contains ${memberId}`)
  return band.id
}

function cleanJudgment(ctx: JobContext): LlmPlanJudgment {
  return {
    frame: { bandId: bandOf(ctx, 'wp'), rationale: 'The weekly pivot band (with the overnight high) is the nearest stacked structure within reach.' },
    // feat-151: the line itself (wp) is never a play — two-way by assumption
    plays: [
      // feat-152: the unreached daily pivot carries both reads in ONE two-way play
      { bandId: bandOf(ctx, 'dp'), direction: 'two-way', text: 'At the Daily Pivot, unreached below: a fail there turns price back up toward the Weekly Pivot; a break that holds makes the pullback into it the short toward the Prior Daily Pivot.', rationale: 'Unreached important level on the bias side: both reads, one slot.' },
    ],
    // feat-149: the fork side (what to do once the line is taken) needs a play or a reason
    sidesWithoutPlay: [{ side: 'fork', reason: 'above the Weekly Pivot only the 1A rung and the far G line — destinations, nothing to hold on the pullback' }],
    lean: 'Short into the Weekly Pivot — below the frame line, downside is productive.',
  }
}

describe('llm-planner prompt', () => {
  it('carries every rule canary, the breach test, and the level-only doctrine', () => {
    const prompt = buildLlmPlannerPrompt('{}')
    for (const canary of RULE_CANARIES) expect(prompt).toContain(canary)
    expect(prompt).toContain('more likely than not that price will breach')
    expect(prompt).toContain('the operator trades the level, the plan names it')
    expect(prompt).toContain(ROLE)
    expect(prompt).toContain(MECHANISM)
  })

  it('NEVER prescribes entry price action (operator 2026-08-31: "I just need the level")', () => {
    const prompt = buildLlmPlannerPrompt('{}').toLowerCase()
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(prompt, `forbidden phrase "${phrase}"`).not.toContain(phrase)
    }
  })

  it('carries no stand-down rule and no play-the-edges clause (operator 2026-09-01: plans are scenario catalogs; edges never exhaust the plan)', () => {
    const prompt = buildLlmPlannerPrompt('{}').toLowerCase()
    expect(prompt).not.toContain('stand down')
    expect(prompt).not.toContain('standdown')
    expect(prompt).not.toContain('play the edges')
    expect(prompt).not.toContain('mid-zone')
  })

  it('embeds the payload and pins the revision format', () => {
    expect(buildLlmPlannerPrompt('{"marker":42}')).toContain('{"marker":42}')
    expect(LLM_PLANNER_REVISION).toMatch(/^llm-planner\/\d{4}-\d{2}-\d{2}\.\d+$/)
  })
})

describe('llm-planner context payload', () => {
  it('frame candidates are BANDS on the bias-line ladder (feat-148): daily pivot, weekly pivot, G line; rungs and historical pivots never anchor', () => {
    const ctx = context()
    const frames = frameCandidatesPayload(ctx)
    expect(frames.map((f) => f.anchorId).sort()).toEqual(['dp', 'g', 'wp'])
    const g = frames.find((f) => f.anchorId === 'g')!
    const wp = frames.find((f) => f.anchorId === 'wp')!
    const dp = frames.find((f) => f.anchorId === 'dp')!
    expect(g).toMatchObject({ tier: 1, withinReach: false, stacked: false })
    // the overnight high sits in the weekly pivot's band and counts toward confluence
    expect(wp).toMatchObject({ bandId: bandOf(ctx, 'wp'), tier: 1, withinReach: true, stacked: true, side: 'below' })
    expect(wp.confluenceLabels).toEqual(['Weekly Pivot', 'ON High'])
    expect(dp).toMatchObject({ tier: 0, withinReach: true, side: 'above' })
    // strongest first: the stacked weekly band, then the lone daily pivot, then the far G line
    expect(frames.map((f) => f.anchorId)).toEqual(['wp', 'dp', 'g'])

    const payload = llmContextPayload(ctx)
    expect(payload.currentPrice).toBe(19930)
    const wpBand = payload.bands.find((b) => b.bandId === bandOf(ctx, 'wp'))
    expect(wpBand?.confluence).toBe(true)
    expect(wpBand?.side).toBe('above')
    const rungBand = payload.bands.find((b) => b.bandId === bandOf(ctx, 'rung'))
    expect(rungBand?.destinationOnly).toBe(true)
    expect(payload.bands.every((b) => b.triggerStatus === 'fresh')).toBe(true)
  })
})

describe('llm-planner context payload — importance (feat-150)', () => {
  it('marks every band the frame ladder could anchor on, the extremes, and any stack as important, with reasons; distribution edges are spelled out', () => {
    const ctx = synthContext({
      price: 19930,
      refs: [
        { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
        { id: 'dp', source: 'daily-job-pivot', price: 19900, label: 'Daily Pivot' },
        { id: 'edge', source: 'profile-balance', price: 20050, label: 'balance-area lvn #2', node: { kind: 'lvn', prominence: 2, distributionEdges: [{ edge: 'lower', rank: 2, low: 20055, high: 20300, peak: 20180 }] } },
        { id: 'ibh', source: 'mgi-other', price: 20052, label: 'IBH' },
        { id: 'hvn', source: 'profile-rotation', price: 19800, label: '400-pt rotation hvn #1', node: { kind: 'hvn', profile: 'rotation', prominence: 3 } },
        { id: 'rip', source: 'rip', price: 19700, label: 'Rip' },
      ],
    })
    const payload = llmContextPayload(ctx)
    const at = (id: string) => payload.bands.find((b) => b.bandId === bandOf(ctx, id))!
    expect(at('dp')).toMatchObject({ important: true, fadeFirst: false, importantBecause: ['Daily Pivot is the current daily Job Pivot'], distributionEdges: [] })
    expect(at('edge')).toMatchObject({ important: true, fadeFirst: true, confluence: true })
    expect(at('edge').importantBecause).toEqual([
      'balance-area lvn #2 is the lower edge of the rank-2 balance-area distribution 20055–20300',
      '2 references stack into this band',
    ])
    expect(at('edge').distributionEdges).toEqual(['balance-area lvn #2: lower edge of the rank-2 balance-area distribution 20055–20300'])
    expect(at('hvn')).toMatchObject({ important: false, fadeFirst: false, importantBecause: [] })
    expect(at('rip')).toMatchObject({ important: false })
  })

  it("feat-153: a prior session's daily pivot and an hvn are destination-only in the payload — never important on their own, never a play", () => {
    const ctx = synthContext({
      price: 19930,
      refs: [
        { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
        { id: 'dp', source: 'daily-job-pivot', price: 19900, label: 'Daily Pivot' },
        { id: 'dph', source: 'daily-job-pivot', price: 19850, label: 'Prior Daily Pivot', pivotRole: 'historical' },
        { id: 'hvn', source: 'profile-balance', price: 20050, label: 'balance-area hvn (primary) #1', node: { kind: 'hvn', prominence: 1, primary: true } },
        { id: 'lvn', source: 'profile-balance', price: 19800, label: 'balance-area lvn #2', node: { kind: 'lvn', prominence: 2 } },
      ],
    })
    const payload = llmContextPayload(ctx)
    const at = (id: string) => payload.bands.find((b) => b.bandId === bandOf(ctx, id))!
    expect(at('dph')).toMatchObject({ destinationOnly: true, important: false, importantBecause: [] })
    expect(at('hvn')).toMatchObject({ destinationOnly: true, important: false })
    expect(at('dp')).toMatchObject({ destinationOnly: false, important: true })
    expect(at('lvn')).toMatchObject({ destinationOnly: false })
    expect(payload.references.find((r) => r.id === 'dph')?.destinationOnly).toBe(true)
    expect(payload.references.find((r) => r.id === 'hvn')?.destinationOnly).toBe(true)

    const judgment: LlmPlanJudgment = {
      frame: { bandId: bandOf(ctx, 'wp'), rationale: 'Weekly Pivot frames.' },
      plays: [
        { bandId: bandOf(ctx, 'hvn'), direction: 'short', text: 't', rationale: 'r' },
        { bandId: bandOf(ctx, 'dph'), direction: 'two-way', text: 't', rationale: 'r' },
      ],
      sidesWithoutPlay: [{ side: 'fork', reason: 'nothing above the line' }],
      lean: 'Short into the Weekly Pivot.',
    }
    const codes = validateJudgment(judgment, ctx).map((v) => v.code)
    expect(codes.filter((c) => c === 'play_destination_only')).toHaveLength(2)
  })
})

describe('llm-planner hard gates', () => {
  it('feat-150/152: an unreached important level is ONE play — the fail, the hold, or two-way (the model\'s call); two-way is illegal where only one read exists; a band never appears twice', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    const at = (direction: 'long' | 'short' | 'two-way') => ({ ...base, plays: [{ ...base.plays[0], direction }] })
    expect(validateJudgment(at('long'), ctx)).toEqual([])
    expect(validateJudgment(at('short'), ctx)).toEqual([])
    expect(validateJudgment(at('two-way'), ctx)).toEqual([])
    // the fail and the hold as two plays on one band is a duplicate — that is what the two-way play is for
    const twoSlots = { ...base, plays: [{ ...base.plays[0], direction: 'short' as const }, { ...base.plays[0], direction: 'long' as const }] }
    expect(validateJudgment(twoSlots, ctx).map((v) => v.code)).toEqual(['play_duplicate_band'])
    // two-way at a level that reads one way only (a Rip beyond price is not important) is a direction violation
    const withRip = synthContext({
      price: 19930,
      refs: [
        { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
        { id: 'rip', source: 'rip', price: 19880, label: 'Rip' },
      ],
    })
    const ripTwoWay: LlmPlanJudgment = {
      frame: { bandId: bandOf(withRip, 'wp'), rationale: 'The line.' },
      plays: [{ bandId: bandOf(withRip, 'rip'), direction: 'two-way', text: 'Two-way at the Rip.', rationale: 'r' }],
      sidesWithoutPlay: [{ side: 'fork', reason: 'nothing above the line' }],
      lean: 'Short below the line.',
    }
    const v = validateJudgment(ripTwoWay, withRip)
    expect(v.map((x) => x.code)).toEqual(['play_direction_frame'])
    expect(v[0].message).toContain('two-way is a read only at an unreached important level')
  })

  it('accepts a clean judgment', () => {
    const ctx = context()
    expect(validateJudgment(cleanJudgment(ctx), ctx)).toEqual([])
  })

  it('rejects a frame that is not a candidate band (historical pivot, rung, unknown) or is out of reach while others are in reach', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: bandOf(ctx, 'dph') } }, ctx).map((v) => v.code)).toContain('frame_unknown_candidate')
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: bandOf(ctx, 'rung') } }, ctx).map((v) => v.code)).toContain('frame_unknown_candidate')
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: 'nope' } }, ctx).map((v) => v.code)).toContain('frame_unknown_candidate')
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: bandOf(ctx, 'g') } }, ctx).map((v) => v.code)).toContain('frame_out_of_reach')
    // the daily pivot band is always eligible (framing there makes the judgment's dp plays plays-at-the-line — feat-151 — but never a frame violation)
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: bandOf(ctx, 'dp') } }, ctx).map((v) => v.code).filter((c) => c.startsWith('frame_'))).toEqual([])
  })

  it('rejects directions the frame does not read (feat-149) and destination-only bands; the line and an unreached level may carry both', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    // the 1A rung is on the far side of the line (above it, price below) and not an important level: fork direction only — long
    const farShort = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'rung'), direction: 'short' as const, text: 't', rationale: 'r' }] }
    expect(validateJudgment(farShort, ctx).map((v) => v.code)).toContain('play_direction_frame')
    // the G line out there IS important: the fork long, the bounce short, or the two-way are each legal
    for (const direction of ['long', 'short', 'two-way'] as const) {
      const g = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'g'), direction, text: 't', rationale: 'r' }] }
      expect(validateJudgment(g, ctx).filter((v) => v.code === 'play_direction_frame')).toEqual([])
    }
    // the unreached daily pivot's two-way play is in the clean judgment
    expect(validateJudgment(base, ctx)).toEqual([])
    // feat-151: the line itself is never a play, in either direction
    for (const direction of ['short', 'long'] as const) {
      const atLine = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'wp'), direction, text: 't', rationale: 'r' }] }
      expect(validateJudgment(atLine, ctx).map((v) => v.code)).toEqual(['play_at_frame_line'])
    }
    // the same band twice in the same direction is still a duplicate
    const dup = { ...base, plays: [...base.plays, base.plays[0]] }
    expect(validateJudgment(dup, ctx).map((v) => v.code)).toContain('play_duplicate_band')
    const rung = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'rung'), direction: 'short' as const, text: 't', rationale: 'r' }] }
    expect(validateJudgment(rung, ctx).map((v) => v.code)).toContain('play_destination_only')
  })

  it('rejects invented prices in prose but ignores distances, minutes, and known prices', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    const invented = {
      ...base,
      plays: [{ ...base.plays[0], text: 'If price reaches 20050, expect the offer back down.' }],
    }
    const codes = validateJudgment(invented, ctx)
    expect(codes.map((v) => v.code)).toContain('invented_price')
    expect(codes.find((v) => v.code === 'invented_price')?.message).toContain('20050')

    // Either side of the inventory span is still a price claim.
    const above = {
      ...base,
      plays: [{ ...base.plays[0], text: 'Through the Weekly Pivot the traverse runs toward 21000.' }],
    }
    expect(validateJudgment(above, ctx).map((v) => v.code)).toContain('invented_price')
    const below = {
      ...base,
      plays: [{ ...base.plays[0], text: 'Losing the Daily Pivot opens the traverse toward 19200.' }],
    }
    expect(validateJudgment(below, ctx).map((v) => v.code)).toContain('invented_price')

    const legitimate = {
      ...base,
      plays: [
        { ...base.plays[0], text: 'Reoffer 19900 on the hold, 30 pts below — the 1A stays a destination; expect the response within 30 min.' },
        ...base.plays.slice(1),
      ],
    }
    expect(validateJudgment(legitimate, ctx)).toEqual([])
  })

  it('requires BOTH sides of the line — bias and fork — to carry a play or a reason, unconditionally (feat-146/149)', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    const noFork = { ...base, sidesWithoutPlay: [] }
    expect(validateJudgment(noFork, ctx).map((v) => v.code)).toContain('side_unaddressed')
    expect(validateJudgment(noFork, ctx).find((v) => v.code === 'side_unaddressed')?.message).toContain('fork')
    // a fork play (the far G line's hold once the line is taken) answers the fork side — the line's own long is assumed, never written (feat-151)
    const forkPlay = { ...noFork, plays: [...noFork.plays, { bandId: bandOf(ctx, 'g'), direction: 'long' as const, text: 'Once price takes the Weekly Pivot and holds, the pullback into the G line is the long.', rationale: 'Far side.' }] }
    expect(validateJudgment(forkPlay, ctx)).toEqual([])
    // no bias play at all is a violation too
    const noBias = { ...base, plays: [], sidesWithoutPlay: base.sidesWithoutPlay }
    expect(validateJudgment(noBias, ctx).map((v) => v.code)).toEqual(['side_unaddressed'])
  })

  it('a side with only destination-only structure still needs its one-line reason', () => {
    const ctx = synthContext({
      price: 19930,
      refs: [
        { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
        { id: 'dp', source: 'daily-job-pivot', price: 20100, label: 'Daily Pivot' },
        { id: 'rung', source: 'weekly-rung', price: 19700, label: '1B' },
      ],
    })
    const judgment: LlmPlanJudgment = {
      frame: { bandId: bandOf(ctx, 'wp'), rationale: 'Most important line in reach.' },
      // feat-151: the line (wp) is never a play; the unreached daily pivot beyond price carries the bias-side hold
      plays: [{ bandId: bandOf(ctx, 'dp'), direction: 'short', text: 'If price breaks the Daily Pivot and holds, the pullback into it is the short.', rationale: 'The hold.' }],
      sidesWithoutPlay: [],
      lean: 'Short below the Daily Pivot once it is lost.',
    }
    expect(validateJudgment(judgment, ctx).map((v) => v.code)).toContain('side_unaddressed')
    const excused = { ...judgment, sidesWithoutPlay: [{ side: 'fork' as const, reason: 'nothing above the Weekly Pivot to hold on the pullback' }] }
    expect(validateJudgment(excused, ctx)).toEqual([])
  })
})

function fakeGenerate(answers: LlmPlanJudgment[], prompts: string[] = []): LlmPlannerGenerate {
  let call = 0
  return (async (params: { prompt: string }) => {
    prompts.push(params.prompt)
    const object = answers[Math.min(call, answers.length - 1)]
    call++
    return { object, model: 'test/model', usage: {}, cost: 0.01, cachedInputTokens: null, latencyMs: 5 }
  }) as unknown as LlmPlannerGenerate
}

describe('runLlmPlanner', () => {
  it('passes a clean first attempt through untouched', async () => {
    const ctx = context()
    const result = await runLlmPlanner({ context: ctx, model: 'test/model', generate: fakeGenerate([cleanJudgment(ctx)]) })
    expect(result.attempts).toBe(1)
    expect(result.violations).toEqual([])
    expect(result.promptRevision).toBe(LLM_PLANNER_REVISION)
    expect(result.costUsd).toBeCloseTo(0.01)
  })

  it('retries ONCE with the violations spelled out, then records what remains', async () => {
    const ctx = context()
    const bad = { ...cleanJudgment(ctx), frame: { bandId: bandOf(ctx, 'g'), rationale: 'x' } }
    const prompts: string[] = []
    const fixed = await runLlmPlanner({ context: ctx, model: 'test/model', generate: fakeGenerate([bad, cleanJudgment(ctx)], prompts) })
    expect(fixed.attempts).toBe(2)
    expect(fixed.violations).toEqual([])
    expect(fixed.costUsd).toBeCloseTo(0.02)
    expect(prompts[1]).toContain('frame_out_of_reach')
    expect(prompts[1]).toContain('violated the contract')

    const stubborn = await runLlmPlanner({ context: ctx, model: 'test/model', generate: fakeGenerate([bad, bad]) })
    expect(stubborn.attempts).toBe(2)
    expect(stubborn.violations.map((v) => v.code)).toContain('frame_out_of_reach')
  })

  it('records BOTH planner calls as LangSmith job-plan-task runs (the prompt was never traced before)', async () => {
    const ctx = context()
    const bad = { ...cleanJudgment(ctx), frame: { bandId: bandOf(ctx, 'g'), rationale: 'x' } }
    const seen: Array<{ telemetry?: { functionId: string; metadata?: Record<string, unknown> } }> = []
    const generate = (async (params: { telemetry?: { functionId: string; metadata?: Record<string, unknown> } }) => {
      seen.push(params)
      const object = seen.length === 1 ? bad : cleanJudgment(ctx)
      return { object, model: 'test/model', usage: {}, cost: 0, cachedInputTokens: null, latencyMs: 1 }
    }) as unknown as LlmPlannerGenerate
    await runLlmPlanner({ context: ctx, model: 'test/model', generate })
    expect(seen).toHaveLength(2)
    for (const call of seen) {
      expect(call.telemetry?.functionId).toBe('job-plan-task')
      expect(call.telemetry?.metadata).toMatchObject({ stage: 'llm-planner', promptRevision: LLM_PLANNER_REVISION })
    }
    expect(seen[1]?.telemetry?.metadata).toMatchObject({ attempt: 2 })
  })

  it('rejects an out-of-schema answer via the judgment schema', () => {
    expect(() => LlmPlanJudgmentSchema.parse({ frame: { referenceId: 'wp' } })).toThrow()
  })

  it('fails closed on an insufficient context — no model call, no spend', async () => {
    const ctx = context()
    const insufficient: JobContext = { ...ctx, price: { ...ctx.price, value: Number.NaN } }
    const generate = fakeGenerate([cleanJudgment(ctx)])
    await expect(runLlmPlanner({ context: insufficient, model: 'test/model', generate })).rejects.toThrow(/insufficient context, no model call/)
  })
})

describe('shadow diff', () => {
  it('scores agreement against the deterministic plan and catches instability', () => {
    const ctx = context()
    const det = buildPlan({ context: ctx })
    expect(det.status).toBe('ready')

    const judgment = cleanJudgment(ctx)
    const diff = diffJudgment(det, judgment, ctx)
    expect(diff.frame.agree).toBe(true)
    expect(diff.primary.agree).toBe(true)
    expect(diff.deterministicStandDown).toBe(false)
    expect([...diff.plays.sharedBandIds]).toEqual([bandOf(ctx, 'dp')])
    expect(diff.plays.directionMismatches).toEqual([])
    // The deterministic planner carries both directions at the pivot (the line itself is never a play, feat-151); picking one of them is agreement.
    // With the line's slots freed the deterministic plan reaches farther areas the judgment did not name — those are its own, never the pivot.
    expect(diff.plays.onlyDeterministic.map((p) => p.bandId)).not.toContain(bandOf(ctx, 'dp'))

    const reframed = { ...judgment, frame: { bandId: bandOf(ctx, 'dp'), rationale: 'x' } }
    expect(diffJudgment(det, reframed, ctx).frame.agree).toBe(false)
    const stability = stabilityDiff(judgment, reframed)
    expect(stability.frameAgree).toBe(false)
    expect(stability.stable).toBe(false)
    expect(stabilityDiff(judgment, judgment).stable).toBe(true)
  })

  it('stabilityAcross catches a flip in ANY later run, not just the second', () => {
    const ctx = context()
    const judgment = cleanJudgment(ctx)
    const reframed = { ...judgment, frame: { bandId: bandOf(ctx, 'dp'), rationale: 'x' } }
    expect(stabilityAcross([judgment])).toBeNull()
    expect(stabilityAcross([judgment, judgment, judgment])?.stable).toBe(true)
    expect(stabilityAcross([judgment, judgment, reframed])?.stable).toBe(false)
  })
})
