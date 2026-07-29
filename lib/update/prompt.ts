import type { PersistedBriefing } from '@/knowledge/schema/briefing.schema'
import type { ChartAttachment, EngineFacts } from '@/lib/analyze'
import {
  MIN_OBJECTIVE_ENTRY_SEPARATION_PTS,
  MIN_OPPOSING_ENTRY_SEPARATION_PTS,
  engineZoneBorders,
} from '@/lib/analyze'
import {
  DISTINCT_ANCHORS_RULE,
  campaignBoundaryRule,
  chartManifest,
  dataEdgeRule,
  factsPayload,
} from '@/lib/analyze/prompt'
import type { OperatorDirective } from './directive'

/**
 * User-message assembly for the update-task `generateObject` call. Mirrors
 * the analyze prompt (same data-ownership rules, engine facts, raw MGI) but
 * the mission is the Gem's "Update": an Immediate Tactical Read + a fresh
 * Strategic Alignment, produced AGAINST the previous briefing embedded below.
 */

export interface ParentBriefingContext {
  /** The parent's enforced `raw_model_json` (already schema-validated; may carry a pre-feat-060 legacy overview). */
  briefing: PersistedBriefing
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
  /**
   * feat-061: present only on operator-directive runs. The directive text goes
   * in THIS user message, never in the doctrine system prompt (which is
   * prompt-cached and must stay byte-identical across runs); a directive-less
   * prompt is byte-identical to a pre-feat-061 one.
   */
  directive?: OperatorDirective
}

/**
 * The `# Operator directive` section (feat-061). The untargeted objective is
 * hard-frozen code-side (composeUpdateBriefing replaces it with the parent's
 * version verbatim), so the model is told to copy it and to place the directed
 * entry clear of its frozen entry — the distinct-anchor floors are enforced
 * against the FROZEN entry, and a directive that cannot coexist with it fails
 * the run rather than moving an objective the operator didn't touch.
 */
function operatorDirectiveSection(
  directive: OperatorDirective,
  parent: PersistedBriefing,
): string[] {
  const target = directive.objective
  const other = target === 'primary' ? 'secondary' : 'primary'
  const frozen = parent[other]
  const frozenEntry = frozen.entries[0]
  const frozenAnchor = frozenEntry
    ? `its frozen ${frozen.direction} entry at ${frozenEntry.price}`
    : `its frozen entry`

  return [
    '# Operator directive (the reason for this run)',
    `The operator requested this update with a directive targeting the ${target.toUpperCase()} objective:`,
    `> ${directive.text}`,
    'Precedence rules:',
    `- Honor the directive when regenerating the ${target} objective. If it names a symbolic level (e.g. "ONL", "VAH"), resolve it against the labeled MGI levels and engine facts below. If it cannot be honored exactly on engine-supplied structure, anchor as close to the directive as structure allows and state the deviation explicitly in that objective's rationale.`,
    '- The directive steers WHERE the objective anchors — every other rule still binds: data ownership, entries/stops/T1 on engine structure, level attribution, and the R/R gate.',
    `- The ${other} objective is FROZEN: the engine replaces whatever you output for \`${other}\` with the previous briefing's version verbatim, so copy it unchanged. Your ${target} entry must keep the distinct-anchor floors against ${frozenAnchor}: at least ${MIN_OBJECTIVE_ENTRY_SEPARATION_PTS} pts away if same direction, ${MIN_OPPOSING_ENTRY_SEPARATION_PTS} pts if opposite.`,
    '- `tacticalRead` and `dangerZones`: refresh normally against current data.',
    '',
  ]
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
    ...(input.directive
      ? operatorDirectiveSection(input.directive, parent.briefing)
      : []),
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
    '- Each LVN/HVN node and magnet carries a code-owned `build` annotation (feat-050): `buyer-built` / `seller-built` (one-sided initiative) or `balanced` (a two-way fight). One-sided acceptance is weaker structure than a balanced build — weigh a one-sided HVN as a softer magnet/wall. When `build` is null the profile export carried no delta split — do not infer it from the screenshots.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles, each carrying a code-owned `stall` confirmation from the enriched execution bars. A candidate with `stall.confirmed` IS absorption — price stalled at the stack on heavy participation; an unconfirmed candidate has no stall visible in the rolling bar window (possibly aged out, not refuted).',
    `- The CURRENT engine zone borders are: ${borders.join(', ')}. If these disagree with the previous briefing's terrain, the engine is right — flag the drift in the relevant rationale.`,
    `- \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly. R/R is measured against the operator's FIXED 25-pt operational stop, NOT your structural stop, and it gates on T2 (the realistic conclusion): the gate is ${input.rrMin}:1, so T2 must sit at least ${input.rrMin * 25} pts beyond entry. T1 is a mid-traverse rung with no R/R requirement of its own. Do not propose objectives whose T2 cannot clear the gate. Your structural stop still defines invalidation and must stay on the protective side.`,
    '- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band and pick entry/stop prices from its member levels. Each border carries a `significance` class: AAA = balance-area structure (the senior long-term read), A = rotation structure. `terrain.demoted` lists real structure consolidated out of the zone stack for spacing — usable as level anchors and rungs, but the zone borders define the campaign map.',
    '- Entries, stops and T1 must sit on engine-supplied structure — a zone border or a `terrain.levels` price — never in the middle of value. Entry priority, stop placement and the two-target T1 -> T2 ladder (T2 = the move\'s realistic conclusion, T1 = a structure rung near the middle of the entry->T2 traverse) follow the Objective contract in the system prompt.',
    DISTINCT_ANCHORS_RULE,
    ...[dataEdgeRule(facts)].filter(Boolean),
    ...[campaignBoundaryRule(facts)].filter(Boolean),
    '- `tpo` carries the code-owned Market Profile day structure (feat-046): single-print zones, poor high/low, POC prominence, value area and Initial Balance. Do NOT re-derive them from the Market Profile screenshot; when `tpo` is null the bundle carried no TPO export.',
    '- `valueMigration` is the code-owned value-migration read (feat-048): prior-day POC/VAH/VAL, POC drift, value-day streaks, prior-day value overlap and current price vs prior-day value. Narrate value migration FROM these numbers, never from the screenshots; when `valueMigration` is null the bundle carried no value-area history.',
    "- `htfStructure` is the code-owned HTF structure read (feat-049): trend state from the confirmed swing sequence, recent swing highs/lows, rotation extent and the measured 30-min ATR. The swing state is a LAGGING read — `htfStructure.trend.integrity` (feat-064: 'intact' / 'under-test' / 'broken') squares it with the live price; NEVER state a directional HTF trend without the qualifier. Ground meta.htfTrend and every HTF narrative in these numbers — the planning-chart screenshot adds distribution shape only; when `htfStructure` is null the bundle carried no HTF bar export.",
    "- `intradayTrend` is the code-owned COMPOSITE intraday trend (feat-064) — senior to the HTF swing state for session narration: `direction` (majority of 15-min one-timeframing, micro swing structure with a Dow break rule, momentum stack), `conviction` (confirming reads: session cum delta, Rip, VWAP position), `character` and explicit `disagreements`. Ground tacticalRead's location/initiative narration in it and surface its disagreements rather than smoothing them over. The Law of Asymmetric Initiative awards the PRIMARY objective off `intradayTrend.direction` (never the lagging HTF swing state); on `neutral` award it to the structurally superior setup.",
    "- `sessionIntraday` is the code-owned session-anchored intraday read (feat-063): session VWAP with slope and position (`vwap.globex` / `.rth`), session cumulative delta, and 15-minute one-timeframing (state, bars held, `breakLevel`, whether the developing bar broke it). This is the intraday trend read at the operator's trade horizon — weigh it alongside the Rip condition in tacticalRead, with attribution like any other level (e.g. \"27810 (session VWAP)\"). When `sessionIntraday.vwap` is null the export started mid-session — say so rather than inventing a session average.",
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, intraday distribution shape on the Market Profile chart, delta clustering quality, and the doctrine patterns.',
    '',
    '# Meta fields',
    `- meta.createdAt = "${input.now}"`,
    `- meta.triggerReason = "${input.triggerReason}"`,
    `- meta.currentPrice = ${facts.currentPrice}`,
    `- meta.ripStatus = the engine condition ("${facts.ripStatus?.condition ?? 'unknown'}") plus a short read. (tacticalRead.ripStatus is your separate 1-line narrative read.)`,
    '- meta.htfTrend = your HTF trend narrative, grounded in the code-owned `htfStructure` facts (trend state, swings, ATR) AND its `trend.integrity` qualifier — a directional state must carry the qualifier in the same sentence; when `htfStructure` is null, read the planning chart and say the read is vision-only.',
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
