import type { Direction } from '@/knowledge/schema/briefing.schema'
import type { ConfirmedAbsorptionScanResult } from '@/lib/engine/stallConfirmation'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { StalenessAssessment } from '@/lib/engine/staleness'
import type { ValueMigrationFacts } from '@/lib/engine/valueMigration'
import type { HtfStructureFacts } from '@/lib/engine/htfStructure'
import type { IntradayTrendFacts } from '@/lib/engine/intradayTrend'
import type { ChartAttachment } from '@/lib/analyze'
import type { EntryLevelRow, ProximityAssessment } from './proximity'

/**
 * User-message assembly for the eval-task `generateObject` call: ENTER /
 * WAIT / NOT_VALID for the nearest active entry when price is near it, else
 * NO_ENTRY_NEAR. In position mode (the dashboard's Long / Short buttons) the
 * same verdict set instead reads on the operator's open position at the
 * current price — hold (ENTER) / unclear (WAIT) / exit (NOT_VALID) — and the
 * near/not-near gate does not apply. Only volatile per-run data lives here;
 * the static decision logic and verdict structure are part of the cached eval
 * doctrine prefix (knowledge/system/output-eval.md, assembled by
 * loadDoctrine('eval')).
 */

export interface EvalPromptInput {
  /** ISO timestamp of this run — becomes `meta.createdAt`. */
  now: string
  /** `raw_bundles.current_price` of the latest bundle. */
  currentPrice: number
  /**
   * Per-bar volume of the execution-chart bars (`config.execution_bar_volume`,
   * feat-079) — exporter metadata stated per run so the cached prefix never
   * hardcodes a bar size the operator can reconfigure.
   */
  executionBarVolume: number
  staleness: StalenessAssessment
  deltaTelemetry: DeltaTelemetry
  /** The active (`active=true`) entry levels from the prior briefing. */
  levels: readonly EntryLevelRow[]
  /** Code-owned near/not-near verdict + nearest level. */
  proximity: ProximityAssessment
  /** Labels for the attached chart images, in attachment order. */
  charts: readonly ChartAttachment[]
  /**
   * Code-detected absorption candidates from the bundle's execution delta
   * exports, stall-annotated from the enriched bars (feat-047); null when the
   * bundle carries no usable delta exports.
   */
  absorption: ConfirmedAbsorptionScanResult | null
  /**
   * The most recent execution bars (ascending time) — the sequence the model
   * judges initiative from, instead of only window aggregates.
   */
  recentBars: readonly ExecBar[]
  /**
   * Code-owned value-migration read from the daily value-area history
   * (feat-048); null when the bundle carries no usable history. Rendered as
   * one context line — prior-day value position + migration direction.
   */
  valueMigration?: ValueMigrationFacts | null
  /**
   * Code-owned HTF structure read from the 30-min bar export (feat-049);
   * null when the bundle carries no usable export. Rendered as one context
   * line — trend state, measured ATR and ATR-normalized swing distances, so
   * an adverse move can be judged as rotation noise vs trend break.
   */
  htfStructure?: HtfStructureFacts | null
  /**
   * Code-owned composite intraday trend (feat-064) from the full-session exec
   * bars — the trend read at the operator's trade horizon. Rendered as one
   * context line: direction/conviction/character plus open disagreements.
   * Computed WITHOUT the Rip frame on this path (the eval bundle carries no
   * MGI). Null/absent when unavailable.
   */
  intradayTrend?: IntradayTrendFacts | null
  /**
   * Position-eval mode: the direction of the operator's open position. The
   * verdict is a hold-or-exit read at the current price instead of an entry
   * check against the active levels. Null/absent for the standard entry check.
   */
  position?: Direction | null
  /**
   * Creation-time context for the evaluated level from its source briefing
   * (feat-084) — the baseline "changed since the prior briefing" judgments
   * are made against. Null when unavailable (briefing row missing, slot
   * mismatch, load failure); absent/ignored in position mode.
   */
  priorBaseline?: PriorBaseline | null
}

/**
 * The evaluated level's creation-time thesis, projected from the source
 * briefing row. Every field is best-effort nullable — a partial baseline is
 * still better than none, and rendering says what is missing.
 */
export interface PriorBaseline {
  /** `briefings.created_at` of the source briefing. */
  briefingCreatedAt: string
  /** `briefings.kind` ('morning' | 'update'), when present. */
  briefingKind: string | null
  /** Which slot armed the level ('primary' | 'secondary'), when known. */
  objective: string | null
  macroGoal: string | null
  rationale: string | null
  /** The original entry trigger the briefing armed the level with. */
  entryTrigger: string | null
  /** The stop's invalidation thesis. */
  stopInvalidation: string | null
  /** Engine-validated R/R at creation (never recomputed by the eval). */
  rr: number | null
  htfTrend: string | null
  ripStatus: string | null
}

/**
 * The baseline section (feat-084, adversarial review finding #5): without a
 * creation-time thesis the model was asked to judge what "changed since the
 * prior briefing" against a history it never saw — biasing invented
 * comparisons. Entry checks get the thesis; evidence for CURRENT structure
 * and initiative still comes from this run's data alone.
 */
function priorBaselineSection(baseline: PriorBaseline | null | undefined): string {
  if (!baseline) {
    return 'No creation-time baseline is available for the evaluated level — judge present-tense only: whether CURRENT structure and initiative authorize acting at it.'
  }
  const field = (label: string, value: string | null) =>
    value === null ? null : `- ${label}: ${value}`
  const armed = [
    `The evaluated level was armed by the ${baseline.briefingKind ?? 'prior'} briefing at ${baseline.briefingCreatedAt}`,
    baseline.objective ? ` as its ${baseline.objective} objective.` : '.',
  ].join('')
  const lines = [
    armed,
    field('Original macro goal', baseline.macroGoal),
    field('Original rationale', baseline.rationale),
    field('Original entry trigger', baseline.entryTrigger),
    field('Stop invalidation thesis', baseline.stopInvalidation),
    field(
      'Engine R/R at creation',
      baseline.rr === null ? null : `${baseline.rr} (validated then — never recompute it here)`,
    ),
    field('Creation-time HTF trend', baseline.htfTrend),
    field('Creation-time Rip status', baseline.ripStatus),
    'Judge change against this baseline (what the plan expected vs what printed since); your evidence for current structure and initiative still comes from THIS run\'s data only.',
  ].filter((line): line is string => line !== null)
  return lines.join('\n')
}

function chartManifest(charts: readonly ChartAttachment[]): string {
  if (charts.length === 0) {
    return 'No chart screenshots are attached to this run — judge from the telemetry and levels alone and say so in the reason.'
  }
  return charts.map((chart, i) => `Image ${i + 1}: ${chart.label}`).join('\n')
}

/**
 * Render the recent bars as a compact CSV block (Leg VWAP deliberately
 * excluded — Tier-3 micro-timing the eval must never see). The raw flow
 * columns (feat-047): delta = AskVolume − BidVolume per bar, volume (the
 * configured `config.execution_bar_volume` except the in-progress partial
 * bar), trades. Magnitude lives in delta — deltaIntensity is only the −4…+4
 * bucket.
 */
function renderRecentBars(bars: readonly ExecBar[]): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lines = bars.map((bar) => {
    const t = bar.dateTime
    const time = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    return `${time},${bar.open},${bar.high},${bar.low},${bar.close},${bar.deltaIntensity},${bar.delta},${bar.volume},${bar.numberOfTrades}`
  })
  return ['```csv', 'time,open,high,low,close,deltaIntensity,delta,volume,trades', ...lines, '```'].join('\n')
}

/**
 * One code-owned prior-day-value context line (feat-048): where price sits
 * relative to the prior completed session's value area and which way value is
 * migrating — acceptance context for the hold/exit and zone reads, no new
 * model burden.
 */
function valueContextLine(vm: ValueMigrationFacts | null | undefined): string {
  if (!vm) {
    return 'No daily value-area history is attached to this bundle — no prior-day value context.'
  }
  const pos = vm.currentPriceVsPriorValue
  const position = pos
    ? pos.position === 'inside'
      ? 'INSIDE the prior session\'s value area'
      : `${pos.position.toUpperCase()} the prior session's value area by ${pos.pointsOutside} pts`
    : 'at an unknown position vs the prior session\'s value area'
  const drift =
    vm.pocDrift.direction === 'flat'
      ? 'value building in place (POC drift flat)'
      : `value migrating ${vm.pocDrift.direction.toUpperCase()} at ${Math.abs(vm.pocDrift.pointsPerDay)} pts/session over ${vm.pocDrift.windowSessions} sessions`
  const streak =
    vm.valueTrend.consecutiveHigherValueDays > 1
      ? `, ${vm.valueTrend.consecutiveHigherValueDays} consecutive higher-value days`
      : vm.valueTrend.consecutiveLowerValueDays > 1
        ? `, ${vm.valueTrend.consecutiveLowerValueDays} consecutive lower-value days`
        : ''
  return `Code-owned: price is ${position} (${vm.priorDay.date}: VAL ${vm.priorDay.val} / POC ${vm.priorDay.poc} / VAH ${vm.priorDay.vah}); ${drift}${streak}.`
}

/**
 * One code-owned HTF structure context line (feat-049): 30-min trend state,
 * measured ATR and ATR-normalized distances from the last confirmed swings —
 * the "rotation noise or trend break?" scale for hold/exit reads.
 */
function htfContextLine(htf: HtfStructureFacts | null | undefined): string {
  if (!htf) {
    return 'No HTF bar data is attached to this bundle — no numeric HTF trend context.'
  }
  const vs = htf.currentVsSwings
  const swingBits = [
    vs.fromLastSwingHighPts !== null
      ? `${vs.fromLastSwingHighPts} pts (${vs.fromLastSwingHighAtr} ATR) from the last swing high`
      : null,
    vs.fromLastSwingLowPts !== null
      ? `${vs.fromLastSwingLowPts} pts (${vs.fromLastSwingLowAtr} ATR) from the last swing low`
      : null,
  ].filter(Boolean)
  const rotation = htf.rotation
    ? `; current rotation ${htf.rotation.low}–${htf.rotation.high} (${htf.rotation.extentPts} pts, ${htf.rotation.extentAtr} ATR)`
    : ''
  const swings = swingBits.length > 0 ? `; price is ${swingBits.join(' and ')}` : ''
  const integrity = htf.trend.integrity
    ? ` — integrity ${htf.trend.integrity.toUpperCase()} (${htf.trend.integrityBasis})`
    : ''
  return `Code-owned (30-min chart): trend ${htf.trend.state.toUpperCase()} (${htf.trend.basis})${integrity}; 30-min ATR ${htf.atrPoints} pts${rotation}${swings}. An adverse move well inside 1 rotation/a few ATR is rotation noise; beyond the last swing against the trade is a structure break. The swing state lags by 2.5 h — weigh the integrity qualifier, not the raw state.`
}

/**
 * One code-owned composite intraday trend line (feat-064): the trend read at
 * the operator's trade horizon — direction, conviction, character and open
 * component disagreements. Computed without the Rip frame on this path.
 */
function intradayTrendLine(trend: IntradayTrendFacts | null | undefined): string {
  if (!trend) {
    return 'No composite intraday trend is available for this bundle.'
  }
  const disagreements =
    trend.disagreements.length > 0
      ? ` Open conflicts: ${trend.disagreements.join('; ')}.`
      : ''
  return `Code-owned (full-session exec bars): ${trend.basis}.${disagreements} A directional entry WITH this read needs less confirmation than one against it; an entry against a strong ${trend.direction} read demands a confirmed reversal pattern at structure.`
}

/** The absorption-candidate section: code-owned facts or an honest absence note. */
function absorptionSection(absorption: ConfirmedAbsorptionScanResult | null): string {
  if (absorption === null) {
    return 'No delta-profile exports are attached to this bundle — judge absorption from the execution chart and the recent bar sequence.'
  }
  if (absorption.candidates.length === 0) {
    return 'The code scan found no qualifying stacks on the delta-profile exports. The scan is bin-based and can miss absorption a rolling export has already aged out — absorption that is visible in the recent bar sequence (aggressor-colored flush that failed to move price at the level) still counts.'
  }
  return [
    '```json',
    JSON.stringify(absorption.candidates, null, 1),
    '```',
    'Each candidate carries a code-owned `stall` block — interpret confirmed/unconfirmed and the direction of each stack per the absorption doctrine in the system prompt.',
  ].join('\n')
}

/** Compact, model-facing projection of one active entry level. */
function levelPayload(level: EntryLevelRow): Record<string, unknown> {
  return {
    label: level.label,
    price: level.price,
    direction: level.direction,
    objective: level.objective,
    stop: level.stop,
    targets: level.targets,
  }
}

/**
 * The verdict framing for a position eval: the operator declared the
 * direction, the level under evaluation IS the current price, and the entry
 * doctrine's ENTER/WAIT/NOT_VALID reads as hold/unclear/exit. The level label
 * echoes the code-built synthetic level so enforcement can match it.
 */
function positionVerdict(input: EvalPromptInput, position: Direction): string {
  const label = input.proximity.nearest?.level.label ?? `${position} position`
  return (
    `You are evaluating the operator's OPEN ${position.toUpperCase()} POSITION at the current price ` +
    `(code-owned; the entry-level near/not-near gate does not apply to a position check). Your status ` +
    `MUST be ENTER, WAIT or NOT_VALID — never NO_ENTRY_NEAR. Read the statuses as: ENTER = structure and ` +
    `initiative at the current price still support the ${position} — holding is justified (a fresh ` +
    `${position} here would still be valid); WAIT = mixed or unclear — name the single observable that ` +
    `decides it in nextSignal; NOT_VALID = structure or initiative has turned against the ${position} — ` +
    `exiting at the current price is the advisory call (put the exit directive in ` +
    `revalidationAction). Your evaluatedLevel MUST be ` +
    `${JSON.stringify({ label, price: input.currentPrice, direction: position })} and direction MUST be ` +
    `"${position}". Populate stop/targets from current structure when the charts justify them, else ` +
    `null, and the status-dependent fields per the per-status contract in the system prompt.`
  )
}

export function buildEvalPrompt(input: EvalPromptInput): string {
  const { proximity } = input
  const position = input.position ?? null
  const nearest = proximity.nearest

  // The gate consults BOTH the snapshot price and the recent exec-bar range;
  // when they disagree (a wick reached the level but the snapshot has pulled
  // away) the model must see both so it can judge "moved past without
  // confirming" honestly.
  const distanceNote = (n: NonNullable<ProximityAssessment['nearest']>): string =>
    n.effectiveDistancePoints < n.distancePoints && proximity.barRange
      ? `${n.effectiveDistancePoints} points away at its closest within the recent execution-bar window (bars spanned ${proximity.barRange.low}–${proximity.barRange.high}); the current snapshot price is ${n.distancePoints} points away`
      : `${n.distancePoints} points away`

  const proximityVerdict = proximity.nearEntry
    ? `Price IS near an active entry (code-computed): the nearest level is ${JSON.stringify(
        nearest ? levelPayload(nearest.level) : null,
      )} at ${nearest ? distanceNote(nearest) : 'an unknown distance'} (threshold ${proximity.thresholdPoints}). Evaluate THIS level: your status MUST be ENTER, WAIT or NOT_VALID, your evaluatedLevel MUST echo its label/price/direction verbatim, and direction MUST match the level. Populate the status-dependent fields (trigger / stop / targets / nextSignal / revalidationAction / checks) per the per-status contract in the system prompt.`
    : `Price is NOT near any active entry (code-computed${
        nearest
          ? `: nearest is ${distanceNote(nearest)}, threshold ${proximity.thresholdPoints}`
          : ': there are no usable active levels'
      }). Your status MUST be "NO_ENTRY_NEAR" and your reason must read like: "No entry near. Price is at [zone], not at any entry level. Run an Update for a full tactical read." Set evaluatedLevel/direction/trigger/stop/targets/checks/nextSignal/revalidationAction/caution to null.`

  return [
    '# Mission',
    position
      ? `Produce one \`EvalResult\` object — an on-demand POSITION check: the operator is in an open ${position.toUpperCase()} at the current price and needs a hold-or-exit read, per the decision logic and verdict structure in the system prompt.`
      : 'Produce one `EvalResult` object — an on-demand entry check at the current price against the active entry levels from the prior briefing, per the decision logic and verdict structure in the system prompt.',
    '',
    '# Data ownership (non-negotiable)',
    position
      ? 'The position direction, the current price and the context levels below are code-owned. Do not invent levels not listed.'
      : 'The near/not-near gate, the current price and the level set below are code-owned. Do not re-derive proximity or invent levels not listed.',
    position ? positionVerdict(input, position) : proximityVerdict,
    '',
    '# Meta fields',
    `- meta.createdAt = "${input.now}"`,
    `- meta.currentPrice = ${input.currentPrice}`,
    `- meta.nearEntry = ${proximity.nearEntry}`,
    '- meta.zone = your one-phrase read of the zone price currently sits in.',
    '',
    '# Attached charts',
    chartManifest(input.charts),
    '',
    '# Bundle freshness',
    input.staleness.isStale
      ? `STALE DATA: this bundle is ${input.staleness.ageSeconds}s old (budget ${Math.round(
          input.staleness.marginMs / 1000,
        )}s). Flag this in the reason and do not ENTER on stale data — never present stale as fresh.`
      : `Bundle is fresh (${input.staleness.ageSeconds}s old).`,
    '',
    position
      ? '# Active entry levels (context only — the open position above is what you are evaluating, not these)'
      : '# Active entry levels (from the prior briefing)',
    '```json',
    JSON.stringify(input.levels.map(levelPayload), null, 1),
    '```',
    ...(position || !proximity.nearEntry
      ? []
      : [
          '',
          '# Prior briefing baseline (creation-time context for the evaluated level)',
          priorBaselineSection(input.priorBaseline),
        ]),
    '',
    '# Delta telemetry (engine-computed from the execution-bar CSV)',
    '```json',
    JSON.stringify(evalTelemetry(input.deltaTelemetry), null, 1),
    '```',
    '',
    '# Recent execution bars (oldest first — judge the SEQUENCE: flush, stall, response)',
    `These are ${input.executionBarVolume}-volume bars (the in-progress last bar may show less) — weigh participation by bar count at a price, trade count and delta magnitude, never by the flat volume column.`,
    renderRecentBars(input.recentBars),
    '',
    '# Prior-day value context (code-owned, from the daily value-area history)',
    valueContextLine(input.valueMigration),
    '',
    '# HTF structure context (code-owned, from the 30-min HTF bar export)',
    htfContextLine(input.htfStructure),
    '',
    '# Intraday trend context (code-owned composite, from the full-session exec bars)',
    intradayTrendLine(input.intradayTrend),
    '',
    '# Absorption candidates (code-detected on the execution delta-profile exports)',
    absorptionSection(input.absorption),
  ].join('\n')
}

/**
 * The telemetry projection the eval model sees: everything except `legVwap`.
 * Leg VWAP is a Tier-3 micro-timing line the operator does not trade off, and
 * feeding it here produced always-fail "momentum" conditions (at a reversal
 * entry price is definitionally on the counter side of Leg VWAP).
 */
function evalTelemetry(telemetry: DeltaTelemetry): Omit<DeltaTelemetry, 'legVwap'> {
  const { legVwap: _legVwap, ...rest } = telemetry
  return rest
}
