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
    frame: { referenceId: 'wp', rationale: 'Most important line within realistic reach.' },
    plays: [
      { bandId: bandOf(ctx, 'wp'), direction: 'short', text: 'If price reaches the Weekly Pivot, expect the offer and a turn back toward the Daily Pivot.', rationale: 'Confluent with the overnight high; frame side.' },
      { bandId: bandOf(ctx, 'dp'), direction: 'long', text: 'If price reaches the Daily Pivot, expect the bid and a turn back toward the Weekly Pivot.', rationale: 'Nearest significant level below.' },
    ],
    sidesWithoutPlay: [],
    standDown: false,
    standDownText: null,
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
      expect(play.destinations.length).toBeGreaterThan(0)
    }

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
      sidesWithoutPlay: [{ side: 'below', reason: 'nothing significant within realistic reach below' }],
    }
    const plan = assembleLlmPlan({ judgment, context: ctx, modelId: 'm' })
    expect(plan.pruned.some((p) => p.label === 'below side' && p.reason.includes('nothing significant'))).toBe(true)
  })

  it('stand-down: the two-way zone play leads (rank 1, primary), the lean is mid-zone, the text is kept', () => {
    const ctx = midZoneContext()
    expect(ctx.location.enclosingZone?.midZone).toBe(true)
    const judgment: LlmPlanJudgment = {
      frame: { referenceId: 'wp', rationale: 'Weekly pivot frames from above.' },
      plays: [
        { bandId: bandOf(ctx, 'jba:0:high'), direction: 'short', text: 'If price reaches JBA 1 high, the upper edge will hold and rotate back down.', rationale: 'Enclosing zone edge above.' },
        { bandId: bandOf(ctx, 'jba:0:low'), direction: 'long', text: 'If price reaches JBA 1 low, the lower edge will hold and rotate back up.', rationale: 'Enclosing zone edge below.' },
      ],
      sidesWithoutPlay: [],
      standDown: true,
      standDownText: 'Mid-zone inside JBA 1 — stand down in the middle, work two-way at the edges.',
      lean: 'Two-way at the JBA edges; lean short below the Weekly Pivot.',
    }
    const plan = assembleLlmPlan({ judgment, context: ctx, modelId: 'm' })
    expect(JobPlanSchema.safeParse(plan).success).toBe(true)
    expect(plan.plays[0]).toMatchObject({ rank: 1, primary: true, stance: 'stand-down', direction: 'two-way' })
    expect(plan.plays).toHaveLength(3)
    expect(plan.lean).toMatchObject({ playId: 'play-1', basis: 'mid-zone', text: judgment.lean })
    expect(plan.standDownReasons).toContain(judgment.standDownText)
  })

  it('a judged direction the geometry contradicts is an assembly error (broken invariant, never persisted)', () => {
    const ctx = context()
    const judgment = cleanJudgment(ctx)
    const flipped: LlmPlanJudgment = { ...judgment, plays: [{ ...judgment.plays[0], direction: 'long' }, judgment.plays[1]] }
    expect(() => assembleLlmPlan({ judgment: flipped, context: ctx, modelId: 'm' })).toThrow(LlmPlanAssemblyError)
  })

  it('stand-down outside a measured mid-zone is a contract violation and an assembly error, never a zero-play ready plan', () => {
    const ctx = context()
    const judgment: LlmPlanJudgment = {
      ...cleanJudgment(ctx),
      plays: [],
      standDown: true,
      standDownText: 'Two-way between the edges.',
    }
    expect(validateJudgment(judgment, ctx).map((v) => v.code)).toContain('stand_down_without_mid_zone')
    expect(() => assembleLlmPlan({ judgment, context: ctx, modelId: 'm' })).toThrow(LlmPlanAssemblyError)
    // And the mid-zone declaration IS legal where R10 measures one.
    const mid = midZoneContext()
    const midJudgment: LlmPlanJudgment = {
      frame: { referenceId: 'wp', rationale: 'Weekly pivot frames from above.' },
      plays: [],
      sidesWithoutPlay: [],
      standDown: true,
      standDownText: 'Mid-zone inside JBA 1 — two-way at the edges.',
      lean: 'Two-way at the JBA edges.',
    }
    expect(validateJudgment(midJudgment, mid).map((v) => v.code)).not.toContain('stand_down_without_mid_zone')
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
      .filter((b) => b.side === side && !b.destinationOnly)
      .sort((a, b) => a.distancePts - b.distancePts)[0]
  const above = nearest('above')
  const below = nearest('below')
  return {
    frame: { referenceId: frame.id, rationale: 'The operative tier-one line within reach.' },
    plays: [
      ...(above ? [{ bandId: above.bandId, direction: 'short' as const, text: `If price reaches ${above.label}, expect the offer and a turn back down.`, rationale: 'Nearest significant area above.' }] : []),
      ...(below ? [{ bandId: below.bandId, direction: 'long' as const, text: `If price reaches ${below.label}, expect the bid and a turn back up.`, rationale: 'Nearest significant area below.' }] : []),
    ],
    sidesWithoutPlay: [
      ...(above ? [] : [{ side: 'above' as const, reason: 'nothing playable above within reach' }]),
      ...(below ? [] : [{ side: 'below' as const, reason: 'nothing playable below within reach' }]),
    ],
    standDown: false,
    standDownText: null,
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
  object: { ...judgmentFor(payloadOf(params.prompt)), frame: { referenceId: 'not-a-reference', rationale: 'x' } },
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
    expect(row.plan.plays.every((p) => p.stance === 'stand-down' || p.llmRationale != null)).toBe(true)
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
    expect((error as LlmPlanContractError).violations.map((v) => v.code)).toContain('frame_unknown_reference')
    expect(isNonRetryableJobPlanError(error)).toBe(false)
    expect(state.judgmentCalls).toHaveLength(2)
    expect(state.inserted).toEqual([])
  })
})
