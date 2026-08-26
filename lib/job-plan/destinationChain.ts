import type { DestinationStage, StageExpectation } from '@/knowledge/schema/job-plan.schema'
import type { ConfluenceBand, JobContext } from './contextTypes'
import type { PlayDirectional } from './planTypes'
import { bandLabel, bandName, fmtRange, referenceProvenance } from './playText'
import { WEAK_NODE_PROMINENCE } from './referenceRoles'

/**
 * Destination chains (feat-127, plan step 4): a play's destinations are a
 * CHAIN OF CONDITIONAL STAGES walking outward from the trigger band in the
 * play's direction — each stage a gauge-response checkpoint where the
 * reference may hold, reoffer/rebid, or gate further continuation. Not a
 * flat target array. A gating stage carries the beeline: don't-counter AND
 * the beeline destination (the next stage) together — the two always travel
 * together (07-20 "take that out, beeline to the 2B").
 *
 * Stage selection (an engineering choice, not a ratified number — shadow
 * evaluation retunes it): the nearest {@link MAX_STAGES} bands beyond the
 * trigger band, skipping ladder-rung-only bands (destination-only, R2 — they
 * ride along only when nothing else is out there) and lone low-prominence
 * profile nodes (the roles module's "weak" proxy). Far bands are legitimate
 * destinations (R4 shows them, never arms them). The final stage is where the
 * opposite response is expected — the traverse's realistic conclusion.
 */

export const MAX_STAGES = 3

function beyond(context: JobContext, band: Pick<ConfluenceBand, 'low' | 'high'>, direction: PlayDirectional): ConfluenceBand[] {
  return direction === 'long'
    ? context.bands.filter((b) => b.low > band.high).sort((a, b) => a.low - b.low || a.id.localeCompare(b.id))
    : context.bands.filter((b) => b.high < band.low).sort((a, b) => b.high - a.high || a.id.localeCompare(b.id))
}

function weakNode(band: ConfluenceBand): boolean {
  const anchor = band.members[0]
  return !band.confluence && anchor.node !== null && anchor.node.prominence >= WEAK_NODE_PROMINENCE
}

function chooseStages(candidates: readonly ConfluenceBand[]): ConfluenceBand[] {
  const strong = candidates.filter((b) => !b.destinationOnly && !weakNode(b)).slice(0, MAX_STAGES)
  return strong.length > 0 ? strong : candidates.slice(0, 1)
}

function stageText(band: ConfluenceBand, expect: StageExpectation, direction: PlayDirectional, next: ConfluenceBand | null): string {
  const name = bandName(band)
  const response = direction === 'long' ? 'reoffer' : 'rebid'
  const beyondWord = direction === 'long' ? 'above' : 'below'
  switch (expect) {
    case 'gate-continuation':
      return `Gauge the response at ${name}: a hold / ${response} there ends the traverse; build ${beyondWord} → don't counter, beeline to ${next ? bandName(next) : 'the next stage'}`
    case 'reoffer':
    case 'rebid':
      return `${name}: expect the ${response} — the traverse's realistic conclusion`
    case 'hold':
      return `${name}: destination rung — a pause to gauge, never a trigger (R2)`
  }
}

function toStage(band: ConfluenceBand, order: number, expect: StageExpectation, direction: PlayDirectional, next: ConfluenceBand | null): DestinationStage {
  return {
    order,
    bandId: band.id,
    label: bandLabel(band),
    low: band.low,
    high: band.high,
    expect,
    beeline:
      expect === 'gate-continuation' && next
        ? { dontCounter: true, destinationLabel: bandLabel(next), destinationLow: next.low, destinationHigh: next.high }
        : null,
    text: stageText(band, expect, direction, next),
    provenance: referenceProvenance(band.members),
  }
}

/** The chain beyond `band` in `direction`, ordered in play direction. */
export function destinationChain(
  context: JobContext,
  band: Pick<ConfluenceBand, 'low' | 'high'>,
  direction: PlayDirectional,
): DestinationStage[] {
  const chosen = chooseStages(beyond(context, band, direction))
  return chosen.map((stage, i) => {
    const last = i === chosen.length - 1
    const next = last ? null : chosen[i + 1]
    const expect: StageExpectation = stage.destinationOnly ? 'hold' : last ? (direction === 'long' ? 'reoffer' : 'rebid') : 'gate-continuation'
    return toStage(stage, i + 1, expect, direction, next)
  })
}

/** The flip destination: where price goes if the trigger band gives way (the first stage the other way). */
export function flipDestination(
  context: JobContext,
  band: Pick<ConfluenceBand, 'low' | 'high'>,
  direction: PlayDirectional,
  bandText: string,
): DestinationStage | null {
  const opposite: PlayDirectional = direction === 'long' ? 'short' : 'long'
  const first = chooseStages(beyond(context, band, opposite))[0]
  if (!first) return null
  const beyondWord = direction === 'long' ? 'below' : 'above'
  return {
    order: 1,
    bandId: first.id,
    label: bandLabel(first),
    low: first.low,
    high: first.high,
    expect: 'hold',
    beeline: null,
    text: `${beyondWord} ${bandText} → seek ${bandLabel(first)} ${fmtRange(first.low, first.high)}`,
    provenance: referenceProvenance(first.members),
  }
}
