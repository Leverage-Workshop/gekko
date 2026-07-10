import type { EngineFacts } from './engineFacts'
import { engineZoneBorders } from './engineFacts'

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

function chartManifest(charts: readonly ChartAttachment[]): string {
  if (charts.length === 0) {
    return 'No chart screenshots are attached to this run — rely on the engine facts alone and say so in the overview.'
  }
  return charts
    .map((chart, i) => `Image ${i + 1}: ${chart.label}`)
    .join('\n')
}

/** Compact, model-facing projection of the engine facts (no bulky raw rows). */
function factsPayload(facts: EngineFacts): Record<string, unknown> {
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
    '- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `fiveDay` (the rolling five-day, long-term). A node on the five-day profile is structurally MORE significant than the same node on the rotation profile. The terrain zone stack and magnet set are anchored to the rotation profile.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles. They are CANDIDATES ONLY — a stack by itself means nothing. Call absorption only where the execution chart shows price STALLED at the stack; otherwise ignore the candidate.',
    `- \`terrain.zones\` in your output MUST reproduce the engine zone stack exactly — same contiguous top/bottom border prices (${borders.join(', ')}). You supply only each zone's color and narrative label.`,
    '- `terrain.levels` MUST carry the engine border verdicts (price + kind verbatim); you supply the label wording.',
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, TPO single prints / poor highs-lows, delta clustering quality, and the doctrine patterns.',
    `- \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly from your chosen entry/stop/T1. The R/R gate is ${input.rrMin}:1 — do not propose objectives that cannot clear it.`,
    '- Entries only at engine-verified acceptance borders. T3 must land on a Trench or Wall, never a Magnet.',
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
