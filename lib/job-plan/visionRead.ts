import type { VbpProfile } from '@/lib/engine/parseProfile'
import type { ReasoningEffort } from '@/lib/llm/reasoning'
import { sha256Hex } from './fingerprint'
import { identifyProfileNodes, type VisionGenerate } from './profile-vision/identifyProfileNodes'
import type { Instrument } from './profile-vision/instrument'
import { rasterizePng } from './profile-vision/rasterize'
import type { ProfileKey, ProfileNodes } from './profile-vision/types'

/**
 * The vision read inside the job-plan run (feat-128 step 3): render both
 * bundle profiles (balance-area + 400-pt rotation, feat-142), run feat-123's
 * `identifyProfileNodes` with the model /
 * effort / samples from feat-124's config, upload the PNGs it looked at to
 * `job-plan-images` keyed by hash, and summarize cost / usage / agreement for
 * run metadata.
 *
 * R14: a NULL `profile_vision_model_id` means the read is OFF —
 * `profileNodes = null` plus a `profile_nodes_unavailable` warning; the plan
 * is still produced. A partial read (a profile with too few successful
 * samples) is the same warning per profile, from `identifyProfileNodes`.
 * Image upload failures are warnings, never failures: the PNGs are for
 * operator grading and the card overlay, not planner inputs.
 */

export { JOB_PLAN_IMAGES_BUCKET } from './jobPlanImages'

export const VISION_OFF_WARNING =
  'profile_nodes_unavailable: the profile vision read is OFF (config.profile_vision_model_id is NULL) — plan produced without balance-area / 400-pt rotation profile nodes (R14)'

/** The `config` columns the vision read consumes (feat-124). */
export type JobPlanConfig = {
  readonly profile_vision_model_id: string | null
  readonly profile_vision_model_effort: ReasoningEffort | null
  readonly profile_vision_samples: number
}

export type VisionUsage = {
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly totalTokens: number | null
}

/** feat-123's `VisionGenerate`, plus optional token usage for run metadata. */
export type JobPlanVisionGenerate = (
  params: Parameters<VisionGenerate>[0]
) => Promise<Awaited<ReturnType<VisionGenerate>> & { readonly usage?: VisionUsage }>

export type ProfileAgreement = {
  readonly successfulSamples: number
  readonly samples: number
  readonly nodes: number
  /** Mean of each consensus node's agreement / samples; null with no nodes. */
  readonly meanAgreement: number | null
}

export type VisionSummary = {
  readonly modelId: string
  readonly effort: ReasoningEffort | null
  readonly samples: number
  readonly calls: number
  readonly successfulCalls: number
  readonly costUsd: number | null
  readonly latencyMs: number
  readonly usage: VisionUsage
  readonly agreement: Readonly<Partial<Record<ProfileKey, ProfileAgreement>>>
}

export type VisionReadResult = {
  readonly profileNodes: ProfileNodes | null
  readonly summary: VisionSummary | null
  /** Every rendered tile hash the read looked at (fingerprint input). */
  readonly imageHashes: readonly string[]
  readonly warnings: readonly string[]
}

export type VisionReadInput = {
  readonly config: JobPlanConfig
  readonly instrument: Instrument
  readonly currentPrice: number | null
  readonly profiles: Readonly<Partial<Record<ProfileKey, VbpProfile>>>
  readonly generate: JobPlanVisionGenerate
  /** Store one PNG under `<sha256>.png` in `job-plan-images`. */
  readonly uploadImage: (path: string, png: Uint8Array) => Promise<void>
  /** Test overrides. */
  readonly rasterize?: (svg: string) => Uint8Array
  /**
   * Absolute wall-clock deadline (epoch ms) for the vision read. Forwarded to
   * `identifyProfileNodes` so a slow provider cannot eat the whole
   * `job-plan-task` budget and get the run killed before the R14 degraded plan
   * is persisted (feat-131). Supplied by the TASK, which owns its own budget;
   * absent for standalone callers like the bench.
   */
  readonly deadlineAt?: number
}

const NO_USAGE: VisionUsage = { inputTokens: null, outputTokens: null, totalTokens: null }

const addNullable = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0)

function addUsage(a: VisionUsage, b: VisionUsage | undefined): VisionUsage {
  if (!b) return a
  return {
    inputTokens: addNullable(a.inputTokens, b.inputTokens),
    outputTokens: addNullable(a.outputTokens, b.outputTokens),
    totalTokens: addNullable(a.totalTokens, b.totalTokens),
  }
}

function agreementOf(nodes: ProfileNodes): Partial<Record<ProfileKey, ProfileAgreement>> {
  return Object.fromEntries(
    Object.entries(nodes.profiles).map(([key, entry]) => {
      const consensus = entry.consensus
      const ratios = consensus?.nodes.map((n) => n.agreement / n.samples) ?? []
      return [
        key,
        {
          successfulSamples: consensus?.successfulSamples ?? 0,
          samples: nodes.samples,
          nodes: ratios.length,
          meanAgreement:
            ratios.length === 0 ? null : ratios.reduce((s, r) => s + r, 0) / ratios.length,
        },
      ]
    })
  )
}

function summarize(nodes: ProfileNodes, usage: VisionUsage): VisionSummary {
  const raw = Object.values(nodes.profiles).flatMap((entry) => entry.raw)
  return {
    modelId: nodes.modelId,
    effort: nodes.effort,
    samples: nodes.samples,
    calls: raw.length,
    successfulCalls: raw.filter((r) => r.ok).length,
    costUsd: raw.reduce<number | null>((sum, r) => addNullable(sum, r.cost), null),
    latencyMs: raw.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0),
    usage,
    agreement: agreementOf(nodes),
  }
}

/** Upload every tile the read looked at; a failed upload is a warning, not a failure. */
async function uploadImages(
  hashes: readonly string[],
  captured: ReadonlyMap<string, Uint8Array>,
  uploadImage: VisionReadInput['uploadImage']
): Promise<string[]> {
  const warnings: string[] = []
  for (const hash of hashes) {
    const png = captured.get(hash)
    if (!png) {
      warnings.push(`image_upload_failed:${hash}: no rasterized PNG captured for this tile`)
      continue
    }
    try {
      await uploadImage(`${hash}.png`, png)
    } catch (error) {
      warnings.push(
        `image_upload_failed:${hash}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return warnings
}

export async function readProfileNodes(input: VisionReadInput): Promise<VisionReadResult> {
  const modelId = input.config.profile_vision_model_id
  if (modelId === null || modelId.trim().length === 0) {
    return { profileNodes: null, summary: null, imageHashes: [], warnings: [VISION_OFF_WARNING] }
  }

  // Capture each rendered tile's PNG by the SVG hash `identifyProfileNodes` reports.
  const captured = new Map<string, Uint8Array>()
  const raster = input.rasterize ?? rasterizePng
  const rasterize = (svg: string): Uint8Array => {
    const png = raster(svg)
    captured.set(sha256Hex(svg), png)
    return png
  }
  let usage = NO_USAGE
  const generate: VisionGenerate = async (params) => {
    const result = await input.generate(params)
    usage = addUsage(usage, result.usage)
    return result
  }

  const profileNodes = await identifyProfileNodes({
    instrument: input.instrument,
    currentPrice: input.currentPrice,
    profiles: input.profiles,
    samples: input.config.profile_vision_samples,
    modelId,
    effort: input.config.profile_vision_model_effort,
    generate,
    rasterize,
    ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
    telemetry: { functionId: 'job-plan-task' },
  })

  const imageHashes = Object.values(profileNodes.profiles).flatMap((entry) => entry.imageHashes)
  const uploadWarnings = await uploadImages(imageHashes, captured, input.uploadImage)
  return {
    profileNodes,
    summary: summarize(profileNodes, usage),
    imageHashes,
    warnings: [...profileNodes.warnings, ...uploadWarnings],
  }
}
