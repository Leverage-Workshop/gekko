import type { PlanStatus } from '@/knowledge/schema/job-plan.schema'
import type { BundleRow } from '@/lib/analyze/loadBundle'
import type { BundleWaitResult } from '@/lib/bundleRequests'
import type { ProfileNodesRead } from '@/lib/job-plan/profile-vision/schema'
import type { LlmPlannerGenerate } from '@/lib/job-plan/llm-planner/runLlmPlanner'
import type { JobPlanConfig, JobPlanDeps, JobPlanInsert } from '@/lib/job-plan/runJobPlan'
import type { JobPlanVisionGenerate } from '@/lib/job-plan/visionRead'
import { BUNDLE_ID, bundleRow, bundleTexts, storageOf, type BundleTexts } from './jobPlanFiles'

/**
 * Fake deps for runJobPlan (feat-128): an in-memory bundle row + object store,
 * a recording upsert, and a vision `generate` that answers from canned reads.
 * Every dep call is journaled in `calls` so tests can assert ORDER (the row is
 * written last) and SCOPE (nothing but these deps is ever touched).
 */

export type FakeState = {
  readonly calls: string[]
  readonly inserted: JobPlanInsert[]
  readonly uploads: Map<string, Uint8Array>
  readonly generateCalls: { prompt: string; model: string }[]
  /** LLM planner judgment calls (feat-145). */
  readonly judgmentCalls: { prompt: string; model: string }[]
  fetchedById: string[]
  latestFetches: number
  existing: { id: string; status: PlanStatus } | null
}

export type FakeOptions = {
  readonly row?: BundleRow | null
  readonly texts?: Partial<BundleTexts>
  readonly config?: JobPlanConfig | null
  readonly wait?: BundleWaitResult
  readonly existing?: { id: string; status: PlanStatus } | null
  readonly generate?: JobPlanVisionGenerate
  readonly generateJudgment?: LlmPlannerGenerate
  readonly uploadImage?: JobPlanDeps['uploadImage']
  /** Status the fake database reports AFTER the upsert (simulates the keep-ready trigger). */
  readonly persistedStatus?: PlanStatus
}

export const VISION_OFF: JobPlanConfig = {
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: 3,
  model_id: 'test/planner-model',
  model_effort: null,
}

export const VISION_ON: JobPlanConfig = {
  profile_vision_model_id: 'test/vision-model',
  profile_vision_model_effort: 'low',
  profile_vision_samples: 3,
  model_id: 'test/planner-model',
  model_effort: null,
}

/** A cheap stand-in rasterizer: the PNG bytes are irrelevant to the orchestration under test. */
export const fakeRasterize = (svg: string) => new Uint8Array(Buffer.from(svg.slice(0, 32)))

/** Reads inside each real profile's span (balance 28910–30554, rotation 28910–30072). */
export function balanceAreaRead(): ProfileNodesRead {
  return {
    nodes: [
      { kind: 'lvn', priceLow: 29400, priceHigh: 29404, prominence: 1, primary: true, position: 'mid', edgeBelow: 'taper', edgeAbove: 'flat', rationale: 'deepest' },
      { kind: 'hvn', priceLow: 29590, priceHigh: 29606, prominence: 1, primary: false, position: 'upper', edgeBelow: 'none', edgeAbove: 'none', rationale: 'poc' },
    ],
    thinZones: [],
  }
}

export function rotationRead(): ProfileNodesRead {
  return {
    nodes: [
      { kind: 'lvn', priceLow: 29330, priceHigh: 29334, prominence: 1, primary: true, position: 'lower', edgeBelow: 'taper', edgeAbove: 'flat', rationale: 'thin' },
      { kind: 'hvn', priceLow: 29360, priceHigh: 29370, prominence: 1, primary: false, position: 'mid', edgeBelow: 'none', edgeAbove: 'none', rationale: 'poc' },
    ],
    thinZones: [],
  }
}

const isRotation = (prompt: string) => prompt.includes('400-point rotation')

/** Answers every call with the matching canned read (plus a token count for the usage roll-up). */
export const cannedGenerate: JobPlanVisionGenerate = async (params) => ({
  object: isRotation(params.prompt) ? rotationRead() : balanceAreaRead(),
  cost: 0.01,
  latencyMs: 5,
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
})

/** The rotation profile's calls all fail; the balance-area read succeeds (R14 partial path). */
export const partialGenerate: JobPlanVisionGenerate = async (params) => {
  if (isRotation(params.prompt)) throw new Error('provider 503')
  return cannedGenerate(params)
}

export function fakeJobPlanDeps(options: FakeOptions = {}): { deps: JobPlanDeps; state: FakeState } {
  const row = options.row === undefined ? bundleRow() : options.row
  const storage = storageOf(bundleTexts(options.texts))
  const state: FakeState = {
    calls: [],
    inserted: [],
    uploads: new Map(),
    generateCalls: [],
    judgmentCalls: [],
    fetchedById: [],
    latestFetches: 0,
    existing: options.existing ?? null,
  }
  const config = options.config === undefined ? VISION_OFF : options.config
  const generate = options.generate ?? cannedGenerate

  const target: JobPlanDeps = {
    waitForBundle: async () => options.wait ?? { outcome: 'fulfilled', bundleId: BUNDLE_ID },
    fetchBundleById: async (id) => {
      state.fetchedById.push(id)
      return row !== null && row.id === id ? row : null
    },
    fetchLatestBundle: async () => {
      state.latestFetches += 1
      return row
    },
    downloadObject: async (_bucket, path) => {
      const text = storage.get(path)
      if (text === undefined) throw new Error(`fake storage: no object at ${path}`)
      return new TextEncoder().encode(text)
    },
    uploadImage:
      options.uploadImage ??
      (async (path, png) => {
        state.uploads.set(path, png)
      }),
    fetchConfig: async () => config,
    fetchJobPlanByRunId: async () => state.existing,
    insertJobPlan: async (insert) => {
      state.inserted.push(insert)
      return { id: `plan-${state.inserted.length}`, status: options.persistedStatus ?? insert.status }
    },
    generate: async (params) => {
      state.generateCalls.push({ prompt: params.prompt, model: params.model })
      return generate(params)
    },
    generateJudgment: (async (params: { prompt: string; model: string }) => {
      state.judgmentCalls.push({ prompt: params.prompt, model: params.model })
      if (!options.generateJudgment) throw new Error('fake generateJudgment: no judgment stub provided')
      return (options.generateJudgment as (p: unknown) => unknown)(params)
    }) as LlmPlannerGenerate,
    rasterize: fakeRasterize,
  }

  // Journal every dep the shell reaches for — the scope assertion reads this.
  const deps = new Proxy(target, {
    get(obj, prop: string | symbol) {
      if (typeof prop === 'string') state.calls.push(prop)
      return obj[prop as keyof JobPlanDeps]
    },
  })
  return { deps, state }
}
