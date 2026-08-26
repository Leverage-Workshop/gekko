import { createHash } from 'node:crypto'
import type { PlanMeta } from '@/knowledge/schema/job-plan.schema'

/**
 * Reproducibility fingerprint of a job-plan run (feat-128, plan "Persistence
 * and reproducibility"): sha256 over the EXACT downloaded bytes the run
 * consumed (every source, length-framed, in a fixed order) + PLANNER_REVISION
 * + the rendered profile image hashes + VISION_PROMPT_REVISION + the vision
 * model id. Per-source hashes are stored separately in `plan.meta.sourceHashes`
 * so a later Storage overwrite of one file is attributable.
 *
 * This makes reproducibility AUDITABLE, not guaranteed — behaviour also depends
 * on code discipline around `PLANNER_REVISION` bumps. Pure.
 */

export const JOB_PLAN_SOURCE_KEYS = [
  'jobStudyDaily',
  'jobStudyWeekly',
  'mgi',
  'execBars',
  'htfBars',
  'fiveDayProfile',
  'fourHourProfile',
] as const

export type JobPlanSourceKey = (typeof JOB_PLAN_SOURCE_KEYS)[number]

export type SourceBytes = Readonly<Record<JobPlanSourceKey, Uint8Array>>

export type FingerprintInput = {
  readonly sources: SourceBytes
  readonly plannerRevision: string
  /** Rendered tile hashes the vision read looked at (order-insensitive); empty when the read was off. */
  readonly imageHashes: readonly string[]
  readonly visionPromptRevision: string | null
  readonly visionModelId: string | null
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** One sha256 per source, keyed like `PlanMeta.sourceHashes`. */
export function sourceHashesOf(sources: SourceBytes): PlanMeta['sourceHashes'] {
  return Object.fromEntries(
    JOB_PLAN_SOURCE_KEYS.map((key) => [key, sha256Hex(sources[key])]),
  ) as PlanMeta['sourceHashes']
}

export function computeInputFingerprint(input: FingerprintInput): string {
  const hash = createHash('sha256')
  for (const key of JOB_PLAN_SOURCE_KEYS) {
    const bytes = input.sources[key]
    hash.update(`${key}:${bytes.byteLength}\n`)
    hash.update(bytes)
  }
  hash.update(`planner:${input.plannerRevision}\n`)
  hash.update(`images:${[...input.imageHashes].sort().join(',')}\n`)
  hash.update(`vision-prompt:${input.visionPromptRevision ?? 'none'}\n`)
  hash.update(`vision-model:${input.visionModelId ?? 'off'}\n`)
  return hash.digest('hex')
}
