import type { EngineFacts } from './engineFacts'
import { engineZoneBorders } from './engineFacts'
import {
  MIN_OBJECTIVE_ENTRY_SEPARATION_PTS,
  MIN_OPPOSING_ENTRY_SEPARATION_PTS,
} from './validateBriefing'
import { describeGate, resolveGates } from '@/lib/engine/scaledGates'
import type { ResolvedGates } from '@/lib/engine/scaledGates'

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
  /**
   * Minimum reversal traverse (feat-086 contract, `config.significant_move_sigma`)
   * as a MULTIPLE of the measured session sigma (feat-096) — the binding number
   * for entry-level qualification, injected here so the cached doctrine prefix
   * never states it. Resolved to points against `facts.volatilityScale`; both
   * units are stated in the prompt so the model reasons in the points it quotes.
   */
  significantMoveSigma: number
  /**
   * Per-bar volume of the execution-chart bars (feat-079, `config.
   * execution_bar_volume`) — exporter metadata injected here so the cached
   * doctrine prefix never states the number (the stale "500 volume" drift).
   */
  executionBarVolume: number
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
    fakeoutTails: facts.fakeoutTails,
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
    developingSession: facts.developingSession,
    htfStructure: facts.htfStructure,
    volatilityScale: facts.volatilityScale,
    overnightSession: facts.overnightSession,
    multiDayTpo: facts.multiDayTpo,
    relativeVolume: facts.relativeVolume,
    sessionIntraday: facts.sessionIntraday,
    intradayTrend: facts.intradayTrend,
    warnings: facts.warnings,
  }
}

/**
 * Relative-volume rule (feat-094). Shared verbatim with the update-task prompt:
 * RVOL is the confidence gate on every other order-flow fact, so both tasks must
 * read it the same way or the same tape scores differently between a morning
 * briefing and its updates.
 */
export const RELATIVE_VOLUME_RULE =
  "- `relativeVolume` is the code-owned relative-volume read (feat-094), computed from the 30-min HTF bars' volume column against their OWN history: `relativeVolume.current` is the latest COMPLETED 30-min slot against the median of that same clock slot over prior sessions, `relativeVolume.recentSlots` the last few slots, `relativeVolume.sessionSoFar` cumulative RTH volume against what a normal session has printed by this time of day, and `relativeVolume.daily` the day-level `SessionVolume` companion (measured against the elapsed-time expectation while the session is still developing, so a mid-morning bundle never reads as light by construction). `relativeVolume.participation` is the ONE scalar to cite: `rvol` (× normal), `band` (dead / light / normal / elevated / heavy) and `gate`. That gate is a CONFIDENCE MODIFIER on the other order-flow facts, never a trigger of its own: at `gate: 'discount'` treat delta divergence, absorption candidates and climax prints as low-information and say the tape is too thin to confirm them; at `gate: 'confirming'` the same signals carry real weight. Never call participation heavy or light from a screenshot when this fact is present, and never invent a number when `participation` is null (too little slot history) — say the RVOL read is unavailable."

/**
 * Day-type / open-type rule (feat-093). Analyze-only, like the rest of the TPO
 * day-structure teaching: the classification is a read on the SESSION's shape,
 * settled by the letter sequence the morning briefing already saw, so an
 * update re-narrating it would spend budget restating an unchanged fact.
 */
export const TPO_CLASSIFICATION_RULE =
  "- `tpo.classification` is the code-owned Market Profile session classification (feat-093), read from the TPO letter SEQUENCE: `dayType` (normal / normal-variation / trend / neutral / neutral-extreme / double-distribution) and `openType` (open-drive / open-test-drive / open-rejection-reverse / open-auction), each with the numbers it was decided on in its `*Basis`, plus the IB `extension`, `extensions` (each period that pushed the session range out, and by how much) and `highPeriod` / `lowPeriod`. Name the day and the open FROM this fact — never re-derive either from the Market Profile screenshot. Its thresholds are EMPIRICAL, cut from the bundle's own extension history (`tpo.classification.distribution`) rather than textbook levels, so quote the measured band (\"day/IB 3.25x, above the p90 of 2.58\") instead of asserting a textbook rule. Trade them as: `trend` = one timeframe controlled the auction, so favor continuation and treat counter-trend fades as low-probability; `neutral`/`neutral-extreme` = BOTH sides of the IB were extended, responsive two-way trade, so the extremes are fadeable; `double-distribution` = the session accepted two separate values and the single-print vacuum between them is the boundary that matters. Null = the ladder was too thin to classify; say so rather than guessing a day type."

/**
 * Developing-session rule (feat-089). Shared verbatim with the update-task prompt:
 * both tasks receive the same partitioned facts, and an update that read the
 * developing value area as "the prior day" would contradict the briefing it revises.
 */
export const DEVELOPING_SESSION_RULE =
  "- `developingSession` is the code-owned DEVELOPING-session read (feat-089): the live in-progress RTH session's VOLUME value area — developing POC/VAH/VAL, session high/low, volume and travel so far — split out of the value-area history BY DATE so it can never be mistaken for the prior day. It is the VOLUME view of today, `tpo` is the TIME view of the same session, and a gap between `developingSession.poc` and `tpo.poc` is itself a read. `developingSession.currentPriceVsDevelopingValue` is price against the value being built RIGHT NOW; `valueMigration.currentPriceVsPriorValue` is price against the prior COMPLETED session — never conflate them. Trust the developing area only as far as `developingSession.maturity.read` allows ('early' — barely past the Initial Balance, provisional at best; 'developing'; 'mature'), and quote `developingSession.maturity.basis` when you lean on it. When `developingSession` is null the bundle is pre-open/overnight — say the developing value area is unavailable rather than reading it off a screenshot."

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
export function entryStandoffRule(facts: EngineFacts, gates: ResolvedGates): string {
  const { entryStandoff: standoff, entryChase: chase } = gates
  return `- ENTRY STANDOFF (required): current price is ${facts.currentPrice} and every entry must sit at least ${standoff.pts} pts (${standoff.sigmaMultiple}σ) away from it — validation rejects the briefing otherwise. ENTRY SIDE (required): entries are PULLBACK anchors relative to that current price — a LONG Entry A anchors AT or BELOW it (the rebid/reclaimed border price pulls back down into), a SHORT at or above (the failed border overhead price rallies into). An entry more than ${chase.pts} pts (${chase.sigmaMultiple}σ) beyond current price in the trade direction (long overhead / short underfoot) is a breakout/breakdown chase and validation rejects the briefing. CONTESTED BORDER: when price is trading at or around a structural border right now, PREFER anchoring Entry A at that contested border when BOTH hold: (1) it is significant structure — a Tier-1 campaign border, a composite border band, or balance-area-profile structure, not a lone minor level — and (2) the execution chart shows price has been FIGHTING there for a while: multiple bars of two-sided trade stalling at the level, repeated tests, or an absorption stack building — not a first touch or a clean traversal. Absent that sustained fight (or at a minor level), anchor at the NEXT structural border in the entry's direction instead. If the contested border price itself sits inside the ${standoff.pts}-pt floor of current price, anchor the entry on the band member on the entry side that clears the floor.`
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
  // feat-096: the three point gates are stored in session sigma and resolved
  // against the run's measured scale (fixed-point fallback when unmeasured).
  const gates = resolveGates(facts.volatilityScale, input.significantMoveSigma)

  return [
    '# Mission',
    'Produce one `Briefing` object for the NQ futures session, per the doctrine in the system prompt.',
    '',
    '# Data ownership (non-negotiable)',
    'The ENGINE FACTS below are computed deterministically from the exact numeric export data and are authoritative:',
    '- LVN/HVN node prices, the magnet set, MGI tiering, the Rip/Vanguard condition and the terrain zone stack are code-owned. Do NOT adjust, re-derive or contradict them.',
    '- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `balanceArea` (anchored to the current Balance Area — defined in the Chart Reading doctrine, long-term). A node on the balance-area profile is structurally MORE significant than the same node on the rotation profile: zone borders promote off BOTH profiles with the balance-area read senior (AAA vs A). The magnet set (magnetCheck and the terrain magnet verdicts) is anchored to the balance-area profile.',
    '- `fakeoutTails` is the code-owned FORMATION test on the rotation profile: every flagged High/Low-type MGI extreme with its `acceptanceEdge` LVN node and the tail evidence (`tailSpanPts`, `maxTailBinFrac`). A listed extreme IS fakeout-formed — the finding is data, never re-derive or dispute it; the fade-anchor doctrine for flagged extremes is in the Objective contract. An empty list = no extreme currently carries a fakeout tail.',
    '- Each LVN/HVN node and magnet carries a code-owned `build` annotation (feat-050) — WHO built the acceptance there, from the structural profiles\' per-bin delta split: `buyer-built` / `seller-built` (one-sided initiative) or `balanced` (a two-way fight), with the net delta share in `build.ratio`. One-sided acceptance is weaker structure than a balanced build — weigh a one-sided HVN as a softer magnet/wall, and when a node near an entry, stop or target is one-sided, say so in the rationale. When `build` is null the profile export carried no delta split — do not infer build quality from the screenshots.',
    '- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles, each carrying a code-owned `stall` confirmation computed from the enriched execution bars (bars that traded at the stack, volume and trades there, net price progress). A candidate with `stall.confirmed` IS absorption — price stalled at the stack on heavy participation; do not re-derive the stall from the screenshots. An unconfirmed candidate is a stack with no stall visible in the rolling bar window (possibly aged out, not refuted) — call absorption on it only if the recent bar data itself shows the stall.',
    `- \`deltaTelemetry.flow\` is the code-owned raw order-flow read from the enriched bars: engine-computed cumulative delta (\`deltaTelemetry.flow.cumulativeDelta\`), delta divergence at the fresh price extreme (\`deltaTelemetry.flow.divergence\`), climax prints and average trade size. The execution chart trades ${input.executionBarVolume}-VOLUME bars — per-bar volume is flat by construction, so weigh participation by bar count at a price, trade count and delta magnitude, never by the Volume column.`,
    RELATIVE_VOLUME_RULE,
    `- \`terrain.zones\` in your output MUST reproduce the engine zone stack exactly — same contiguous top/bottom border prices (${borders.join(', ')}). You supply only each zone's color and narrative label.`,
    '- `terrain.levels` MUST carry the engine border verdicts (price + kind verbatim); you supply the label wording.',
    '- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band — name the composite in your labels and pick entry/stop prices from its member levels. Each border carries a `significance` class: AAA = balance-area structure with REAL long-term acceptance (the senior read — the most important levels on the map), A = rotation structure OR balance-area structure demoted for faint flanking acceptance (under half the profile\'s peak — the member verdict `reason` says "faint acceptance") or a shallow valley (center barely below its own flanks — the `reason` says "shallow valley"). Weight AAA borders accordingly for campaign targets and invalidations; treat demoted balance-area borders as ordinary A structure and NEVER call them AAA in prose. `terrain.demoted` lists real structure consolidated out of the zone stack for spacing — usable as level anchors and rungs, but the zone borders define the campaign map.',
    '- `tpo` carries the code-owned Market Profile day structure (feat-046): single-print zones, poor high/low, POC prominence, value area and Initial Balance are computed from the numeric TPO export. Do NOT re-derive them from the Market Profile screenshot. `tpo.singlePrintZones` mark one-sided initiative conviction — the aggressor traversed them without two-sided trade — and FAVOR entries in the direction of the move that created them: a rally back into a downside scar is a reoffer candidate at the scar\'s near-edge border (and a flush back into an upside scar a rebid candidate), NEVER a reason to relocate the entry to the scar\'s far side or rule a border out because the zone "might get repaired". A `tpo.poorHigh`/`tpo.poorLow` is an unfinished auction the market tends to revisit. `tpo.excess` (feat-091) is the OPPOSITE read at the same extremes: `tpo.excess.buyingTail` (session low) and `tpo.excess.sellingTail` (session high) are the contiguous single-print runs that reach the extreme, in `bins`/`points` with the `letters` (and `clock`) of the period that carved them — a FINISHED auction, price rejected so hard the auction shut off, and the tail\'s far edge is a level the market defends until it is repaired. Narrate a long tail by size and period ("a 208-pt buying tail carved by the 08:30 period"), never as noise. `tpo.excess.singlePrintFraction` is how much of the session was single-printed — a high fraction means a thin one-timeframe/trend-day profile, so lean on the tails and the POC rather than on value-area edges. A null tail means that extreme was not single-printed: say nothing about excess there. `tpo.periodClock` (feat-092) maps each period letter present in the profile to the clock time that period opened, derived from the export\'s first-period anchor (`tpo.firstPeriod`) — use it to TIME letter-sequenced reads (when a single-print zone was carved, which period built the high or low) instead of quoting bare letters. When `tpo.periodClock` is null the export predates the anchor: keep the letters, do not invent times. When `tpo` is null the bundle carried no TPO export — say so instead of guessing day structure.',
    TPO_CLASSIFICATION_RULE,
    '- `valueMigration` is the code-owned value-migration read (feat-048), computed from the per-session value-area history: the prior completed session\'s POC/VAH/VAL, the day-by-day series of the last sessions (`valueMigration.recentSessions` — the data behind the overview\'s HTF and MTF narratives), POC drift direction and pace (`valueMigration.pocDrift`), consecutive higher/lower-value days (`valueMigration.valueTrend`), the prior-day value overlap (`valueMigration.priorDayOverlap`) and where the current price sits relative to prior-day value (`valueMigration.currentPriceVsPriorValue`). Narrate whether the balance area is building in place or value is leading price out of it FROM these numbers — never from the screenshots. When `valueMigration` is null the bundle carried no value-area history — say so instead of guessing the migration.',
    DEVELOPING_SESSION_RULE,
    '- `dailyRanges` is the code-owned daily-range read (feat-060): the per-session range series (`dailyRanges.days`), the recent-vs-prior mean ranges and the contraction/expansion verdict (`dailyRanges.read`), all in plain points. Narrate range behavior from these numbers — quote actual session ranges, never an ATR statistic (the overview must not mention ATR). When `dailyRanges` is null the bundle carried no value-area history — say so.',
    '- `multiDayTpo` is the code-owned multi-day TPO composite (feat-071), reconstructed from the 30-min HTF bars (each 30-min bar = one TPO period; RTH sessions only): the last ~5 sessions merged into one profile — composite POC with prominence, 70% value area, HVN shelves and interior LVN valleys (multi-day acceptance gaps) — plus the per-session POC/range walk (`multiDayTpo.perSession`, newest-first) and where current price sits vs the composite value (`multiDayTpo.currentVsComposite`). This is the numeric multi-day Market Profile behind `overview.mtfView` — narrate the multi-day balance FROM these numbers, never from the Market Profile chart image. When `multiDayTpo` is null the bundle carried no HTF bar export (or under two RTH sessions) — say so instead of guessing the multi-day structure.',
    '- `overnightSession` is the code-owned overnight read (feat-060): the Globex session\'s high/low/range and times (`overnightSession.overnight`), the RTH session-so-far extremes (`overnightSession.rthSoFar`, null before the open) and current price vs the overnight extremes (`overnightSession.currentVsOvernight`). Anchor the overview\'s `current` section on these numbers, and narrate overnight-level tests/rejections from them plus the execution bars — prefer them over `mgiPriority` ONH/ONL entries, which can export as 0.00 placeholders. When `overnightSession` is null the HTF export carried no overnight bars — say so.',
    "- `htfStructure` is the code-owned HTF structure read (feat-049), computed from the 30-min planning chart's bars: trend state from the confirmed swing sequence (`htfStructure.trend`), the recent swing highs/lows, the current rotation extent (`htfStructure.rotation`) and the measured 30-min ATR (`htfStructure.atrPoints`, with ATR-normalized distances in `htfStructure.currentVsSwings`). The swing state is a LAGGING read (pivots confirm 2.5 h late) — `htfStructure.trend.integrity` (feat-064) squares it with the live price: 'intact', 'under-test' (counter-move retraced most of the defining rotation) or 'broken' (price has traded through the defining swing). NEVER state a directional HTF trend without its integrity qualifier — \"down, but broken in real time\" and \"down, intact\" are different battlefields. Ground meta.htfTrend and every HTF narrative in these numbers — the planning-chart screenshot adds distribution shape only, never the trend call. When `htfStructure` is null the bundle carried no HTF bar export — say so and mark the trend read as vision-only.",
    "- `volatilityScale` is the code-owned VOLATILITY SCALE (feat-095), measured from the same 30-min bars with the Parkinson (high/low) and Garman-Klass (OHLC) range estimators: `volatilityScale.sessionSigmaPts` is one RTH session's sigma in points — how far this market normally travels in a day — alongside `volatilityScale.medianBarRangePts` and `volatilityScale.medianSessionRangePts`. `volatilityScale.distancesToStructure` gives the distance from current price to the nearest Tier-1 borders and zone borders in points AND in sigma, each with a `band`: 'noise' (inside a quarter of a session sigma — NOT a meaningful gap, do not narrate it as one), 'minor', 'meaningful', 'large'. Use it to size every claim about distance: a level 29 pts away on a 283-pt sigma is 0.10 sigma, i.e. touching distance, not room. Points stay the quoting unit — sigma is the qualifier you attach to them, never a replacement (never quote an entry, stop or target in sigma). When `volatilityScale` is null the bundle carried no HTF bar export (or under 3 complete RTH sessions) — judge distance from points alone and say the scale is unmeasured.",
    "- `intradayTrend` is the code-owned COMPOSITE intraday trend (feat-064) — the trend read at the operator's trade horizon (minutes), senior to the HTF swing state for session narration: `direction` (majority of the structural votes: 15-min one-timeframing, micro swing structure with a real-time Dow break rule, the multi-window momentum stack), `conviction` (how many confirming reads agree: session cumulative delta, the Rip condition, session-VWAP position), `character` (trending / transitioning / rotational) and `disagreements` (explicit component conflicts). Narrate the session's trend FROM this fact — quote `intradayTrend.basis` in substance and surface every entry in `intradayTrend.disagreements` rather than smoothing them over; a directional call with `conviction: 'weak'` or open conflicts is a contested tape, not a trend to lean on. The Law of Asymmetric Initiative awards the PRIMARY objective off `intradayTrend.direction` (never the lagging HTF swing state); on `neutral` award it to the structurally superior setup and say the tape is rotational.",
    "- `sessionIntraday` is the code-owned session-anchored intraday read (feat-063), computed from the full-session exec bars: the session VWAP with slope and current-price position (`sessionIntraday.vwap.globex` / `.rth` — Globex- and RTH-anchored), the session cumulative delta (`sessionIntraday.cumulativeDelta`, same two anchors) and 15-minute one-timeframing (`sessionIntraday.oneTimeframing`: state, bars held, the `breakLevel` that flips it, and whether the developing bar already broke it). This is the INTRADAY trend read at the operator's trade horizon — weigh it alongside the Rip condition when narrating who controls the session, and quote the VWAP with attribution like any other level (e.g. \"27810 (session VWAP)\"). One-timeframing 'none' is two-timeframing: rotational, both sides trading. When `sessionIntraday.vwap` is null the export started mid-session (partial coverage) — say so rather than inventing a session average.",
    "- Each session VWAP carries a code-owned volume-weighted sigma envelope (feat-097): `sessionIntraday.vwap.globex.sigmaBands` (and `.rth`) gives `sigma` in points, the ±1σ/±2σ `bands` and `z` (where price sits in the envelope); `sessionIntraday.vwapRungs` flattens the centerlines and bands into labelled rung structure entries, stops and target rungs may anchor on, quoted with their `label`. Sigma is computed — never re-derive it or read bands off the screenshots. Empty `vwapRungs` = partial coverage, no session bands.",
    '- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, intraday distribution shape on the Market Profile chart beyond the code-owned day/open classification, delta clustering quality, and the doctrine patterns.',
    '- ACTIVE PATTERN SCAN (required): scan the execution chart and fill `patternScan` per the Active Pattern Scan contract in the system prompt — never guess a pattern into existence. Mirror the verdict as one of `overview.current.keyPoints`.',
    '- The three `overview` sections follow the Tactical Overview contract in the system prompt: a TIME-ORDERED `narrative` plus 2–4 distilled `keyPoints` per section, the same storytelling register throughout, names before prices, MGI/volume/TPO vocabulary only.',
    `- SIGNIFICANT-MOVE FLOOR (the binding number for entry selection): ${describeGate(gates.significantMove)}. An entry level qualifies only when the reversal it hosts has at least ${gates.significantMove.pts} pts of room to the nearest realistic opposing structure (entry→T2 ≥ ${gates.significantMove.pts} pts). Walk the map outward from current price and anchor at the FIRST qualifying level — never skip a qualifying nearer level for a deeper one, and never move an entry to manufacture target distance. Abstain (noTrade) only when no qualifying level exists on that side. \`Objective.rr\` is recomputed and overwritten by the engine after you answer; still populate it honestly per the Constraints formula — it is informational, never a gate.`,
    '- Entries, stops and T1 anchor on engine-supplied structure per the Objective contract in the system prompt — a zone border, a `terrain.levels` price, a `lvnHvnNodes` LVN node (the fakeout-formed-extreme anchor) or a `sessionIntraday.vwapRungs` session-VWAP rung. Entry priority, stop placement and the one-or-two-rung target ladder follow that contract.',
    '- Each objective slot (primary AND secondary) carries EITHER a full trade OR the explicit no-trade abstention, per the Objective contract. The secondary is the best available counter-scenario; when it is real but waiting, express that in its entry `trigger` conditions — abstain only when no genuine scenario exists, never fabricate entries, stops or targets to fill the slot.',
    DISTINCT_ANCHORS_RULE,
    entryStandoffRule(input.facts, gates),
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
      ? `STALE DATA: this bundle is ${facts.staleness.ageSeconds}s old (budget ${Math.round(facts.staleness.marginMs / 1000)}s). Flag this prominently as its own overview.current keyPoint — never present stale as fresh.`
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
