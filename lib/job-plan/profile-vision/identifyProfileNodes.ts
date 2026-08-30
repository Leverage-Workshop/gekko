import type { z } from 'zod'
import type { VbpProfile } from '@/lib/engine/parseProfile'
import type { ChartImage } from '@/lib/llm/generateStructured'
import type { ReasoningEffort } from '@/lib/llm/reasoning'
import type { TelemetryOptions } from '@/lib/observability'
import { buildConsensus, type SuccessfulRead } from './consensus'
import type { Instrument } from './instrument'
import {
  buildVisionPrompt,
  FEW_SHOT_SOURCE,
  loadFewShot,
  VISION_PROMPT_REVISION,
  type FewShotExample,
} from './prompt'
import { toPriceRead } from './normalized'
import { rasterizePng } from './rasterize'
import {
  renderProfile,
  type RenderedTile,
  type RenderMeta,
  type RenderOptions,
  type TileSpan,
} from './renderProfile'
import {
  profileNodesReadNormalizedSchema,
  profileNodesReadSchema,
  type ProfileNodesRead,
  type ProfileNodesReadNormalized,
} from './schema'
import {
  PROFILE_KEYS,
  PROFILE_NAMES,
  type ProfileKey,
  type ProfileNodes,
  type ProfileNodesEntry,
  type RawSample,
} from './types'

/**
 * The vision read (feat-123, docs/job-planning-task-plan.md "Calls,
 * parallelism, consensus"): for profiles P x samples S x tiles T, render,
 * rasterize, call the model through an INJECTED `generate`, tolerate partial
 * failure, and reduce each profile's reads to a consensus. NOT wired to any
 * task yet — feat-128 does that; feat-124's bench drives it directly.
 *
 * Model id and effort are parameters: never hardcoded, the caller supplies
 * them from `config` (feat-124 adds the columns).
 *
 * THE CONVERSION BOUNDARY (feat-135). With the axis-free render variant
 * (`render.axis === false`) the model answers in normalized vertical positions
 * rather than prices, because the image it was shown has no axis to read. That
 * form gets exactly this far: `runCall` validates the read against the
 * axis-free schema and converts it to prices against the span its own image
 * covers, so `RawSample.read`, consensus, the bench scorer, the planner and the
 * persisted `job_plans.profile_nodes` all keep seeing prices and none of them
 * knows the variant existed.
 */

export const DEFAULT_CONCURRENCY = 6
/**
 * Per-sample budget for one vision call.
 *
 * Raised from 60s (feat-131): the first live runs showed reasoning models take
 * 30-60s on a single 900x1400 profile at their default effort — `gpt-5.6-sol`
 * averaged ~41s and `claude-sonnet-5` blew the 60s budget outright, which the
 * bench then reported as a failed read when the model was merely slow. Samples
 * run concurrently, so this is wall-clock per call, not per profile.
 */
export const DEFAULT_TIMEOUT_MS = 180_000

/**
 * How long after `job-plan-task` STARTS the vision read must be finished.
 *
 * Measured from task start, not from when the read begins, because the task
 * spends an unknown slice of its budget in `waitForFreshBundle` first (up to
 * WAIT_TIMEOUT_MS). An "N seconds from now" budget set before that wait would
 * be eaten by a slow bundle and report `deadline exceeded` on every call while
 * the task still had minutes left.
 *
 * `maxDuration` is 300s; this leaves 60s after the read for image uploads, plan
 * build and persistence, so a slow provider cannot get the run killed by
 * trigger.dev before the R14 degraded plan is written - which would lose the
 * plan AND re-bill every call on the retry. The TASK owns this deadline and
 * passes it in; the planner modules stay clock-free.
 */
export const VISION_READ_DEADLINE_FROM_TASK_START_MS = 240_000

/**
 * What one vision call returns: a PRICE read from an axis variant, or a
 * NORMALIZED one from the axis-free variant. Which is asked for is decided by
 * the `schema` this module passes in, and the caller only has to hand back what
 * that schema produced.
 */
export type VisionCallOutput = ProfileNodesRead | ProfileNodesReadNormalized

/** The slice of `generateStructured` this module needs — injectable so tests never call a model. */
export type VisionGenerate = (params: {
  readonly model: string
  readonly effort: ReasoningEffort | null
  /** The wire schema for THIS call — price or normalized. Use it; do not substitute one. */
  readonly schema: z.ZodType<VisionCallOutput>
  readonly prompt: string
  readonly images: readonly ChartImage[]
  /** Aborted at the per-call timeout — a real `generate` MUST honour it (generateStructured does). */
  readonly abortSignal: AbortSignal
  readonly telemetry?: TelemetryOptions
}) => Promise<{
  readonly object: VisionCallOutput
  readonly cost: number | null
  readonly latencyMs: number
}>

export type IdentifyProfileNodesInput = {
  readonly instrument: Instrument
  readonly currentPrice: number | null
  /** The profiles to read; a key absent here is simply not read. */
  readonly profiles: Readonly<Partial<Record<ProfileKey, VbpProfile>>>
  /** The render variant (bake-off preset) — applied to the few-shot examples too. */
  readonly render?: Omit<RenderOptions, 'instrument' | 'currentPrice'>
  /** Samples per image (config.profile_vision_samples). */
  readonly samples: number
  readonly modelId: string
  readonly effort: ReasoningEffort | null
  readonly generate: VisionGenerate
  /** Defaults to loadFewShot() from knowledge/job-plan/few-shot. */
  readonly fewShot?: readonly FewShotExample[]
  /** Defaults to rasterizePng. */
  readonly rasterize?: (svg: string) => Uint8Array
  readonly concurrency?: number
  readonly timeoutMs?: number
  /**
   * Absolute wall-clock deadline (epoch ms) for the WHOLE read, when the caller
   * runs inside a bounded task.
   *
   * Calls share a concurrency cap, so the read can span several waves and its
   * total time is NOT bounded by `timeoutMs`. `job-plan-task` has
   * `maxDuration: 300` and may already have spent WAIT_TIMEOUT_MS (120s) waiting
   * for a fresh bundle, so an unbounded read can be killed by trigger.dev before
   * the R14 degraded plan is persisted - losing the plan and re-billing the calls
   * on retry. Each call's timeout becomes `min(timeoutMs, time remaining)`, and
   * once the deadline passes the remaining calls fail immediately rather than
   * starting paid work that cannot finish (feat-131).
   */
  readonly deadlineAt?: number
  /** Injectable clock for the deadline arithmetic; defaults to Date.now. */
  readonly now?: () => number
  readonly telemetry?: TelemetryOptions
}

type Call = {
  readonly key: ProfileKey
  readonly sample: number
  readonly tile: TileSpan
  readonly imageSha256: string
  readonly prompt: string
  readonly images: readonly ChartImage[]
  /** The image has no price axis: the answer comes back as fractions (feat-135). */
  readonly axisFree: boolean
}

function toBase64(png: Uint8Array): string {
  return Buffer.from(png).toString('base64')
}

/** Run `tasks` with at most `cap` in flight; results keep task order. */
export async function runWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  cap: number
): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(cap, tasks.length)) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Reject after `ms` AND abort the controller so the provider request is
 * cancelled: the concurrency slot is released at the timeout, so without the
 * abort a slow provider would keep arbitrarily many requests (and their cost)
 * alive beyond the cap.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort(new Error(`timed out after ${ms} ms`))
      reject(new Error(`timed out after ${ms} ms`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    )
  })
}

type RenderedFewShot = {
  readonly example: FewShotExample
  readonly meta: RenderMeta
  readonly tile: TileSpan
  readonly image: ChartImage
}

/** Few-shot images are rendered with the same variant as the target, always as one tile. */
function renderFewShot(
  fewShot: readonly FewShotExample[],
  render: IdentifyProfileNodesInput['render'],
  rasterize: (svg: string) => Uint8Array
): RenderedFewShot[] {
  return fewShot.map((example) => {
    const { tiles, meta } = renderProfile(example.profile, {
      ...render,
      instrument: example.instrument,
      currentPrice: null,
      tiles: 1,
    })
    const [tile] = tiles
    return { example, meta, tile: tile.tile, image: { base64: toBase64(rasterize(tile.svg)) } }
  })
}

function buildCalls(
  key: ProfileKey,
  instrument: Instrument,
  tiles: readonly RenderedTile[],
  meta: RenderMeta,
  samples: number,
  fewShot: readonly RenderedFewShot[],
  rasterize: (svg: string) => Uint8Array
): Call[] {
  const names = PROFILE_NAMES[key]
  return tiles.flatMap((rendered) => {
    const image: ChartImage = { base64: toBase64(rasterize(rendered.svg)) }
    const prompt = buildVisionPrompt(
      { instrument, profileName: names.name, lookback: names.lookback, meta, tile: rendered.tile },
      fewShot.map((f) => ({ example: f.example, meta: f.meta, tile: f.tile }))
    )
    const images = [...fewShot.map((f) => f.image), image]
    return Array.from({ length: samples }, (_, sample) => ({
      key,
      sample,
      tile: rendered.tile,
      imageSha256: rendered.sha256,
      prompt,
      images,
      axisFree: !meta.axis,
    }))
  })
}

/**
 * THE CONVERSION BOUNDARY. Validate what came back against the schema the call
 * asked for, and — for an axis-free call — turn its fractions into prices using
 * the span of the very image the model was shown (the TILE's span, not the
 * profile's, so a tiled axis-free render converts against the right window).
 *
 * A read that fails here throws inside `runCall`'s try, so it is recorded as a
 * failed sample with the validation error rather than smuggled downstream:
 * `superRefine` rules are not expressible in JSON Schema, so no provider is
 * actually constrained by them.
 */
function readToPrices(object: VisionCallOutput, call: Call): ProfileNodesRead {
  if (!call.axisFree) return profileNodesReadSchema.parse(object)
  return toPriceRead(profileNodesReadNormalizedSchema.parse(object), call.tile)
}

async function runCall(call: Call, input: IdentifyProfileNodesInput): Promise<RawSample> {
  const base = { sample: call.sample, tile: call.tile.index, imageSha256: call.imageSha256 }
  const controller = new AbortController()
  const budget = effectiveTimeoutMs(input)
  if (budget <= 0) {
    return {
      ...base,
      ok: false,
      read: null,
      error: 'deadline exceeded before the call started',
      latencyMs: null,
      cost: null,
    }
  }
  try {
    const result = await withTimeout(
      input.generate({
        model: input.modelId,
        effort: input.effort,
        schema: call.axisFree ? profileNodesReadNormalizedSchema : profileNodesReadSchema,
        prompt: call.prompt,
        images: call.images,
        abortSignal: controller.signal,
        ...(input.telemetry ? { telemetry: input.telemetry } : {}),
      }),
      budget,
      controller
    )
    return {
      ...base,
      ok: true,
      read: readToPrices(result.object, call),
      error: null,
      latencyMs: result.latencyMs,
      cost: result.cost,
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      read: null,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: null,
      cost: null,
    }
  }
}

/**
 * Budget for the next call: the per-call ceiling clamped to whatever is left of
 * the caller's overall deadline. <= 0 means the deadline already passed, which
 * the caller turns into an immediate failed sample rather than a paid request
 * that cannot complete.
 */
export function effectiveTimeoutMs(input: {
  readonly timeoutMs?: number
  readonly deadlineAt?: number
  readonly now?: () => number
}): number {
  const perCall = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (input.deadlineAt === undefined) return perCall
  return Math.min(perCall, input.deadlineAt - (input.now ?? Date.now)())
}

function entryFor(
  key: ProfileKey,
  input: IdentifyProfileNodesInput,
  rendered: { tiles: readonly RenderedTile[]; meta: RenderMeta },
  raw: readonly RawSample[]
): ProfileNodesEntry {
  const reads: SuccessfulRead[] = raw.flatMap((r) =>
    r.ok && r.read ? [{ sample: r.sample, tile: r.tile, read: r.read }] : []
  )
  const consensus = buildConsensus({
    instrument: input.instrument,
    grid: {
      step: rendered.meta.step,
      priceLow: rendered.meta.priceLow,
      priceHigh: rendered.meta.priceHigh,
    },
    samples: input.samples,
    tiles: rendered.tiles.map((t) => t.tile),
    reads,
  })
  return {
    consensus,
    raw,
    imageHashes: rendered.tiles.map((t) => t.sha256),
    render: rendered.meta,
  }
}

function validateInput(input: IdentifyProfileNodesInput): void {
  if (!Number.isInteger(input.samples) || input.samples < 1) {
    throw new Error('identifyProfileNodes: samples must be a positive integer')
  }
  if (input.modelId.trim().length === 0) {
    throw new Error('identifyProfileNodes: modelId is required')
  }
}

/**
 * Read every profile present in `input.profiles`. Never throws on a model
 * failure: each call's outcome lands in `raw`, a profile with too few
 * successful samples gets `consensus: null` and a
 * `profile_nodes_unavailable:<key>` warning (R14).
 */
export async function identifyProfileNodes(
  input: IdentifyProfileNodesInput
): Promise<ProfileNodes> {
  validateInput(input)
  const rasterize = input.rasterize ?? rasterizePng
  const fewShot = renderFewShot(input.fewShot ?? loadFewShot(), input.render, rasterize)

  const rendered = PROFILE_KEYS.flatMap((key) => {
    const profile = input.profiles[key]
    if (!profile) return []
    const result = renderProfile(profile, {
      ...input.render,
      instrument: input.instrument,
      currentPrice: input.currentPrice,
    })
    return [{ key, ...result }]
  })

  const calls = rendered.flatMap((r) =>
    buildCalls(r.key, input.instrument, r.tiles, r.meta, input.samples, fewShot, rasterize)
  )
  const outcomes = await runWithConcurrency(
    calls.map((call) => () => runCall(call, input)),
    input.concurrency ?? DEFAULT_CONCURRENCY
  )

  const profiles: Partial<Record<ProfileKey, ProfileNodesEntry>> = {}
  const warnings: string[] = []
  rendered.forEach((r) => {
    const raw = outcomes.filter((_, i) => calls[i].key === r.key)
    const entry = entryFor(r.key, input, r, raw)
    profiles[r.key] = entry
    if (entry.consensus === null) warnings.push(`profile_nodes_unavailable:${r.key}`)
  })

  return {
    instrument: input.instrument,
    modelId: input.modelId,
    effort: input.effort,
    promptRevision: VISION_PROMPT_REVISION,
    fewShotSource: FEW_SHOT_SOURCE,
    samples: input.samples,
    profiles,
    warnings,
  }
}
