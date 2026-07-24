import type { Direction } from '@/knowledge/schema/briefing.schema'
import type { AbsorptionScanResult } from '@/lib/engine/absorption'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { StalenessAssessment } from '@/lib/engine/staleness'
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
   * exports; null when the bundle carries no usable delta exports.
   */
  absorption: AbsorptionScanResult | null
  /**
   * The most recent execution bars (ascending time) — the sequence the model
   * judges initiative from, instead of only window aggregates.
   */
  recentBars: readonly ExecBar[]
  /**
   * Position-eval mode: the direction of the operator's open position. The
   * verdict is a hold-or-exit read at the current price instead of an entry
   * check against the active levels. Null/absent for the standard entry check.
   */
  position?: Direction | null
}

function chartManifest(charts: readonly ChartAttachment[]): string {
  if (charts.length === 0) {
    return 'No chart screenshots are attached to this run — judge from the telemetry and levels alone and say so in the reason.'
  }
  return charts.map((chart, i) => `Image ${i + 1}: ${chart.label}`).join('\n')
}

/**
 * Render the recent bars as a compact CSV block (Leg VWAP deliberately
 * excluded — Tier-3 micro-timing the eval must never see).
 */
function renderRecentBars(bars: readonly ExecBar[]): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lines = bars.map((bar) => {
    const t = bar.dateTime
    const time = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    return `${time},${bar.open},${bar.high},${bar.low},${bar.close},${bar.deltaIntensity}`
  })
  return ['```csv', 'time,open,high,low,close,deltaIntensity', ...lines, '```'].join('\n')
}

/** The absorption-candidate section: code-owned facts or an honest absence note. */
function absorptionSection(absorption: AbsorptionScanResult | null): string {
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
    'These are CANDIDATES: a stack means absorption only where price STALLED at it. A sell-side (red) stack at/below a long border where the flush failed to keep price down is red absorption FOR the long; a buy-side (blue) stack at/above a short border is blue absorption FOR the short.',
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
    `exiting at the current price is the advisory call. Your evaluatedLevel MUST be ` +
    `${JSON.stringify({ label, price: input.currentPrice, direction: position })} and direction MUST be ` +
    `"${position}". Populate stop/targets from current structure when the charts justify them, else null.`
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
      )} at ${nearest ? distanceNote(nearest) : 'an unknown distance'} (threshold ${proximity.thresholdPoints}). Evaluate THIS level: your status MUST be ENTER, WAIT or NOT_VALID, your evaluatedLevel MUST echo its label/price/direction verbatim, and direction/trigger/stop/targets MUST be populated from it (stop/targets from the level row unless structure has invalidated them).`
    : `Price is NOT near any active entry (code-computed${
        nearest
          ? `: nearest is ${distanceNote(nearest)}, threshold ${proximity.thresholdPoints}`
          : ': there are no usable active levels'
      }). Your status MUST be "NO_ENTRY_NEAR" and your reason must read like: "No entry near. Price is at [zone], not at any entry level. Run an Update for a full tactical read." Set evaluatedLevel/direction/trigger/stop/targets/checks/nextSignal/caution to null.`

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
    '',
    '# Delta telemetry (engine-computed from the execution-bar CSV)',
    '```json',
    JSON.stringify(evalTelemetry(input.deltaTelemetry), null, 1),
    '```',
    '',
    '# Recent execution bars (oldest first — judge the SEQUENCE: flush, stall, response)',
    renderRecentBars(input.recentBars),
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
