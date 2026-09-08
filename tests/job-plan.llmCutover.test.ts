import { describe, expect, it } from 'vitest'
import { JobPlanSchema } from '@/knowledge/schema/job-plan.schema'
import type { JobContext } from '@/lib/job-plan/contextTypes'
import { isNonRetryableJobPlanError } from '@/lib/job-plan/jobPlanErrors'
import {
  assembleLlmPlan,
  LlmPlanAssemblyError,
  llmPlannerRevision,
} from '@/lib/job-plan/llm-planner/assemblePlan'
import type { LlmContextPayload } from '@/lib/job-plan/llm-planner/contextPayload'
import { LLM_PLANNER_REVISION } from '@/lib/job-plan/llm-planner/prompt'
import { LlmPlanContractError, type LlmPlannerGenerate } from '@/lib/job-plan/llm-planner/runLlmPlanner'
import type { LlmPlanJudgment } from '@/lib/job-plan/llm-planner/schema'
import { validateJudgment } from '@/lib/job-plan/llm-planner/validate'
import { PLANNER_REVISION } from '@/lib/job-plan/rules'
import { LLM_PLANNER_OFF_WARNING, runJobPlan } from '@/lib/job-plan/runJobPlan'
import { fakeJobPlanDeps, type FakeOptions } from './helpers/jobPlanDeps'
import { inSession, REQUEST_ID, RUN_ID } from './helpers/jobPlanFiles'
import { fixture, mutate } from './helpers/jobStudy'
import { synthContext } from './helpers/jobPlanContext'

/**
 * feat-145 — LLM planner production cutover: assembleLlmPlan (judgment →
 * persisted JobPlan through the code grammar) and runJobPlan's `planner:
 * 'llm'` path (one judgment call, contract failures throw retryable,
 * insufficient and unseeded-config never spend).
 */

// Same directional inventory as the feat-144 tests: NQ at 19930, weekly
// pivot (+ overnight confluence) in reach above, current daily pivot below.
function context(): JobContext {
  return synthContext({
    price: 19930,
    refs: [
      { id: 'g', source: 'g-line', price: 20450, label: 'G line' },
      { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
      { id: 'on', source: 'overnight-extreme', price: 20155, label: 'ON High' },
      { id: 'dp', source: 'daily-job-pivot', price: 19900, label: 'Daily Pivot' },
      { id: 'rung', source: 'weekly-rung', price: 20300, label: '1A' },
    ],
  })
}

/** Mid-zone inside a JBA box whose edges are inventory references. */
function midZoneContext(): JobContext {
  return synthContext({
    price: 19930,
    refs: [
      { id: 'wp', source: 'weekly-job-pivot', price: 20150, label: 'Weekly Pivot' },
      { id: 'jba:0:low', source: 'jba-edge', price: 19750, label: 'JBA 1 low', boxIndex: 0 },
      { id: 'jba:0:high', source: 'jba-edge', price: 20110, label: 'JBA 1 high', boxIndex: 0 },
    ],
    boxes: [{ low: 19750, high: 20110 }],
  })
}

function bandOf(ctx: JobContext, memberId: string): string {
  const band = ctx.bands.find((b) => b.members.some((m) => m.id === memberId))
  if (!band) throw new Error(`no band contains ${memberId}`)
  return band.id
}

function cleanJudgment(ctx: JobContext): LlmPlanJudgment {
  return {
    frame: { bandId: bandOf(ctx, 'wp'), rationale: 'Nearest stacked structure within reach.' },
    // feat-151: the line itself (wp) is never a play
    plays: [
      { bandId: bandOf(ctx, 'dp'), direction: 'short', text: 'If price breaks the Daily Pivot and holds below, the pullback into it is the short.', rationale: 'Unreached level on the bias side: the hold.' },
      // feat-150: an unreached important level carries both reads
      { bandId: bandOf(ctx, 'dp'), direction: 'long', text: 'A fail at the Daily Pivot turns price back toward the Weekly Pivot.', rationale: 'Unreached level on the bias side: the fail.' },
    ],
    sidesWithoutPlay: [{ side: 'fork', reason: 'above the Weekly Pivot only the rung and the far G line' }],
    lean: 'Short into the Weekly Pivot — below the frame line, downside is productive.',
  }
}

describe('assembleLlmPlan', () => {
  it('assembles a schema-valid ready plan: judgment order, model text as summary, code-owned geometry', () => {
    const ctx = context()
    const judgment = cleanJudgment(ctx)
    const plan = assembleLlmPlan({ judgment, context: ctx, modelId: 'served/model', meta: { bundleId: 'b-1' } })

    expect(JobPlanSchema.safeParse(plan).success).toBe(true)
    expect(plan.status).toBe('ready')
    expect(plan.plays.map((p) => p.band.bandId)).toEqual(judgment.plays.map((p) => p.bandId))
    expect(plan.plays.map((p) => p.direction)).toEqual(['short', 'long'])
    expect(plan.plays[0]).toMatchObject({ rank: 1, primary: true, summary: judgment.plays[0].text, llmRationale: judgment.plays[0].rationale })

    // The geometry-heavy parts came from the deterministic grammar.
    for (const play of plan.plays) {
      expect(play.trigger.length).toBeGreaterThan(0)
      expect(play.invalidation.provenance.referenceIds.length).toBeGreaterThan(0)
    }
    // the arrivals chain destinations; the daily-pivot hold has only the historical pivot below it in this inventory
    expect(plan.plays.filter((p) => p.stance !== 'continuation').every((p) => p.destinations.length > 0)).toBe(true)

    expect(plan.frame).toMatchObject({ referenceId: 'wp', side: 'below', llmRationale: judgment.frame.rationale })
    expect(plan.lean).toMatchObject({ playId: 'play-1', basis: 'frame', text: judgment.lean })
    expect(plan.meta).toMatchObject({
      plannerRevision: llmPlannerRevision(),
      jobPlanner: 'llm',
      llmModelId: 'served/model',
      llmPromptRevision: LLM_PLANNER_REVISION,
      bundleId: 'b-1',
    })
  })

  it('a stated side without a play is preserved as a pruned branch', () => {
    const ctx = context()
    const judgment: LlmPlanJudgment = {
      ...cleanJudgment(ctx),
      plays: [cleanJudgment(ctx).plays[0]],
      sidesWithoutPlay: [{ side: 'fork', reason: 'nothing significant to hold on the pullback beyond the line' }],
    }
    const plan = assembleLlmPlan({ judgment, context: ctx, modelId: 'm' })
    expect(plan.pruned.some((p) => p.label === 'fork side' && p.reason.includes('nothing significant'))).toBe(true)
  })

  it('a mid-zone context gets scenario plays only — no stand-down play exists (feat-146)', () => {
    const ctx = midZoneContext()
    expect(ctx.location.enclosingZone?.midZone).toBe(true)
    const judgment: LlmPlanJudgment = {
      frame: { bandId: bandOf(ctx, 'wp'), rationale: 'Weekly pivot frames from above.' },
      plays: [
        { bandId: bandOf(ctx, 'jba:0:high'), direction: 'short', text: 'If price reaches JBA 1 high, the upper edge will hold and rotate back down.', rationale: 'Enclosing zone edge above.' },
        { bandId: bandOf(ctx, 'jba:0:low'), direction: 'long', text: 'If price reaches JBA 1 low, the lower edge will hold and rotate back up.', rationale: 'Enclosing zone edge below.' },
      ],
      sidesWithoutPlay: [],
      lean: 'Lean short below the Weekly Pivot.',
    }
    const plan = assembleLlmPlan({ judgment, context: ctx, modelId: 'm' })
    expect(JobPlanSchema.safeParse(plan).success).toBe(true)
    expect(plan.plays).toHaveLength(2)
    expect(plan.plays.every((p) => p.stance !== 'stand-down')).toBe(true)
    expect(plan.plays[0]).toMatchObject({ rank: 1, primary: true, direction: 'short' })
    expect(plan.lean).toMatchObject({ playId: 'play-1', basis: 'frame', text: judgment.lean })
  })

  it('a judged direction the frame contradicts is an assembly error (broken invariant, never persisted)', () => {
    const ctx = context()
    const judgment = cleanJudgment(ctx)
    // the 1A rung is on the far side of the line and not an important level: long only — a short there passed no gate and must not assemble
    const farShort: LlmPlanJudgment = { ...judgment, plays: [{ bandId: bandOf(ctx, 'rung'), direction: 'short', text: 't', rationale: 'r' }, judgment.plays[1]] }
    expect(() => assembleLlmPlan({ judgment: farShort, context: ctx, modelId: 'm' })).toThrow(LlmPlanAssemblyError)
    // the line itself never assembles (feat-151: two-way by assumption)
    const atLine: LlmPlanJudgment = { ...judgment, plays: [...judgment.plays, { bandId: bandOf(ctx, 'wp'), direction: 'long', text: 'Once the Weekly Pivot is taken and held, the pullback is the long.', rationale: 'r' }] }
    expect(() => assembleLlmPlan({ judgment: atLine, context: ctx, modelId: 'm' })).toThrow(LlmPlanAssemblyError)
    // a far-side hold (the G line once the line is taken) assembles as a fork continuation
    const far: LlmPlanJudgment = { ...judgment, plays: [...judgment.plays, { bandId: bandOf(ctx, 'g'), direction: 'long', text: 'Once the Weekly Pivot is taken and held, the pullback into the G line is the long.', rationale: 'r' }] }
    const plan = assembleLlmPlan({ judgment: far, context: ctx, modelId: 'm' })
    expect(plan.plays.map((p) => [p.band.bandId, p.direction, p.stance])).toEqual([
      [bandOf(ctx, 'dp'), 'short', 'continuation'],
      [bandOf(ctx, 'dp'), 'long', 'rebid'],
      [bandOf(ctx, 'g'), 'long', 'continuation'],
    ])
  })

  it('a mid-zone judgment with no plays still needs both sides answered — no stand-down escape hatch', () => {
    const mid = midZoneContext()
    const empty: LlmPlanJudgment = {
      frame: { bandId: bandOf(mid, 'wp'), rationale: 'Weekly pivot frames from above.' },
      plays: [],
      sidesWithoutPlay: [],
      lean: 'Nothing to do yet.',
    }
    expect(validateJudgment(empty, mid).map((v) => v.code)).toEqual(['side_unaddressed', 'side_unaddressed'])
  })
})

// --- runJobPlan planner: 'llm' -------------------------------------------------

/** The serialized payload the runner embedded in the prompt. */
function payloadOf(prompt: string): LlmContextPayload {
  const marker = 'judge from this and nothing else):\n'
  const start = prompt.indexOf(marker)
  const end = prompt.lastIndexOf('\n\nWrite the plan now')
  if (start < 0 || end < 0) throw new Error('prompt does not carry the context payload')
  return JSON.parse(prompt.slice(start + marker.length, end)) as LlmContextPayload
}

/** A contract-clean judgment derived from whatever payload the runner sent. */
function judgmentFor(payload: LlmContextPayload): LlmPlanJudgment {
  const frame = payload.frameCandidates.find((f) => f.withinReach) ?? payload.frameCandidates[0]
  const nearest = (side: 'above' | 'below') =>
    payload.bands
      .filter((b) => b.side === side && !b.destinationOnly && b.bandId !== frame.bandId)
      .sort((a, b) => a.distancePts - b.distancePts)[0]
  const above = nearest('above')
  const below = nearest('below')
  // feat-150: an unreached important level beyond price carries both reads or neither
  // (the frame side is where the bias points: with price above the line the areas ABOVE price are the unreached bias-side levels)
  const beyondPrice = (band: LlmContextPayload['bands'][number]) => (frame.side === 'above' ? band.side === 'above' : frame.side === 'below' ? band.side === 'below' : false)
  const pair = (band: LlmContextPayload['bands'][number], first: 'long' | 'short') =>
    band.important && band.bandId !== frame.bandId && beyondPrice(band)
      ? [
          { bandId: band.bandId, direction: first, text: `If price reaches ${band.label}, expect the turn.`, rationale: 'Important level: the fail.' },
          { bandId: band.bandId, direction: first === 'long' ? ('short' as const) : ('long' as const), text: `If price breaks ${band.label} and holds, the pullback into it is the trade.`, rationale: 'Important level: the hold.' },
        ]
      : [{ bandId: band.bandId, direction: first, text: `If price reaches ${band.label}, expect the turn back.`, rationale: 'Nearest significant area.' }]
  return {
    frame: { bandId: frame.bandId, rationale: 'The strongest candidate band within reach.' },
    plays: [...(above ? pair(above, 'short') : []), ...(below ? pair(below, 'long') : [])],
    // feat-149: excuse whichever sides the two nearest-area plays leave unaddressed (extra reasons are harmless)
    sidesWithoutPlay: [
      { side: 'fork' as const, reason: 'nothing beyond the line worth holding on the pullback' },
      ...(above && below ? [] : [{ side: 'bias' as const, reason: 'nothing playable on the bias side within reach' }]),
    ],
    lean: 'Primary look at the nearest key area.',
  }
}

const answeringJudgment: LlmPlannerGenerate = (async (params: { prompt: string }) => ({
  object: judgmentFor(payloadOf(params.prompt)),
  model: 'served/planner-model',
  cost: 0.02,
  latencyMs: 7,
  usage: {},
})) as unknown as LlmPlannerGenerate

const brokenJudgment: LlmPlannerGenerate = (async (params: { prompt: string }) => ({
  object: { ...judgmentFor(payloadOf(params.prompt)), frame: { bandId: 'not-a-candidate', rationale: 'x' } },
  model: 'served/planner-model',
  cost: 0.02,
  latencyMs: 7,
  usage: {},
})) as unknown as LlmPlannerGenerate

const runWith = (options: FakeOptions, planner?: 'deterministic' | 'llm') => {
  const fake = fakeJobPlanDeps(options)
  return {
    ...fake,
    result: runJobPlan(fake.deps, {
      runId: RUN_ID,
      triggerReason: 'manual',
      bundleRequestId: REQUEST_ID,
      ...(planner === undefined ? {} : { planner }),
    }),
  }
}

describe("runJobPlan planner: 'llm'", () => {
  it('persists the LLM-assembled plan with the combined revision and reports the judgment spend', async () => {
    const { result, state } = runWith({ generateJudgment: answeringJudgment }, 'llm')
    const out = await result
    expect(out.status).toBe('ready')
    expect(out.plannerRevision).toBe(llmPlannerRevision())
    expect(out.llm).toMatchObject({ modelId: 'served/planner-model', promptRevision: LLM_PLANNER_REVISION, attempts: 1, costUsd: 0.02 })
    expect(state.judgmentCalls).toHaveLength(1)
    expect(state.judgmentCalls[0].model).toBe('test/planner-model')

    const row = state.inserted[0]
    expect(row.planner_revision).toBe(llmPlannerRevision())
    expect(JobPlanSchema.safeParse(row.plan).success).toBe(true)
    expect(row.plan.meta).toMatchObject({ jobPlanner: 'llm', llmModelId: 'served/planner-model', llmPromptRevision: LLM_PLANNER_REVISION, plannerRevision: llmPlannerRevision() })
    expect(row.plan.plays.length).toBeGreaterThan(0)
    expect(row.plan.plays.every((p) => p.stance !== 'stand-down' && p.llmRationale != null)).toBe(true)
  })

  it('the default stays deterministic: no judgment call, no llm meta', async () => {
    const { result, state } = runWith({ generateJudgment: answeringJudgment })
    const out = await result
    expect(out.plannerRevision).toBe(PLANNER_REVISION)
    expect(out.llm).toBeNull()
    expect(state.judgmentCalls).toEqual([])
    expect(state.inserted[0].plan.meta.jobPlanner).toBeUndefined()
  })

  it('the mode is part of the input fingerprint: llm and deterministic runs never collide', async () => {
    const det = await runWith({ generateJudgment: answeringJudgment }).result
    const llm = await runWith({ generateJudgment: answeringJudgment }, 'llm').result
    expect(det.inputFingerprint).not.toBe(llm.inputFingerprint)
  })

  it('insufficient geometry fails closed BEFORE any judgment spend and persists the deterministic insufficient plan', async () => {
    const skewed = mutate(inSession(fixture('daily.json')), (doc) => {
      doc.meta.exportedAt = '2026-08-24T08:21:00'
      doc.meta.lastBarTime = '2026-08-24T08:20:00'
    })
    const { result, state } = runWith({ texts: { jobStudyDaily: skewed }, generateJudgment: answeringJudgment }, 'llm')
    const out = await result
    expect(out.status).toBe('insufficient')
    expect(out.llm).toBeNull()
    expect(state.judgmentCalls).toEqual([])
    expect(state.inserted[0].planner_revision).toBe(PLANNER_REVISION)
  })

  it('an unseeded config falls back to the deterministic plan with a warning, never a dead run', async () => {
    const { result, state } = runWith({ config: null, generateJudgment: answeringJudgment }, 'llm')
    const out = await result
    expect(out.status).toBe('ready')
    expect(out.warnings).toContain(LLM_PLANNER_OFF_WARNING)
    expect(out.llm).toBeNull()
    expect(state.judgmentCalls).toEqual([])
    expect(state.inserted[0].planner_revision).toBe(PLANNER_REVISION)
    expect(state.inserted[0].plan.meta.jobPlanner).toBeUndefined()
  })

  it('violations surviving the retry throw the RETRYABLE contract error and persist nothing', async () => {
    const { result, state } = runWith({ generateJudgment: brokenJudgment }, 'llm')
    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LlmPlanContractError)
    expect((error as LlmPlanContractError).violations.map((v) => v.code)).toContain('frame_unknown_candidate')
    expect(isNonRetryableJobPlanError(error)).toBe(false)
    expect(state.judgmentCalls).toHaveLength(2)
    expect(state.inserted).toEqual([])
  })
})
