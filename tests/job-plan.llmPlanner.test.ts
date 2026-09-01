import { describe, expect, it } from 'vitest'
import { buildPlan } from '@/lib/job-plan/buildPlan'
import type { JobContext } from '@/lib/job-plan/contextTypes'
import { frameCandidates, llmContextPayload } from '@/lib/job-plan/llm-planner/contextPayload'
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
    frame: { referenceId: 'wp', rationale: 'The weekly pivot is the most important line within realistic interaction range.' },
    plays: [
      { bandId: bandOf(ctx, 'wp'), direction: 'short', text: 'If price reaches the Weekly Pivot band, expect the offer and a turn back down toward the Daily Pivot.', rationale: 'Confluent with the overnight high; frame side.' },
      { bandId: bandOf(ctx, 'dp'), direction: 'long', text: 'If price reaches the Daily Pivot, expect the bid and a turn back up toward the Weekly Pivot.', rationale: 'Nearest significant level below; no nearer level to breach.' },
    ],
    sidesWithoutPlay: [],
    standDown: false,
    standDownText: null,
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

  it('embeds the payload and pins the revision format', () => {
    expect(buildLlmPlannerPrompt('{"marker":42}')).toContain('{"marker":42}')
    expect(LLM_PLANNER_REVISION).toMatch(/^llm-planner\/\d{4}-\d{2}-\d{2}\.\d+$/)
  })
})

describe('llm-planner context payload', () => {
  it('frames only on tier-one non-historical lines; bands carry role + freshness', () => {
    const ctx = context()
    const frames = frameCandidates(ctx)
    expect(frames.map((f) => f.id).sort()).toEqual(['dp', 'g', 'rung', 'wp'])
    expect(frames.find((f) => f.id === 'g')?.withinReach).toBe(false)
    expect(frames.find((f) => f.id === 'wp')?.withinReach).toBe(true)

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

  it('rejects a non-tier-one or historical or unknown frame', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    expect(validateJudgment({ ...base, frame: { ...base.frame, referenceId: 'on' } }, ctx).map((v) => v.code)).toContain('frame_not_tier_one')
    expect(validateJudgment({ ...base, frame: { ...base.frame, referenceId: 'dph' } }, ctx).map((v) => v.code)).toContain('frame_historical_pivot')
    expect(validateJudgment({ ...base, frame: { ...base.frame, referenceId: 'nope' } }, ctx).map((v) => v.code)).toContain('frame_unknown_reference')
  })

  it('rejects geometry-inverted directions and destination-only bands', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    const inverted = { ...base, plays: [{ ...base.plays[0], direction: 'long' as const }, base.plays[1]] }
    expect(validateJudgment(inverted, ctx).map((v) => v.code)).toContain('play_direction_geometry')
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

  it('requires every playable side to carry a play or a reason — unless standing down', () => {
    const ctx = context()
    const base = cleanJudgment(ctx)
    const oneSided = { ...base, plays: [base.plays[0]] }
    expect(validateJudgment(oneSided, ctx).map((v) => v.code)).toContain('side_unaddressed')
    const excused = { ...oneSided, sidesWithoutPlay: [{ side: 'below' as const, reason: 'nothing significant within realistic reach below' }] }
    expect(validateJudgment(excused, ctx)).toEqual([])
    const standing = { ...oneSided, standDown: true, standDownText: 'Two-way between the Daily Pivot and the Weekly Pivot.' }
    expect(validateJudgment(standing, ctx)).toEqual([])
    expect(validateJudgment({ ...standing, standDownText: null }, ctx).map((v) => v.code)).toContain('stand_down_without_text')
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
      frame: { referenceId: 'wp', rationale: 'Most important line in reach.' },
      plays: [{ bandId: bandOf(ctx, 'wp'), direction: 'short', text: 'If price reaches the Weekly Pivot, expect the offer.', rationale: 'Frame side.' }],
      sidesWithoutPlay: [],
      standDown: false,
      standDownText: null,
      lean: 'Short into the Weekly Pivot.',
    }
    expect(validateJudgment(judgment, ctx).map((v) => v.code)).toContain('side_unaddressed')
    const excused = { ...judgment, sidesWithoutPlay: [{ side: 'below' as const, reason: 'only the 1B rung below — destinations, nothing to play' }] }
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
    const bad = { ...cleanJudgment(ctx), frame: { referenceId: 'on', rationale: 'x' } }
    const prompts: string[] = []
    const fixed = await runLlmPlanner({ context: ctx, model: 'test/model', generate: fakeGenerate([bad, cleanJudgment(ctx)], prompts) })
    expect(fixed.attempts).toBe(2)
    expect(fixed.violations).toEqual([])
    expect(fixed.costUsd).toBeCloseTo(0.02)
    expect(prompts[1]).toContain('frame_not_tier_one')
    expect(prompts[1]).toContain('violated the contract')

    const stubborn = await runLlmPlanner({ context: ctx, model: 'test/model', generate: fakeGenerate([bad, bad]) })
    expect(stubborn.attempts).toBe(2)
    expect(stubborn.violations.map((v) => v.code)).toContain('frame_not_tier_one')
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
    expect(diff.standDown.agree).toBe(true)
    expect([...diff.plays.sharedBandIds].sort()).toEqual([bandOf(ctx, 'dp'), bandOf(ctx, 'wp')].sort())
    expect(diff.plays.directionMismatches).toEqual([])
    // The deterministic planner also armed the historical daily pivot band.
    expect(diff.plays.onlyDeterministic.map((p) => p.bandId)).toEqual([bandOf(ctx, 'dph')])

    const reframed = { ...judgment, frame: { referenceId: 'dp', rationale: 'x' } }
    expect(diffJudgment(det, reframed, ctx).frame.agree).toBe(false)
    const stability = stabilityDiff(judgment, reframed)
    expect(stability.frameAgree).toBe(false)
    expect(stability.stable).toBe(false)
    expect(stabilityDiff(judgment, judgment).stable).toBe(true)
  })

  it('stabilityAcross catches a flip in ANY later run, not just the second', () => {
    const ctx = context()
    const judgment = cleanJudgment(ctx)
    const reframed = { ...judgment, frame: { referenceId: 'dp', rationale: 'x' } }
    expect(stabilityAcross([judgment])).toBeNull()
    expect(stabilityAcross([judgment, judgment, judgment])?.stable).toBe(true)
    expect(stabilityAcross([judgment, judgment, reframed])?.stable).toBe(false)
  })
})
