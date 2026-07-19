import type { AbsorptionScanResult } from '@/lib/engine/absorption'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { StalenessAssessment } from '@/lib/engine/staleness'
import type { ChartAttachment } from '@/lib/analyze'
import type { EntryLevelRow, ProximityAssessment } from './proximity'

/**
 * User-message assembly for the eval-task `generateObject` call. Implements
 * the gem-files/instructions.md "eval" prompt: ENTER / WAIT / NOT_VALID for
 * the nearest active entry when price is near it, else NO_ENTRY_NEAR. All
 * volatile per-run data lives here (never in the cached doctrine prefix).
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

// The instructions.md "eval" decision doctrine, verbatim in substance. Static
// text, but it is eval-specific so it lives in the user message rather than
// widening the shared cached doctrine prefix.
const EVAL_DECISION_LOGIC = [
  '# Eval decision logic (doctrine)',
  'LONG ENTER conditions (any of the following):',
  '- Price at acceptance border + blue initiative confirming on the execution chart → ENTER',
  '- Red aggression absorbed at the border, then blue continuation → ENTER',
  '- Failed breakout with reload back to border → ENTER',
  '- Any bullish pattern from the playbook with structural justification → ENTER',
  '',
  'SHORT ENTER conditions (any of the following):',
  '- Price at acceptance border + red initiative confirming on the execution chart → ENTER',
  '- Blue aggression absorbed at the border, then red continuation → ENTER',
  '- Failed breakdown with reoffer back to border → ENTER',
  '- Any bearish pattern from the playbook with structural justification → ENTER',
  '',
  "Absorption prints in the AGGRESSOR's color: price falling into support absorbs RED; price rising into resistance absorbs BLUE. Never demand blue absorption for a long or red absorption for a short — the entry-side color appears after absorption, as the continuation.",
  '',
  'Absorption at the border ALONE satisfies an Absorption check: once the aggressor-colored flush has stalled at the level, mark the check pass. Continuation in the entry direction strengthens conviction but is NEVER required for the check — by the time continuation is unmistakable, price has usually left the entry window, so demanding it guarantees the check can never pass.',
  '',
  'No DOM / order-book data is attached to this run: never include a DOM check, cite the DOM as evidence, or hold a verdict pending DOM confirmation. Judge initiative from the delta telemetry and the execution chart only.',
  '',
  'WAIT conditions:',
  '- Price near entry but initiative unclear → WAIT (needs pullback to LVN / execution-chart confirmation)',
  '',
  'A retest, reclaim or pullback of the border strengthens conviction but is NEVER a gate: do not withhold ENTER — or mark a check fail/pending — solely because one has not yet printed when structure and initiative already confirm.',
  '',
  'NOT_VALID conditions:',
  '- Structure changed since the prior briefing → NOT_VALID',
  '- Initiative flipped against the setup → NOT_VALID',
  '- Price moved past the entry without confirming → NOT_VALID',
  '',
  'Before any ENTER, verify initiative from the recent bar SEQUENCE, not the telemetry mean. The mean averages the whole window, so an absorbed flush leaves the sign contradicting the entry exactly when the entry confirms: a red flush into a long border that failed to keep price down reads sign=negative while the tape is bullish (mirror for shorts). A contradicting sign blocks ENTER only when the recent bars AGREE with it — one-sided initiative against the entry with price still on the wrong side of the level. Never mark a Delta check fail solely because the window mean carries the color of the flush.',
].join('\n')

export function buildEvalPrompt(input: EvalPromptInput): string {
  const { proximity } = input
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
    'Produce one `EvalResult` object — an on-demand entry check at the current price against the active entry levels from the prior briefing, per the doctrine in the system prompt.',
    '',
    EVAL_DECISION_LOGIC,
    '',
    '# Verdict structure (level verdicts only — ENTER / WAIT / NOT_VALID)',
    'Decompose your judgment into `checks`: 3–6 named conditions, each with a verdict and a one-line note. Use short stable names the operator can scan (e.g. "Structure", "Delta", "Absorption", "Execution"). Verdicts: "pass" = supports the entry, "fail" = argues against it right now, "pending" = not yet confirmed either way.',
    'Never use Leg VWAP as a check or as evidence in one. At a reversal or reload entry, price is by definition on the counter-trend side of Leg VWAP — citing that as momentum against the entry rejects every valid reversal. Judge initiative from delta telemetry and the execution chart action at the border, not VWAP position.',
    '`nextSignal`: for WAIT or NOT_VALID, the single concrete observable that would flip this to ENTER (e.g. "blue delta emergence on the 29256 retest"). Null for ENTER.',
    '`caution`: one line of what NOT to do right now (e.g. "do not chase price higher into the void"). Null if nothing needs flagging.',
    '`reason`: a 1–2 sentence summary of the verdict — the checks carry the detail, so do not repeat them.',
    '',
    '# Data ownership (non-negotiable)',
    'The near/not-near gate, the current price and the level set below are code-owned. Do not re-derive proximity or invent levels not listed.',
    proximityVerdict,
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
    '# Active entry levels (from the prior briefing)',
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
