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
import { rasterizePng } from './rasterize'
import {
  renderProfile,
  type RenderedTile,
  type RenderMeta,
  type RenderOptions,
  type TileSpan,
} from './renderProfile'
import { profileNodesReadSchema, type ProfileNodesRead } from './schema'
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

/** The slice of `generateStructured` this module needs — injectable so tests never call a model. */
export type VisionGenerate = (params: {
  readonly model: string
  readonly effort: ReasoningEffort | null
  readonly schema: z.ZodType<ProfileNodesRead>
  readonly prompt: string
  readonly images: readonly ChartImage[]
  /** Aborted at the per-call timeout — a real `generate` MUST honour it (generateStructured does). */
  readonly abortSignal: AbortSignal
  readonly telemetry?: TelemetryOptions
}) => Promise<{
  readonly object: ProfileNodesRead
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
  readonly telemetry?: TelemetryOptions
}

type Call = {
  readonly key: ProfileKey
  readonly sample: number
  readonly tile: TileSpan
  readonly imageSha256: string
  readonly prompt: string
  readonly images: readonly ChartImage[]
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
    }))
  })
}

async function runCall(call: Call, input: IdentifyProfileNodesInput): Promise<RawSample> {
  const base = { sample: call.sample, tile: call.tile.index, imageSha256: call.imageSha256 }
  const controller = new AbortController()
  try {
    const result = await withTimeout(
      input.generate({
        model: input.modelId,
        effort: input.effort,
        schema: profileNodesReadSchema,
        prompt: call.prompt,
        images: call.images,
        abortSignal: controller.signal,
        ...(input.telemetry ? { telemetry: input.telemetry } : {}),
      }),
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      controller
    )
    return {
      ...base,
      ok: true,
      read: result.object,
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
