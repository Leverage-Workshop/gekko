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
    plays: [
      { bandId: bandOf(ctx, 'wp'), direction: 'short', text: 'If price reaches the Weekly Pivot band, expect the offer and a turn back down toward the Daily Pivot.', rationale: 'The line itself; confluent with the overnight high.' },
      { bandId: bandOf(ctx, 'dp'), direction: 'long', text: 'A fail at the Daily Pivot, unreached below, turns price back up toward the Weekly Pivot.', rationale: 'Unreached level on the bias side: the fail against the line.' },
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

describe('llm-planner hard gates', () => {
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
    // the daily pivot band is always eligible
    expect(validateJudgment({ ...base, frame: { ...base.frame, bandId: bandOf(ctx, 'dp') } }, ctx)).toEqual([])
  })

  it('rejects directions the frame does not read (feat-149) and destination-only bands; the line and an unreached level may carry both', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    // the 1A rung is on the far side of the line (above it, price below) and not an important level: fork direction only — long
    const farShort = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'rung'), direction: 'short' as const, text: 't', rationale: 'r' }] }
    expect(validateJudgment(farShort, ctx).map((v) => v.code)).toContain('play_direction_frame')
    // the G line out there IS important: the fork long and the bounce short are both legal
    const gBoth = { ...base, plays: [...base.plays, { bandId: bandOf(ctx, 'g'), direction: 'short' as const, text: 't', rationale: 'r' }, { bandId: bandOf(ctx, 'g'), direction: 'long' as const, text: 't', rationale: 'r' }] }
    expect(validateJudgment(gBoth, ctx).filter((v) => v.code === 'play_direction_frame')).toEqual([])
    // the line carries both directions; the unreached daily pivot carries both (long as the fail, short as the hold)
    const both = { ...base, plays: [...base.plays, { ...base.plays[0], direction: 'long' as const }, { ...base.plays[1], direction: 'short' as const }] }
    expect(validateJudgment(both, ctx)).toEqual([])
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
      plays: [{ ...base.plays[0], text: 'If price reaches 20050, expect the offer back down.' }, base.plays[1]],
    }
    const codes = validateJudgment(invented, ctx)
    expect(codes.map((v) => v.code)).toContain('invented_price')
    expect(codes.find((v) => v.code === 'invented_price')?.message).toContain('20050')

    // Either side of the inventory span is still a price claim.
    const above = {
      ...base,
      plays: [{ ...base.plays[0], text: 'Through the Weekly Pivot the traverse runs toward 21000.' }, base.plays[1]],
    }
    expect(validateJudgment(above, ctx).map((v) => v.code)).toContain('invented_price')
    const below = {
      ...base,
      plays: [base.plays[0], { ...base.plays[1], text: 'Losing the Daily Pivot opens the traverse toward 19200.' }],
    }
    expect(validateJudgment(below, ctx).map((v) => v.code)).toContain('invented_price')

    const legitimate = {
      ...base,
      plays: [
        { ...base.plays[0], text: 'Reoffer 20150 on arrival, 220 pts above — the 1A stays a destination; expect the response within 30 min.' },
        base.plays[1],
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
    // a fork play (the line's own long once it is taken) answers the fork side
    const forkPlay = { ...noFork, plays: [...noFork.plays, { ...base.plays[0], direction: 'long' as const, text: 'Once price takes the Weekly Pivot and holds, the pullback into it is the long toward the 1A.' }] }
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
      plays: [{ bandId: bandOf(ctx, 'wp'), direction: 'short', text: 'If price reaches the Weekly Pivot, expect the offer.', rationale: 'The line.' }],
      sidesWithoutPlay: [],
      lean: 'Short into the Weekly Pivot.',
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
    expect([...diff.plays.sharedBandIds].sort()).toEqual([bandOf(ctx, 'dp'), bandOf(ctx, 'wp')].sort())
    expect(diff.plays.directionMismatches).toEqual([])
    // The deterministic planner carries both directions at the line and the pivot; picking one of them is agreement.
    expect(diff.plays.onlyDeterministic).toEqual([])

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
