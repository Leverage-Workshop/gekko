import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
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
}

function chartManifest(charts: readonly ChartAttachment[]): string {
  if (charts.length === 0) {
    return 'No chart screenshots are attached to this run — judge from the telemetry and levels alone and say so in the reason.'
  }
  return charts.map((chart, i) => `Image ${i + 1}: ${chart.label}`).join('\n')
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
  '- Price at acceptance border + blue initiative + DOM confirming → ENTER',
  '- Absorption pattern at border with blue continuation → ENTER',
  '- Failed breakout with reload back to border → ENTER',
  '- Any bullish pattern from the playbook with structural justification → ENTER',
  '',
  'SHORT ENTER conditions (any of the following):',
  '- Price at acceptance border + red initiative + DOM confirming → ENTER',
  '- Absorption pattern at border with red continuation → ENTER',
  '- Failed breakdown with reoffer back to border → ENTER',
  '- Any bearish pattern from the playbook with structural justification → ENTER',
  '',
  'WAIT conditions:',
  '- Price near entry but initiative unclear → WAIT (needs pullback to LVN / DOM confirmation)',
  '- Structure valid but waiting for retest → WAIT',
  '',
  'NOT_VALID conditions:',
  '- Structure changed since the prior briefing → NOT_VALID',
  '- Initiative flipped against the setup → NOT_VALID',
  '- Price moved past the entry without confirming → NOT_VALID',
  '',
  'Before any ENTER, explicitly verify the delta telemetry sign: Delta > 0 (positive) for longs, Delta < 0 (negative) for shorts. If the sign contradicts the direction, do not ENTER.',
].join('\n')

export function buildEvalPrompt(input: EvalPromptInput): string {
  const { proximity } = input
  const nearest = proximity.nearest

  const proximityVerdict = proximity.nearEntry
    ? `Price IS near an active entry (code-computed): the nearest level is ${JSON.stringify(
        nearest ? levelPayload(nearest.level) : null,
      )} at ${nearest?.distancePoints} points away (threshold ${proximity.thresholdPoints}). Evaluate THIS level: your status MUST be ENTER, WAIT or NOT_VALID, your evaluatedLevel MUST echo its label/price/direction verbatim, and direction/trigger/stop/targets MUST be populated from it (stop/targets from the level row unless structure has invalidated them).`
    : `Price is NOT near any active entry (code-computed${
        nearest
          ? `: nearest is ${nearest.distancePoints} points away, threshold ${proximity.thresholdPoints}`
          : ': there are no usable active levels'
      }). Your status MUST be "NO_ENTRY_NEAR" and your reason must read like: "No entry near. Price is at [zone], not at any entry level. Run an Update for a full tactical read." Leave evaluatedLevel/direction/trigger/stop/targets absent.`

  return [
    '# Mission',
    'Produce one `EvalResult` object — an on-demand entry check at the current price against the active entry levels from the prior briefing, per the doctrine in the system prompt.',
    '',
    EVAL_DECISION_LOGIC,
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
    JSON.stringify(input.deltaTelemetry, null, 1),
    '```',
  ].join('\n')
}
