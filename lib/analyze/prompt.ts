import type { EngineFacts } from './engineFacts'
import { engineZoneBorders } from './engineFacts'
import {
  MAX_ENTRY_CHASE_PTS,
  MIN_ENTRY_STANDOFF_PTS,
  MIN_OBJECTIVE_ENTRY_SEPARATION_PTS,
  MIN_OPPOSING_ENTRY_SEPARATION_PTS,
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
    tpo: facts.tpo,
    valueMigration: facts.valueMigration,
    dailyRanges: facts.dailyRanges,
    htfStructure: facts.htfStructure,
    overnightSession: facts.overnightSession,
    sessionIntraday: facts.sessionIntraday,
    intradayTrend: facts.intradayTrend,
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
 * Distinct-anchors rule (2026-07-20, the same-level straddle fix; direction-aware
 * 2026-07-24 — the morning briefing bracketed one contested zone with a long and a short
 * 17.15 pts apart, two nearby borders acting as one straddle). Kept in the user message
 * because it carries the live validation thresholds; the rest of the entry/stop/ladder
 * doctrine (single entry, entry priority, stop placement, the two-target T1→T2 ladder —
 * feat-041/042, single-entry 2026-07-18, two-target 2026-07-26) lives in the cached prefix
 * (knowledge/system/output-objective.md). Shared with the update-task prompt.
 */
export const DISTINCT_ANCHORS_RULE = `- DISTINCT ANCHORS (required): the primary and secondary objectives MUST anchor at DIFFERENT structural borders — same-direction objectives at least ${MIN_OBJECTIVE_ENTRY_SEPARATION_PTS} pts apart, OPPOSITE-direction objectives at least ${MIN_OPPOSING_ENTRY_SEPARATION_PTS} pts apart — validation rejects the briefing otherwise. An opposite-direction straddle ("short the reoffer / long the hold") bracketing one contested zone is ONE undecided scenario, not two objectives — even when the two entries sit at nominally different nearby borders. The counter-scenario anchors at the structure defining ITS OWN trade — the floor cluster below for a fade long, the failed ceiling overhead for a counter short — with its entry trigger expressing the reclaim/failure that activates it.`

/**
 * Entry-standoff + contested-border rule (2026-07-20 operator decisions), ANALYZE-ONLY —
 * deliberately not shared with the update-task prompt: an update revises a standing plan,
 * and price approaching its planned entry is the trade working, not a defect. The hard
 * floor mirrors `enforceEntryStandoff` in validateBriefing.ts (relaxed 15 → 1 pt same
 * day). Contested-border doctrine: a border price is currently fighting at IS the entry
 * anchor when it is significant structure and the fight is sustained — the operator
 * reversed the earlier always-defer-to-the-next-border guidance.
 *
 * The ENTRY SIDE clause mirrors the chase-side invariant (2026-07-23, also analyze-only
 * as a hard gate): a fresh long anchoring far ABOVE current price (or a short far below)
 * is the forbidden breakout/breakdown chase — the 30-pts-overhead long that prompted the
 * gate could never be a pullback anchor.
 */
export function entryStandoffRule(facts: EngineFacts): string {
  return `- ENTRY STANDOFF (required): current price is ${facts.currentPrice} and every entry must sit at least ${MIN_ENTRY_STANDOFF_PTS} pts away from it — validation rejects the briefing otherwise. ENTRY SIDE (required): entries are PULLBACK anchors relative to that current price — a LONG Entry A anchors AT or BELOW it (the rebid/reclaimed border price pulls back down into), a SHORT at or above (the failed border overhead price rallies into). An entry more than ${MAX_ENTRY_CHASE_PTS} pts beyond current price in the trade direction (long overhead / short underfoot) is a breakout/breakdown chase and validation rejects the briefing. CONTESTED BORDER: when price is trading at or around a structural border right now, PREFER anchoring Entry A at that contested border when BOTH hold: (1) it is significant structure — a Tier-1 campaign border, a composite border band, or balance-area-profile structure, not a lone minor level — and (2) the execution chart shows price has been FIGHTING there for a while: multiple bars of two-sided trade stalling at the level, repeated tests, or an absorption stack building — not a first touch or a clean traversal. Absent that sustained fight (or at a minor level), anchor at the NEXT structural border in the entry's direction instead. If the contested border price itself sits inside the ${MIN_ENTRY_STANDOFF_PTS}-pt floor of current price, anchor the entry on the band member on the entry side that clears the floor.`
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
    '- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `balanceArea` (anchored to the current Balance Area — defined in the Chart Reading doctrine, long-term). A node on the balance-area profile is structurally MORE significant than the same node on the rotation profile: zone borders promote off BOTH profiles with the balance-area read senior (AAA vs A). The magnet set (magnetCheck and the terrain magnet verdicts) is anchored to the balance-area profile.',
    '- Each LVN/HVN node and magnet carries a code-owned `build` annotation (feat-050) — WHO built the acceptance there, from the structural profiles\' per-bin delta split: `buyer-built` / `seller-built` (one-sided initiative) or `balanced` (a two-way fight), with the net delta share in `build.ratio`. One-sided acceptance is weaker structure than a balanced build — weigh a one-sided HVN as a softer magnet/wall, and when a node near an entry, stop or target is one-sided, say so in the rationale. When `build` is null the profile export carried no delta split — do not infer build quality from the screenshots.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles, each carrying a code-owned `stall` confirmation computed from the enriched execution bars (bars that traded at the stack, volume and trades there, net price progress). A candidate with `stall.confirmed` IS absorption — price stalled at the stack on heavy participation; do not re-derive the stall from the screenshots. An unconfirmed candidate is a stack with no stall visible in the rolling bar window (possibly aged out, not refuted) — call absorption on it only if the recent bar data itself shows the stall.',
    '- `deltaTelemetry.flow` is the code-owned raw order-flow read from the enriched bars: engine-computed cumulative delta (`deltaTelemetry.flow.cumulativeDelta`), delta divergence at the fresh price extreme (`deltaTelemetry.flow.divergence`), climax prints and average trade size. These are 750-VOLUME bars — per-bar volume is flat by construction, so weigh participation by bar count at a price, trade count and delta magnitude, never by the Volume column.',
    `- \`terrain.zones\` in your output MUST reproduce the engine zone stack exactly — same contiguous top/bottom border prices (${borders.join(', ')}). You supply only each zone's color and narrative label.`,
    '- `terrain.levels` MUST carry the engine border verdicts (price + kind verbatim); you supply the label wording.',
    '- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band — name the composite in your labels and pick entry/stop prices from its member levels. Each border carries a `significance` class: AAA = balance-area structure (the senior long-term read — the most important levels on the map), A = rotation structure. Weight AAA borders accordingly for campaign targets and invalidations. `terrain.demoted` lists real structure consolidated out of the zone stack for spacing — usable as level anchors and rungs, but the zone borders define the campaign map.',
    '- `tpo` carries the code-owned Market Profile day structure (feat-046): single-print zones, poor high/low, POC prominence, value area and Initial Balance are computed from the numeric TPO export. Do NOT re-derive them from the Market Profile screenshot. `tpo.singlePrintZones` mark one-sided initiative conviction — the aggressor traversed them without two-sided trade — and FAVOR entries in the direction of the move that created them: a rally back into a downside scar is a reoffer candidate at the scar\'s near-edge border (and a flush back into an upside scar a rebid candidate), NEVER a reason to relocate the entry to the scar\'s far side or rule a border out because the zone "might get repaired". A `tpo.poorHigh`/`tpo.poorLow` is an unfinished auction the market tends to revisit. When `tpo` is null the bundle carried no TPO export — say so instead of guessing day structure.',
    '- `valueMigration` is the code-owned value-migration read (feat-048), computed from the per-session value-area history: the prior completed session\'s POC/VAH/VAL, the day-by-day series of the last sessions (`valueMigration.recentSessions` — the data behind the overview\'s HTF and MTF narratives), POC drift direction and pace (`valueMigration.pocDrift`), consecutive higher/lower-value days (`valueMigration.valueTrend`), the prior-day value overlap (`valueMigration.priorDayOverlap`) and where the current price sits relative to prior-day value (`valueMigration.currentPriceVsPriorValue`). Narrate whether the balance area is building in place or value is leading price out of it FROM these numbers — never from the screenshots. When `valueMigration` is null the bundle carried no value-area history — say so instead of guessing the migration.',
    '- `dailyRanges` is the code-owned daily-range read (feat-060): the per-session range series (`dailyRanges.days`), the recent-vs-prior mean ranges and the contraction/expansion verdict (`dailyRanges.read`), all in plain points. Narrate range behavior from these numbers — quote actual session ranges, never an ATR statistic (the overview must not mention ATR). When `dailyRanges` is null the bundle carried no value-area history — say so.',
    '- `overnightSession` is the code-owned overnight read (feat-060): the Globex session\'s high/low/range and times (`overnightSession.overnight`), the RTH session-so-far extremes (`overnightSession.rthSoFar`, null before the open) and current price vs the overnight extremes (`overnightSession.currentVsOvernight`). Anchor the overview\'s `current` section on these numbers, and narrate overnight-level tests/rejections from them plus the execution bars — prefer them over `mgiPriority` ONH/ONL entries, which can export as 0.00 placeholders. When `overnightSession` is null the HTF export carried no overnight bars — say so.',
    "- `htfStructure` is the code-owned HTF structure read (feat-049), computed from the 30-min planning chart's bars: trend state from the confirmed swing sequence (`htfStructure.trend`), the recent swing highs/lows, the current rotation extent (`htfStructure.rotation`) and the measured 30-min ATR (`htfStructure.atrPoints`, with ATR-normalized distances in `htfStructure.currentVsSwings`). The swing state is a LAGGING read (pivots confirm 2.5 h late) — `htfStructure.trend.integrity` (feat-064) squares it with the live price: 'intact', 'under-test' (counter-move retraced most of the defining rotation) or 'broken' (price has traded through the defining swing). NEVER state a directional HTF trend without its integrity qualifier — \"down, but broken in real time\" and \"down, intact\" are different battlefields. Ground meta.htfTrend and every HTF narrative in these numbers — the planning-chart screenshot adds distribution shape only, never the trend call. When `htfStructure` is null the bundle carried no HTF bar export — say so and mark the trend read as vision-only.",
    "- `intradayTrend` is the code-owned COMPOSITE intraday trend (feat-064) — the trend read at the operator's trade horizon (minutes), senior to the HTF swing state for session narration: `direction` (majority of the structural votes: 15-min one-timeframing, micro swing structure with a real-time Dow break rule, the multi-window momentum stack), `conviction` (how many confirming reads agree: session cumulative delta, the Rip condition, session-VWAP position), `character` (trending / transitioning / rotational) and `disagreements` (explicit component conflicts). Narrate the session's trend FROM this fact — quote `intradayTrend.basis` in substance and surface every entry in `intradayTrend.disagreements` rather than smoothing them over; a directional call with `conviction: 'weak'` or open conflicts is a contested tape, not a trend to lean on.",
    "- `sessionIntraday` is the code-owned session-anchored intraday read (feat-063), computed from the full-session exec bars: the session VWAP with slope and current-price position (`sessionIntraday.vwap.globex` / `.rth` — Globex- and RTH-anchored), the session cumulative delta (`sessionIntraday.cumulativeDelta`, same two anchors) and 15-minute one-timeframing (`sessionIntraday.oneTimeframing`: state, bars held, the `breakLevel` that flips it, and whether the developing bar already broke it). This is the INTRADAY trend read at the operator's trade horizon — weigh it alongside the Rip condition when narrating who controls the session, and quote the VWAP with attribution like any other level (e.g. \"27810 (session VWAP)\"). One-timeframing 'none' is two-timeframing: rotational, both sides trading. When `sessionIntraday.vwap` is null the export started mid-session (partial coverage) — say so rather than inventing a session average.",
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, intraday distribution shape on the Market Profile chart, delta clustering quality, and the doctrine patterns.',
    '- ACTIVE PATTERN SCAN (required): scan the execution chart for the doctrine playbook setups (Failed Breakout Trap, Controlled Flush & Reload, Three-Push Exhaustion, absorption or exhaustion at a border). At least one `overview.current` bullet MUST either name the active pattern and where it fired, or state plainly that no playbook pattern is present.',
    '- Each of the three `overview` sections (`overview.htfView`, `overview.mtfView`, `overview.current`) needs at least 2 substantive bullets naming concrete engine levels, and at most 5 (the schema rejects both ways). The overview speaks in MGI and volume/TPO structure only — never terrain-zone names, never ATR (the Output Contract section carries the full vocabulary rules).',
    `- \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly. R/R is measured against the operator's FIXED 25-pt operational stop, NOT your structural stop, and it gates on T2 (the realistic conclusion): the gate is ${input.rrMin}:1, so T2 must sit at least ${input.rrMin * 25} pts beyond entry. T1 is a mid-traverse rung with no R/R requirement of its own. Do not propose objectives whose T2 cannot clear the gate. Your structural stop still defines invalidation and must stay on the protective side.`,
    '- Entries, stops and T1 must sit on engine-supplied structure — a zone border or a `terrain.levels` price — never in the middle of value. Entry priority, stop placement and the two-target T1 -> T2 ladder (T2 = the move\'s realistic conclusion, T1 = a structure rung near the middle of the entry->T2 traverse) follow the Objective contract in the system prompt.',
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
    '- meta.htfTrend = your HTF trend narrative, grounded in the code-owned `htfStructure` facts (trend state, swings, ATR) AND its `trend.integrity` qualifier — a directional state must carry the qualifier in the same sentence (e.g. "Down, but under test: price has retraced 95% of the defining rotation"). When `htfStructure` is null, read the planning chart and say the read is vision-only.',
    '',
    '# Attached charts',
    chartManifest(input.charts),
    '',
    '# Bundle freshness',
    facts.staleness.isStale
      ? `STALE DATA: this bundle is ${facts.staleness.ageSeconds}s old (budget ${Math.round(facts.staleness.marginMs / 1000)}s). Flag this prominently in overview.current — never present stale as fresh.`
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
