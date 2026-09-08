import type { DestinationStage, PlayBand, PlayDirection, PlayInvalidation, PlayStance, UncertaintyBand } from '@/knowledge/schema/job-plan.schema'
import type { ConfluenceBand, JobContext } from './contextTypes'
import { destinationChain, flipDestination } from './destinationChain'
import { biasDirection, frameSideOf, isCounterBiasFail, isForkPlay, isPrimaryDirection, legalDirections, playShape, readAgainstFrame, twoWayLegal, type FrameRead, type PlayShape } from './frameRelation'
import type { Candidate, PlayDirectional, PlayDraft, PlanFrameInput } from './planTypes'
import { bandLabel, bandName, derivedProvenance, fmtPrice, fmtRange, priceEq, referenceProvenance } from './playText'
import { ACCEPTANCE_MINUTES, r2Significance, r11ResponseDeadline, type PlayCondition } from './rules'

/**
 * The play grammar, rebuilt 2026-08-31 to the operator's correction of the
 * feat-127 origin-facts design: every directional play is a FORWARD
 * CONDITIONAL — the expected response at a key area if price reaches it —
 * never a branch armed off a completed session fact.
 *
 * feat-149 (operator, 2026-09-07 eve): plays are read against the FRAME
 * (`frameRelation.ts`), not against price, and come in two shapes:
 *
 *   arrival       the fade on arrival — rebid a pullback on the bias side
 *                 (the line included); the prep fork at each: hold → traverse,
 *                 sweep-and-fail at an edge → join the rotation, build
 *                 beyond → the play is off, go with it (invalidation.thenSeek).
 *                 At an unreached level beyond price the counter-bias fade is
 *                 the FAIL only ("a JBA border overhead could also be a short")
 *   continuation  the hold AFTER a break, never the break itself — "price has
 *                 to break it and hold to get in": a bias-direction level past
 *                 price, or the fork side once the line is lost (the line's
 *                 own reoffer, then each level beyond it, conditional on the
 *                 last: "if price breaks the filter line, then another
 *                 important level, a pullback to that level could be a play")
 *
 * R9 freshness survives as a demotion qualifier, never as grounds to arm.
 */

const EDGE_SOURCES: ReadonlySet<string> = new Set(['overnight-extreme', 'previous-day-extreme', 'jba-edge'])

/** Sources whose give-way accelerates in the preps ("below the G line, off to the races"). */
const ACCELERATION_SOURCES: ReadonlySet<string> = new Set(['g-line', 'weekly-job-pivot', 'jba-edge'])

const long = (d: PlayDirectional): boolean => d === 'long'

function isEnclosingEdge(context: JobContext, band: ConfluenceBand): boolean {
  const zone = context.location.enclosingZone
  return zone !== null && (zone.lowerEdge.bandId === band.id || zone.upperEdge.bandId === band.id)
}

function conditionFor(candidate: Candidate, shape: PlayShape, counterBiasFail: boolean): PlayCondition {
  if (shape === 'continuation') return 'build-beyond-continuation'
  if (counterBiasFail) return 'look-and-fail'
  return candidate.band.members.some((m) => EDGE_SOURCES.has(m.source)) ? 'look-and-fail' : 'hold-traverse'
}

function stanceFor(direction: PlayDirectional, shape: PlayShape): PlayStance {
  if (shape === 'continuation') return 'continuation'
  return long(direction) ? 'rebid' : 'reoffer'
}

type Shaped = {
  readonly direction: PlayDirectional
  readonly shape: PlayShape
  /** The play only comes alive once the frame line is lost. */
  readonly fork: boolean
  readonly frameLabel: string | null
}

function forkPrefix(s: Shaped): string {
  return s.fork && s.frameLabel ? `Only once price has lost the ${s.frameLabel}: ` : ''
}

function triggerText(condition: PlayCondition, s: Shaped, band: ConfluenceBand, inside: boolean): string {
  const name = bandName(band)
  const isLong = long(s.direction)
  if (s.shape === 'continuation') {
    const beyond = isLong ? 'above' : 'below'
    const edge = fmtPrice(isLong ? band.high : band.low)
    return `${forkPrefix(s)}Break ${beyond} ${name} and HOLD — completed exec-bar closes ${beyond} ${edge} for ${ACCEPTANCE_MINUTES} min (R6) — then the pullback into it that holds is the ${isLong ? 'long' : 'short'}; the trade is the hold after the break, never the break itself`
  }
  if (condition === 'look-and-fail') {
    return `${forkPrefix(s)}Look ${isLong ? 'below' : 'above'} ${name} and fail — the first close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} → join the rotation back across`
  }
  if (inside) {
    return `Lean ${isLong ? 'on' : 'against'} ${name} from here — the ${isLong ? 'bid holds' : 'offer steps in'} → traverse; a look ${isLong ? 'below' : 'above'} and fail is the stronger green light`
  }
  return `${isLong ? 'Rebid' : 'Reoffer'} ${name} on the arrival from ${isLong ? 'above' : 'below'} — the band holds → traverse; a look ${isLong ? 'below' : 'above'} and fail is the stronger green light`
}

function expectationEvidence(condition: PlayCondition, s: Shaped, band: ConfluenceBand, candidate: Candidate): string {
  const isLong = long(s.direction)
  const response = isLong ? 'bid' : 'offer'
  const where = candidate.role.side === 'inside' ? 'price is at it now' : `${fmtPrice(candidate.role.distancePts)} pts ${candidate.role.side}`
  const base =
    s.shape === 'continuation'
      ? `${forkPrefix(s)}Expect continuation through ${bandName(band)} (${where}) — in only on the hold after the break, and the pullback that respects it`
      : condition === 'look-and-fail'
        ? `Expect the ${response} at ${bandName(band)} (${where}) — a sweep beyond that fails is the trigger, not the arrival alone`
        : `Expect the ${response} at ${bandName(band)} (${where}) — gauge the response on arrival before joining`
  return candidate.facts.interaction.triggerStatus === 'demoted'
    ? `${base}; already interacted this session without producing a fail or a defense — demoted as a fresh trigger (R9)`
    : base
}

function invalidationFor(s: Shaped, band: ConfluenceBand, context: JobContext): PlayInvalidation {
  const isLong = long(s.direction)
  const price = isLong ? band.low : band.high
  const accelerates = band.members.some((m) => ACCELERATION_SOURCES.has(m.source))
  const go = accelerates
    ? "the rubber meets the road — don't counter, go with it"
    : "don't counter — go with it"
  const condition =
    s.shape === 'continuation'
      ? `Fail back ${isLong ? 'below' : 'above'} ${fmtPrice(price)} — the hold is lost — and the continuation is off: ${go}`
      : `Build ${isLong ? 'below' : 'above'} ${fmtPrice(price)} — completed exec-bar closes beyond for ${ACCEPTANCE_MINUTES} min (R6) — and the ${isLong ? 'rebid' : 'reoffer'} is off: ${go}`
  return {
    low: price,
    high: price,
    side: isLong ? 'below' : 'above',
    condition,
    thenSeek: flipDestination(context, band, s.direction, `${fmtPrice(price)} (${bandLabel(band)})`),
    provenance: referenceProvenance(band.members.filter((m) => priceEq(m.price, price))),
  }
}

function dontFor(condition: PlayCondition, s: Shaped, band: ConfluenceBand): string {
  const isLong = long(s.direction)
  const name = bandName(band)
  if (s.shape === 'continuation') {
    return `Don't ${isLong ? 'buy' : 'sell'} the break itself — no ${s.direction} until closes ${isLong ? 'above' : 'below'} ${name} have held; a break that fails back is the other side's trade`
  }
  if (condition === 'look-and-fail') {
    return `Don't fade the break itself: no ${s.direction} until the close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} — a build ${isLong ? 'below' : 'above'} is continuation, not a fade`
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

function summaryFor(condition: PlayCondition, s: Shaped, band: ConfluenceBand, draft: Pick<PlayDraft, 'destinations' | 'invalidation'>): string {
  const isLong = long(s.direction)
  const range = fmtRange(band.low, band.high)
  const chain = chainText(draft, isLong)
  const flip = draft.invalidation.thenSeek ? `; ${draft.invalidation.thenSeek.text}` : ''
  if (s.shape === 'continuation') {
    const lead = s.fork && s.frameLabel ? `Lose the ${s.frameLabel} → ` : ''
    return `${lead}Break-and-hold ${isLong ? 'above' : 'below'} ${bandLabel(band)} ${range}, ${isLong ? 'buy' : 'sell'} the pullback → ${chain || 'gauge the hold'}${flip}`
  }
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

function composePlay(candidate: Candidate, context: JobContext, frame: PlanFrameInput, read: FrameRead | null, direction: PlayDirectional): PlayDraft {
  const { band, role, facts } = candidate
  const shape = playShape(read, direction)
  const s: Shaped = { direction, shape, fork: isForkPlay(read, direction), frameLabel: frame?.label ?? null }
  const condition = conditionFor(candidate, shape, isCounterBiasFail(read, direction))
  const demoted = facts.interaction.triggerStatus === 'demoted'
  const destinations = destinationChain(context, band, direction)
  const invalidation = invalidationFor(s, band, context)
  const rulesFired = ['R12' as const, ...(condition === 'hold-traverse' ? (['R11'] as const) : []), ...(demoted ? (['R9'] as const) : [])]
  const bias = biasDirection(frame)
  return {
    stance: stanceFor(direction, shape),
    direction,
    condition,
    band: playBand(candidate),
    trigger: triggerText(condition, s, band, role.side === 'inside'),
    activation: {
      state: 'conditional',
      grounding: 'none',
      evidence: expectationEvidence(condition, s, band, candidate),
      factAt: null,
      asOf: facts.asOf,
      rulesFired: [...new Set(rulesFired)],
      demoted,
    },
    invalidation,
    destinations,
    responseDeadline: r11ResponseDeadline(condition, bandName(band)),
    dont: dontFor(condition, s, band),
    uncertaintyBand: uncertaintyFor(band, context),
    summary: summaryFor(condition, s, band, { destinations, invalidation }),
    precedence: {
      tier: 0,
      aligned: bias === null || direction === bias,
      primary: isPrimaryDirection(read, direction),
      continuation: shape === 'continuation',
      frameSide: frameSideOf(read, direction),
      enclosingEdge: isEnclosingEdge(context, band),
      significance: r2Significance(band.anchorSource),
      distancePts: role.distancePts,
      bandKey: band.id,
    },
  }
}

/**
 * feat-152: the TWO-WAY play — one slot, both reads, at an unreached
 * important level (beyond price on the bias side, or an important level on
 * the far side): the fail against the line's direction AND the break-and-hold
 * with it. Destinations carry the first stage of each leg (ascending, the
 * schema's two-way order); the invalidation is 'either' — acceptance one way
 * resolves the two-way into that leg. The fail leg leads the text at a
 * stacked level (`fadeFirst`), the hold leg at a lone one.
 */
function composeTwoWay(candidate: Candidate, context: JobContext, frame: PlanFrameInput, read: FrameRead): PlayDraft {
  const { band, role, facts } = candidate
  const holdDir = read.directions[0]
  const failDir = read.directions[1]
  const holdLong = long(holdDir)
  const fork = read.relation === 'far'
  const prefix = fork && frame?.label ? `Only once price has lost the ${frame.label}: ` : ''
  const name = bandName(band)
  const beyond = holdLong ? 'above' : 'below'
  const back = holdLong ? 'below' : 'above'
  const failFirst = read.fadeFirst
  const failStage = destinationChain(context, band, failDir)[0] ?? null
  const holdStage = destinationChain(context, band, holdDir)[0] ?? null
  const leg = (stage: DestinationStage | null, kind: 'fail' | 'hold'): DestinationStage | null =>
    stage === null
      ? null
      : {
          // the leg's own first stage, its expectation and beeline intact — only the text names the leg
          ...stage,
          text: `${kind === 'fail' ? `Fail leg (${failDir})` : `Hold leg (${holdDir})`}: ${stage.text}`,
        }
  const destinations = [leg(failStage, 'fail'), leg(holdStage, 'hold')]
    .filter((d): d is DestinationStage => d !== null)
    .sort((a, b) => a.low - b.low)
    .map((d, i) => ({ ...d, order: i + 1 }))
  const failText = `a look ${beyond} ${name} that fails back → ${failDir} back across${failStage ? ` toward ${failStage.label}` : ''}`
  const holdText = `break ${beyond} ${name} and HOLD — completed exec-bar closes ${beyond} ${fmtPrice(holdLong ? band.high : band.low)} for ${ACCEPTANCE_MINUTES} min (R6) — then the pullback into it that holds is the ${holdDir}${holdStage ? ` toward ${holdStage.label}` : ''}`
  const legs = failFirst ? [failText, holdText] : [holdText, failText]
  const where = role.side === 'inside' ? 'price is at it now' : `${fmtPrice(role.distancePts)} pts ${role.side}`
  const demoted = facts.interaction.triggerStatus === 'demoted'
  const evidenceBase = `${prefix}Expect a decision at ${name} (${where}) — the fail against the line or the hold beyond it, ${failFirst ? 'the fail first at a level this stacked' : 'the hold first at a lone level'}; both reads stay on the table until price decides`
  const invalidation: PlayInvalidation = {
    low: band.low,
    high: band.high,
    side: 'either',
    condition: `Acceptance resolves it: closes ${beyond} ${name} for ${ACCEPTANCE_MINUTES} min (R6) → the hold leg is on and the fail leg is off; a sweep that fails back ${back} → the fail leg is on; a build ${back} without the look → neither, don't counter`,
    thenSeek: null,
    provenance: referenceProvenance(band.members),
  }
  const bias = biasDirection(frame)
  return {
    stance: 'two-way',
    direction: 'two-way',
    condition: 'fail-or-hold',
    band: playBand(candidate),
    trigger: `${prefix}Two-way at ${name}: ${legs[0]}; or ${legs[1]}`,
    activation: {
      state: 'conditional',
      grounding: 'none',
      evidence: demoted ? `${evidenceBase}; already interacted this session without producing a fail or a defense — demoted as a fresh trigger (R9)` : evidenceBase,
      factAt: null,
      asOf: facts.asOf,
      rulesFired: demoted ? ['R12', 'R9'] : ['R12'],
      demoted,
    },
    invalidation,
    destinations,
    responseDeadline: null,
    dont: `Don't pick a side ahead of the response at ${name}: no ${holdDir} until closes ${beyond} have held, no ${failDir} until the look ${beyond} has failed back`,
    uncertaintyBand: uncertaintyFor(band, context),
    summary: `${prefix}Two-way at ${name} — ${failFirst ? 'fail' : 'break-and-hold'} first: ${failFirst ? `${failDir} on the fail back across${failStage ? ` toward ${failStage.label} ${fmtRange(failStage.low, failStage.high)}` : ''}; break-and-hold ${beyond} → ${holdDir}${holdStage ? ` toward ${holdStage.label} ${fmtRange(holdStage.low, holdStage.high)}` : ''}` : `${holdDir} on the hold ${beyond}${holdStage ? ` toward ${holdStage.label} ${fmtRange(holdStage.low, holdStage.high)}` : ''}; a fail back across → ${failDir}${failStage ? ` toward ${failStage.label} ${fmtRange(failStage.low, failStage.high)}` : ''}`}`,
    precedence: {
      tier: 0,
      aligned: bias === null || holdDir === bias || fork,
      primary: true,
      continuation: false,
      frameSide: fork ? 'fork' : 'bias',
      enclosingEdge: isEnclosingEdge(context, band),
      significance: r2Significance(band.anchorSource),
      distancePts: role.distancePts,
      bandKey: band.id,
    },
  }
}

const NO_READ = 'price inside the band with no frame direction — no directional read'
const NOT_TWO_WAY = 'two-way is a read only at an unreached important level (beyond price on the bias side, or an important level on the far side)'
const LINE_ASSUMED = 'the frame line is two-way by assumption (rebid while it holds, reoffer once lost) — never a play of its own (feat-151)'

/**
 * The deterministic read of one candidate band under the frame: ONE draft —
 * a directional play, or (feat-152) the two-way play where both reads are
 * legal (an unreached important level) — or the reason there is none. The
 * line yields none (feat-151).
 */
export function buildBandPlays(candidate: Candidate, context: JobContext, frame: PlanFrameInput): { drafts: PlayDraft[] } | { pruned: string } {
  const read = readAgainstFrame(candidate.band, candidate.role.side, frame)
  const directions = legalDirections(candidate.band, candidate.role.side, frame)
  if (directions.length === 0) return { pruned: read?.relation === 'line' ? LINE_ASSUMED : NO_READ }
  if (read !== null && twoWayLegal(read)) return { drafts: [composeTwoWay(candidate, context, frame, read)] }
  return { drafts: directions.map((direction) => composePlay(candidate, context, frame, read, direction)) }
}

/** One play for one candidate band in a REQUESTED direction — long, short, or two-way (the LLM assembler) — or the reason it is not legal. */
export function buildBandPlay(candidate: Candidate, context: JobContext, frame: PlanFrameInput, direction: PlayDirection): { draft: PlayDraft } | { pruned: string } {
  const read = readAgainstFrame(candidate.band, candidate.role.side, frame)
  const directions = legalDirections(candidate.band, candidate.role.side, frame)
  if (directions.length === 0) return { pruned: read?.relation === 'line' ? LINE_ASSUMED : NO_READ }
  if (direction === 'two-way') {
    return read !== null && twoWayLegal(read) ? { draft: composeTwoWay(candidate, context, frame, read) } : { pruned: NOT_TWO_WAY }
  }
  if (!directions.includes(direction)) {
    return { pruned: `${direction} is not a legal read at this band (${read?.relation ?? 'geometry'} — ${directions.join('/')})` }
  }
  return { draft: composePlay(candidate, context, frame, read, direction) }
}

export { isEnclosingEdge }
