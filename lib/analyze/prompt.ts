import type { EngineFacts } from './engineFacts'
import { engineZoneBorders } from './engineFacts'
import {
  MIN_ENTRY_STANDOFF_PTS,
  MIN_OBJECTIVE_ENTRY_SEPARATION_PTS,
} from './validateBriefing'

/**
 * User-message assembly for the analyze-task `generateObject` call. All
 * volatile per-run data lives here (never in the cached system prefix):
 * engine facts, raw MGI JSON, staleness, current time, chart labels.
 */

export interface ChartAttachment {
  /** Human label matching the attachment order, e.g. "HTF planning chart". */
  label: string
}

export interface AnalysisPromptInput {
  triggerReason: string
  /** ISO timestamp of this run — becomes `meta.createdAt`. */
  now: string
  facts: EngineFacts
  /** The bundle's raw `mgi_json`, passed through verbatim. */
  rawMgi: unknown
  /** Labels for the attached chart images, in attachment order. */
  charts: readonly ChartAttachment[]
  rrMin: number
}

/** Shared with the update-task prompt (lib/update/prompt.ts). */
export function chartManifest(charts: readonly ChartAttachment[]): string {
  if (charts.length === 0) {
    return 'No chart screenshots are attached to this run — rely on the engine facts alone and say so in the overview.'
  }
  return charts
    .map((chart, i) => `Image ${i + 1}: ${chart.label}`)
    .join('\n')
}

/**
 * Compact, model-facing projection of the engine facts (no bulky raw rows).
 * Shared with the update-task prompt (lib/update/prompt.ts).
 */
export function factsPayload(facts: EngineFacts): Record<string, unknown> {
  return {
    currentPrice: facts.currentPrice,
    staleness: facts.staleness,
    deltaTelemetry: facts.deltaTelemetry,
    ripStatus: facts.ripStatus,
    profileSummary: facts.profileSummary,
    lvnHvnNodes: facts.lvn,
    absorptionCandidates: facts.absorption.candidates,
    magnetCheck: facts.magnetCheck,
    mgiPriority: {
      levels: facts.mgi.levels,
      tier1: facts.mgi.tier1,
      dailyPrioritySort: facts.mgi.dailyPrioritySort,
      nearestTier1Above: facts.mgi.nearestTier1Above,
      nearestTier1Below: facts.mgi.nearestTier1Below,
    },
    terrain: facts.terrain,
    warnings: facts.warnings,
  }
}

/**
 * Data-edge prohibition (feat-040 G2): when the zone stack carries a profile data-edge border
 * (the anchoring profile's first/last bin, bookkeeping an unsplit extension void), the model
 * must know it is a data artifact and never trade it. Empty string when there are none.
 * Shared with the update-task prompt (lib/update/prompt.ts).
 */
export function dataEdgeRule(facts: EngineFacts): string {
  const edges = facts.terrain.dataEdges
  if (edges.length === 0) return ''
  return `- DATA-EDGE border(s) at ${edges.join(', ')}: these mark the EDGE of the anchoring profile's data (e.g. the session low), NOT market structure. NEVER anchor an entry, stop or target there, and never narrate them as acceptance/rejection levels.`
}

/**
 * Distinct-anchors rule (2026-07-20, the same-level straddle fix). Kept in the
 * user message because it carries the live validation threshold; the rest of
 * the entry/stop/ladder doctrine (single entry, entry priority, stop
 * placement, T1→T2→T3 — feat-041/042, single-entry 2026-07-18) lives in the
 * cached prefix (knowledge/system/output-objective.md). Shared with the
 * update-task prompt.
 */
export const DISTINCT_ANCHORS_RULE = `- DISTINCT ANCHORS (required): the primary and secondary objectives MUST anchor at DIFFERENT structural borders, at least ${MIN_OBJECTIVE_ENTRY_SEPARATION_PTS} pts apart — validation rejects the briefing otherwise. A same-level opposite-direction straddle ("short the reoffer / long the hold" at one border) is ONE undecided scenario, not two objectives. The counter-scenario anchors at the structure defining ITS OWN trade — the floor cluster below for a fade long, the failed ceiling overhead for a counter short — with its entry trigger expressing the reclaim/failure that activates it.`

/**
 * Entry-standoff + contested-border rule (2026-07-20 operator decisions), ANALYZE-ONLY —
 * deliberately not shared with the update-task prompt: an update revises a standing plan,
 * and price approaching its planned entry is the trade working, not a defect. The hard
 * floor mirrors `enforceEntryStandoff` in validateBriefing.ts (relaxed 15 → 1 pt same
 * day). Contested-border doctrine: a border price is currently fighting at IS the entry
 * anchor when it is significant structure and the fight is sustained — the operator
 * reversed the earlier always-defer-to-the-next-border guidance.
 */
export function entryStandoffRule(facts: EngineFacts): string {
  return `- ENTRY STANDOFF (required): current price is ${facts.currentPrice} and every entry must sit at least ${MIN_ENTRY_STANDOFF_PTS} pts away from it — validation rejects the briefing otherwise. CONTESTED BORDER: when price is trading at or around a structural border right now, PREFER anchoring Entry A at that contested border when BOTH hold: (1) it is significant structure — a Tier-1 campaign border, a composite border band, or balance-area-profile structure, not a lone minor level — and (2) the execution chart shows price has been FIGHTING there for a while: multiple bars of two-sided trade stalling at the level, repeated tests, or an absorption stack building — not a first touch or a clean traversal. Absent that sustained fight (or at a minor level), anchor at the NEXT structural border in the entry's direction instead. If the contested border price itself sits inside the ${MIN_ENTRY_STANDOFF_PTS}-pt floor of current price, anchor the entry on the band member on the entry side that clears the floor.`
}

/**
 * A Tier-1 border within half a rotation (~the half-rotation delta anchor, 35–75 pts) is
 * "in contact range" for the Campaign Boundary Override — a flush into the floor cluster
 * typically snapshots 20–50 pts off the extreme (2026-07-18: price 29605 vs VRange −2 29565).
 */
const CAMPAIGN_BOUNDARY_PROXIMITY_PTS = 50

/**
 * Campaign Boundary Override check (feat-040 G4): when current price sits in contact range of
 * a Tier-1 campaign border, tell the model to explicitly evaluate the override (doctrine: an
 * extended move INTO a Tier-1 border with exhaustion / a failed-breakout or flush-reload
 * pattern shifts the Primary Objective to the structural reversal). Empty string otherwise.
 * Shared with the update-task prompt.
 */
export function campaignBoundaryRule(facts: EngineFacts): string {
  const { nearestTier1Above, nearestTier1Below } = facts.mgi
  const near = [nearestTier1Above, nearestTier1Below]
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .filter(n => n.distance <= CAMPAIGN_BOUNDARY_PROXIMITY_PTS)
    .sort((a, b) => a.distance - b.distance)[0]
  if (!near) return ''
  return `- CAMPAIGN BOUNDARY CHECK (required): current price ${facts.currentPrice} is ${near.distance} pts from the Tier-1 border ${near.level.label} ${near.level.price}. Explicitly evaluate the Campaign Boundary Override: an extended move INTO a Tier-1 campaign border showing exhaustion, a failed-breakout trap or a controlled flush-and-reload shifts the Primary Objective to the structural reversal. State in the primary rationale whether the override applies and why.`
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const { facts } = input
  const borders = engineZoneBorders(facts.terrain)

  return [
    '# Mission',
    'Produce one `Briefing` object for the NQ futures session, per the doctrine in the system prompt.',
    '',
    '# Data ownership (non-negotiable)',
    'The ENGINE FACTS below are computed deterministically from the exact numeric export data and are authoritative:',
    '- LVN/HVN node prices, the magnet set, MGI tiering, the Rip/Vanguard condition and the terrain zone stack are code-owned. Do NOT adjust, re-derive or contradict them.',
    '- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `balanceArea` (anchored to the current Balance Area — defined in the Chart Reading doctrine, long-term). A node on the balance-area profile is structurally MORE significant than the same node on the rotation profile. The terrain zone stack is anchored to the rotation profile; the magnet set (magnetCheck and the terrain magnet verdicts) is anchored to the balance-area profile.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles. They are CANDIDATES ONLY — a stack by itself means nothing. Call absorption only where the execution chart shows price STALLED at the stack; otherwise ignore the candidate.',
    `- \`terrain.zones\` in your output MUST reproduce the engine zone stack exactly — same contiguous top/bottom border prices (${borders.join(', ')}). You supply only each zone's color and narrative label.`,
    '- `terrain.levels` MUST carry the engine border verdicts (price + kind verbatim); you supply the label wording.',
    '- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band — name the composite in your labels and pick entry/stop prices from its member levels. A composite of kind `mgi` is an MGI COMPOSITE EDGE: Tier-1/session levels partitioning a void beyond the anchoring profile\'s data (classified against the balance-area profile where it has coverage) — a valid border band for entries, stops and targets like any other.',
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, TPO single prints / poor highs-lows, delta clustering quality, and the doctrine patterns.',
    '- ACTIVE PATTERN SCAN (required): scan the execution chart for the doctrine playbook setups (Failed Breakout Trap, Controlled Flush & Reload, Three-Push Exhaustion, absorption or exhaustion at a border). At least one `overview.orderFlowContext` bullet MUST either name the active pattern and where it fired, or state plainly that no playbook pattern is present.',
    '- Every `overview` prose section needs at least 2 substantive bullets naming concrete engine levels (the schema rejects fewer).',
    `- \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly from your chosen entry/stop/T1. The R/R gate is ${input.rrMin}:1 — do not propose objectives that cannot clear it.`,
    '- Entries, stops and T1 must sit on engine-supplied structure — a zone border or a `terrain.levels` price — never in the middle of value. Entry priority, stop placement and the T1 -> T2 -> T3 target ladder follow the Objective contract in the system prompt.',
    '- BOTH objectives (primary AND secondary) must each carry at least one entry, at least one stop on the protective side of that entry, and at least T1. The secondary is the best available counter-scenario; if it is not yet actionable, express that in its entry `trigger` conditions — never by omitting entries, stops or targets.',
    DISTINCT_ANCHORS_RULE,
    entryStandoffRule(input.facts),
    ...[dataEdgeRule(input.facts)].filter(Boolean),
    ...[campaignBoundaryRule(input.facts)].filter(Boolean),
    '',
    '# Meta fields',
    `- meta.createdAt = "${input.now}"`,
    `- meta.triggerReason = "${input.triggerReason}"`,
    `- meta.currentPrice = ${facts.currentPrice}`,
    `- meta.ripStatus = the engine condition ("${facts.ripStatus?.condition ?? 'unknown'}") plus a short read.`,
    '- meta.htfTrend = your HTF trend read from the planning chart.',
    '',
    '# Attached charts',
    chartManifest(input.charts),
    '',
    '# Bundle freshness',
    facts.staleness.isStale
      ? `STALE DATA: this bundle is ${facts.staleness.ageSeconds}s old (budget ${Math.round(facts.staleness.marginMs / 1000)}s). Flag this prominently in overview.currentPosition — never present stale as fresh.`
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
