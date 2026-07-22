import type { Briefing } from '@/knowledge/schema/briefing.schema'
import type { ChartAttachment, EngineFacts } from '@/lib/analyze'
import { engineZoneBorders } from '@/lib/analyze'
import {
  DISTINCT_ANCHORS_RULE,
  campaignBoundaryRule,
  chartManifest,
  dataEdgeRule,
  factsPayload,
} from '@/lib/analyze/prompt'

/**
 * User-message assembly for the update-task `generateObject` call. Mirrors
 * the analyze prompt (same data-ownership rules, engine facts, raw MGI) but
 * the mission is the Gem's "Update": an Immediate Tactical Read + a fresh
 * Strategic Alignment, produced AGAINST the previous briefing embedded below.
 */

export interface ParentBriefingContext {
  /** The parent's enforced `raw_model_json` (already Briefing-validated). */
  briefing: Briefing
  /** The parent row's `created_at`. */
  createdAt: string
  /** 'morning' | 'update' — labeled so the model knows how stale the inherited context is. */
  kind: string
  ageMinutes: number
}

export interface UpdatePromptInput {
  triggerReason: string
  /** ISO timestamp of this run — becomes `meta.createdAt`. */
  now: string
  facts: EngineFacts
  /** The bundle's raw `mgi_json`, passed through verbatim. */
  rawMgi: unknown
  /** Labels for the attached chart images, in attachment order. */
  charts: readonly ChartAttachment[]
  rrMin: number
  parent: ParentBriefingContext
}

export function buildUpdatePrompt(input: UpdatePromptInput): string {
  const { facts, parent } = input
  const borders = engineZoneBorders(facts.terrain)

  return [
    '# Mission',
    'Produce one `BriefingUpdate` object for the NQ futures session — the doctrine "Update" prompt:',
    '1. `tacticalRead` — three 1-line reads: `location` (current zone + immediate borders above/below), `ripStatus` (e.g. "Holding as support" / "Breached" / "Flipped to resistance"), `initiative` (who has control based on current delta/telemetry).',
    '2. A fresh Strategic Alignment — the exact `primary`, `secondary` and `dangerZones` sections from the Morning Brief format, updated for current realities.',
    'You do NOT output `overview` or `terrain` — they carry forward from the previous briefing below. Keep your objectives consistent with its terrain zone stack unless the fresh engine facts contradict it, and say so in the rationale when they do.',
    '',
    '# Previous briefing (inherited context)',
    `Issued ${parent.createdAt} (${parent.ageMinutes} min ago, kind: ${parent.kind}). Its overview and terrain persist verbatim alongside your update; treat its objectives as the standing plan you are revising.`,
    '```json',
    JSON.stringify(parent.briefing, null, 1),
    '```',
    '',
    '# Data ownership (non-negotiable)',
    'The ENGINE FACTS below are computed deterministically from the exact numeric export data and are authoritative:',
    '- LVN/HVN node prices, the magnet set, MGI tiering, the Rip/Vanguard condition and the terrain zone stack are code-owned. Do NOT adjust, re-derive or contradict them.',
    '- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `balanceArea` (anchored to the current Balance Area, long-term). A node on the balance-area profile is structurally MORE significant than the same node on the rotation profile.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles. They are CANDIDATES ONLY — call absorption only where the execution chart shows price STALLED at the stack; otherwise ignore the candidate.',
    `- The CURRENT engine zone borders are: ${borders.join(', ')}. If these disagree with the previous briefing's terrain, the engine is right — flag the drift in the relevant rationale.`,
    `- \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly from your chosen entry/stop/T1. The R/R gate is ${input.rrMin}:1 — do not propose objectives that cannot clear it.`,
    '- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band and pick entry/stop prices from its member levels. A composite of kind `mgi` is an MGI COMPOSITE EDGE: Tier-1/session levels partitioning a void beyond the anchoring profile\'s data — a valid border band for entries, stops and targets like any other.',
    '- Entries, stops and T1 must sit on engine-supplied structure — a zone border or a `terrain.levels` price — never in the middle of value. Entry priority, stop placement and the T1 -> T2 -> T3 target ladder follow the Objective contract in the system prompt.',
    DISTINCT_ANCHORS_RULE,
    ...[dataEdgeRule(facts)].filter(Boolean),
    ...[campaignBoundaryRule(facts)].filter(Boolean),
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, TPO single prints / poor highs-lows, delta clustering quality, and the doctrine patterns.',
    '',
    '# Meta fields',
    `- meta.createdAt = "${input.now}"`,
    `- meta.triggerReason = "${input.triggerReason}"`,
    `- meta.currentPrice = ${facts.currentPrice}`,
    `- meta.ripStatus = the engine condition ("${facts.ripStatus?.condition ?? 'unknown'}") plus a short read. (tacticalRead.ripStatus is your separate 1-line narrative read.)`,
    '- meta.htfTrend = your HTF trend read from the planning chart.',
    '',
    '# Attached charts',
    chartManifest(input.charts),
    '',
    '# Bundle freshness',
    facts.staleness.isStale
      ? `STALE DATA: this bundle is ${facts.staleness.ageSeconds}s old (budget ${Math.round(facts.staleness.marginMs / 1000)}s). Flag this prominently in tacticalRead.location — never present stale as fresh.`
      : `Bundle is fresh (${facts.staleness.ageSeconds}s old).`,
    '',
    '# Engine facts (authoritative)',
    '```json',
    JSON.stringify(factsPayload(facts), null, 1),
    '```',
    '',
    '# Raw MGI static levels',
    '```json',
    JSON.stringify(input.rawMgi, null, 1),
    '```',
  ].join('\n')
}
