import type { PlayBand, PlayInvalidation, PlayStance, UncertaintyBand } from '@/knowledge/schema/job-plan.schema'
import type { ConfluenceBand, JobContext } from './contextTypes'
import { destinationChain, flipDestination } from './destinationChain'
import { frameDirection } from './planFrame'
import type { Candidate, PlayDirectional, PlayDraft, PlanFrameInput } from './planTypes'
import { bandLabel, bandName, derivedProvenance, fmtPrice, fmtRange, priceEq, referenceProvenance } from './playText'
import { ACCEPTANCE_MINUTES, r2Significance, r11ResponseDeadline, type PlayCondition } from './rules'

/**
 * The play grammar, rebuilt 2026-08-31 to the operator's correction of the
 * feat-127 origin-facts design: every directional play is a FORWARD
 * CONDITIONAL — the expected response at a key area if price reaches it —
 * never a branch armed off a completed session fact. "A look above and fail
 * is what he's looking to HAVE HAPPEN at the levels he's identifying if
 * price reaches there. He's not looking for examples where it already
 * happened and then using those as levels."
 *
 * One play per candidate band, the prep fork at each (both outcomes always
 * stated, 25/25 transcripts):
 *
 *   arrival + response      → the fade holds → traverse back across, gauge
 *                             each stage for continuation (destinationChain)
 *   sweep beyond + fail     → the stronger green light at a structure edge
 *                             (overnight / prior-day extreme, JBA edge) —
 *                             join the rotation back across (look-and-fail)
 *   breach + build beyond   → the play is off: don't counter, go with it to
 *                             the flip destination (invalidation.thenSeek);
 *                             past a major line it accelerates ("rubber
 *                             meets the road", "off to the races")
 *
 * Direction comes from geometry alone: a band above price is watched for
 * offer, below for bid; a band price sits inside leans with the frame (the
 * side of the G line / weekly pivot price is on) — with no frame direction
 * there is no read and the band is pruned. R9 freshness survives as a
 * demotion qualifier (06-17 "open to a rebid scenario if we haven't already
 * interacted with this"), never as grounds to arm.
 */

const EDGE_SOURCES: ReadonlySet<string> = new Set(['overnight-extreme', 'previous-day-extreme', 'jba-edge'])

/** Sources whose give-way accelerates in the preps ("below the G line, off to the races"). */
const ACCELERATION_SOURCES: ReadonlySet<string> = new Set(['g-line', 'weekly-job-pivot', 'jba-edge'])

const long = (d: PlayDirectional): boolean => d === 'long'

function isEnclosingEdge(context: JobContext, band: ConfluenceBand): boolean {
  const zone = context.location.enclosingZone
  return zone !== null && (zone.lowerEdge.bandId === band.id || zone.upperEdge.bandId === band.id)
}

function sideDirection(side: 'above' | 'below' | 'inside', frame: PlanFrameInput): PlayDirectional | null {
  if (side === 'below') return 'long'
  if (side === 'above') return 'short'
  return frameDirection(frame)
}

function conditionFor(candidate: Candidate): PlayCondition {
  return candidate.band.members.some((m) => EDGE_SOURCES.has(m.source)) ? 'look-and-fail' : 'hold-traverse'
}

function stanceFor(direction: PlayDirectional): PlayStance {
  return long(direction) ? 'rebid' : 'reoffer'
}

function triggerText(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand, inside: boolean): string {
  const name = bandName(band)
  const isLong = long(direction)
  if (condition === 'look-and-fail') {
    return `Look ${isLong ? 'below' : 'above'} ${name} and fail — the first close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} → join the rotation back across`
  }
  if (inside) {
    return `Lean ${isLong ? 'on' : 'against'} ${name} from here — the ${isLong ? 'bid holds' : 'offer steps in'} → traverse; a look ${isLong ? 'below' : 'above'} and fail is the stronger green light`
  }
  return `${isLong ? 'Rebid' : 'Reoffer'} ${name} on the arrival from ${isLong ? 'above' : 'below'} — the band holds → traverse; a look ${isLong ? 'below' : 'above'} and fail is the stronger green light`
}

function expectationEvidence(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand, candidate: Candidate): string {
  const isLong = long(direction)
  const response = isLong ? 'bid' : 'offer'
  const where = candidate.role.side === 'inside' ? 'price is at it now' : `${fmtPrice(candidate.role.distancePts)} pts ${candidate.role.side}`
  const base =
    condition === 'look-and-fail'
      ? `Expect the ${response} at ${bandName(band)} (${where}) — a sweep beyond that fails is the trigger, not the arrival alone`
      : `Expect the ${response} at ${bandName(band)} (${where}) — gauge the response on arrival before joining`
  return candidate.facts.interaction.triggerStatus === 'demoted'
    ? `${base}; already interacted this session without producing a fail or a defense — demoted as a fresh trigger (R9)`
    : base
}

function invalidationFor(direction: PlayDirectional, band: ConfluenceBand, context: JobContext): PlayInvalidation {
  const isLong = long(direction)
  const price = isLong ? band.low : band.high
  const accelerates = band.members.some((m) => ACCELERATION_SOURCES.has(m.source))
  const go = accelerates
    ? "the rubber meets the road — don't counter, go with it"
    : "don't counter — go with it"
  return {
    low: price,
    high: price,
    side: isLong ? 'below' : 'above',
    condition: `Build ${isLong ? 'below' : 'above'} ${fmtPrice(price)} — completed exec-bar closes beyond for ${ACCEPTANCE_MINUTES} min (R6) — and the ${isLong ? 'rebid' : 'reoffer'} is off: ${go}`,
    thenSeek: flipDestination(context, band, direction, `${fmtPrice(price)} (${bandLabel(band)})`),
    provenance: referenceProvenance(band.members.filter((m) => priceEq(m.price, price))),
  }
}

function dontFor(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand): string {
  const isLong = long(direction)
  const name = bandName(band)
  if (condition === 'look-and-fail') {
    return `Don't fade the break itself: no ${direction} until the close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} — a build ${isLong ? 'below' : 'above'} is continuation, not a fade`
  }
  return `Don't ${isLong ? 'buy' : 'sell'} ahead of ${name} and don't chase through it — wait for the arrival and the response`
}

/** The 08-11 shape: `press A → press B; build above → C` — gates to press, the final stage as the beeline's end. */
function chainText(draft: Pick<PlayDraft, 'destinations'>, isLong: boolean): string {
  const stages = draft.destinations
  if (stages.length === 0) return ''
  const gates = stages.filter((s) => s.expect === 'gate-continuation')
  const final = stages[stages.length - 1]
  const press = gates.map((s) => `press ${s.label} ${fmtRange(s.low, s.high)}`).join(' → ')
  const end = final.expect === 'gate-continuation' ? '' : `${final.label} ${fmtRange(final.low, final.high)}`
  if (gates.length === 0) return end
  return end ? `${press}; build ${isLong ? 'above' : 'below'} → ${end}` : press
}

function summaryFor(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand, draft: Pick<PlayDraft, 'destinations' | 'invalidation'>): string {
  const isLong = long(direction)
  const range = fmtRange(band.low, band.high)
  const chain = chainText(draft, isLong)
  const flip = draft.invalidation.thenSeek ? `; ${draft.invalidation.thenSeek.text}` : ''
  if (condition === 'look-and-fail') {
    return `Look-${isLong ? 'below' : 'above'}-and-fail at ${bandLabel(band)} ${range} → rotate back across: ${chain || 'to the far edge'}${flip}`
  }
  return `${isLong ? 'Rebid' : 'Reoffer'} ${range} into ${bandLabel(band)} → ${chain || 'gauge the response'}${flip}`
}

function uncertaintyFor(band: ConfluenceBand, context: JobContext): UncertaintyBand | null {
  const edge = band.members.find((m) => m.source === 'jba-edge')
  if (!edge || !context.dataQuality.boxesProvisional) return null
  const merge = context.tolerance.merge
  return {
    kind: 'box-expansion',
    uiOnly: true,
    low: edge.price - merge,
    high: edge.price + merge,
    text: `${edge.label} ${fmtPrice(edge.price)} is provisional (export before the RTH open) — the box may reform; expansion allowance ± ${merge} is display only, the trigger stays the exported edge`,
    provenance: derivedProvenance([edge], `${edge.label} ± merge tolerance ${merge}`),
  }
}

function playBand(candidate: Candidate): PlayBand {
  const { band, role, facts } = candidate
  return {
    bandId: band.id,
    label: bandLabel(band),
    low: band.low,
    high: band.high,
    anchorSource: band.anchorSource,
    memberLabels: band.members.map((m) => m.label),
    role: role.role,
    side: role.side,
    distancePts: role.distancePts,
    triggerStatus: facts.interaction.triggerStatus,
    provenance: referenceProvenance(band.members),
  }
}

/** One forward-conditional play for one candidate band, or the reason when the band has no directional read. */
export function buildBandPlay(candidate: Candidate, context: JobContext, frame: PlanFrameInput): { draft: PlayDraft } | { pruned: string } {
  const { band, role, facts } = candidate
  const direction = sideDirection(role.side, frame)
  if (direction === null) return { pruned: 'price inside the band with no frame direction — no directional read' }
  const condition = conditionFor(candidate)
  const demoted = facts.interaction.triggerStatus === 'demoted'
  const destinations = destinationChain(context, band, direction)
  const invalidation = invalidationFor(direction, band, context)
  const rulesFired = ['R12' as const, ...(condition === 'hold-traverse' ? (['R11'] as const) : []), ...(demoted ? (['R9'] as const) : [])]

  return {
    draft: {
      stance: stanceFor(direction),
      direction,
      condition,
      band: playBand(candidate),
      trigger: triggerText(condition, direction, band, role.side === 'inside'),
      activation: {
        state: 'conditional',
        grounding: 'none',
        evidence: expectationEvidence(condition, direction, band, candidate),
        factAt: null,
        asOf: facts.asOf,
        rulesFired: [...new Set(rulesFired)],
        demoted,
      },
      invalidation,
      destinations,
      responseDeadline: r11ResponseDeadline(condition, bandName(band)),
      dont: dontFor(condition, direction, band),
      uncertaintyBand: uncertaintyFor(band, context),
      summary: summaryFor(condition, direction, band, { destinations, invalidation }),
      precedence: {
        tier: 0,
        aligned: frameDirection(frame) === null || direction === frameDirection(frame),
        enclosingEdge: isEnclosingEdge(context, band),
        significance: r2Significance(band.anchorSource),
        distancePts: role.distancePts,
        bandKey: band.id,
      },
    },
  }
}

export { isEnclosingEdge }
