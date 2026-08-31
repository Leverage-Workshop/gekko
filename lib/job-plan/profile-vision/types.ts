import type { ReasoningEffort } from '@/lib/llm/reasoning'
import type { Instrument } from './instrument'
import type { RenderMeta } from './renderProfile'
import type { NodeKind, NodePosition, NodeEdge, ProfileNodesRead, } from './schema'

/**
 * Shapes the vision read produces and the job-plan task (feat-128) persists
 * verbatim in `job_plans.profile_nodes`: the consensus per profile PLUS every
 * raw sample, the model/effort that produced them, the prompt revision and the
 * image hashes — so a persisted read can be replayed through the planner
 * deterministically even though the read itself cannot be.
 */

/** The profiles the planner reads (docs/job-planning-task-plan.md, "Calls, parallelism, consensus"). */
export const PROFILE_KEYS = ['5d', '4h'] as const
export type ProfileKey = (typeof PROFILE_KEYS)[number]

/** Human names the prompt uses for each profile key. */
export const PROFILE_NAMES: Readonly<Record<ProfileKey, { name: string; lookback: string }>> = {
  '5d': { name: '5-day rolling volume profile', lookback: 'the last five trading sessions' },
  '4h': { name: '4-hour rolling volume profile', lookback: 'the last four hours' },
}

/** One vision call's outcome: which sample + tile it was, and the read or the failure. */
export type RawSample = {
  readonly sample: number
  readonly tile: number
  readonly imageSha256: string
  readonly ok: boolean
  readonly read: ProfileNodesRead | null
  readonly error: string | null
  readonly latencyMs: number | null
  readonly cost: number | null
}

/** A node after consensus: median band, best prominence, majority labels, and how many samples agreed. */
export type ConsensusNode = {
  readonly kind: NodeKind
  readonly priceLow: number
  readonly priceHigh: number
  readonly prominence: number
  readonly primary: boolean
  readonly position: NodePosition
  readonly edgeBelow: NodeEdge
  readonly edgeAbove: NodeEdge
  /** Samples (out of `samples`) that reported this node. */
  readonly agreement: number
  readonly samples: number
}

export type ConsensusThinZone = {
  readonly low: number
  readonly high: number
  readonly agreement: number
  readonly samples: number
}

export type ProfileConsensus = {
  readonly nodes: readonly ConsensusNode[]
  readonly thinZones: readonly ConsensusThinZone[]
  /** Successful samples the consensus was built from. */
  readonly successfulSamples: number
  readonly samples: number
}

/** Per-profile output: consensus (null when fewer than ceil(S/2) samples succeeded — R14) plus provenance. */
export type ProfileNodesEntry = {
  readonly consensus: ProfileConsensus | null
  readonly raw: readonly RawSample[]
  readonly imageHashes: readonly string[]
  readonly render: RenderMeta
}

export type ProfileNodes = {
  readonly instrument: Instrument
  readonly modelId: string
  readonly effort: ReasoningEffort | null
  readonly promptRevision: string
  readonly fewShotSource: string
  readonly samples: number
  readonly profiles: Readonly<Partial<Record<ProfileKey, ProfileNodesEntry>>>
  /** `profile_nodes_unavailable:<key>` per profile that produced no consensus (R14). */
  readonly warnings: readonly string[]
}
