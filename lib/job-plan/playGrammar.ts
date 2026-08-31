import type { PlayBand, PlayInvalidation, PlayStance, UncertaintyBand } from '@/knowledge/schema/job-plan.schema'
import { wallMsOfString } from './chartClock'
import type { BandOriginFacts, BandRole, ConfluenceBand, JobContext } from './contextTypes'
import { destinationChain, flipDestination } from './destinationChain'
import type { Candidate, Grounding, PlayDirectional, PlayDraft } from './planTypes'
import { bandLabel, bandName, derivedProvenance, fmtPrice, fmtRange, priceEq, referenceProvenance } from './playText'
import { ACCEPTANCE_MINUTES, MID_ZONE_MULTIPLE, r11ResponseDeadline, type PlayCondition } from './rules'

/**
 * The play grammar (feat-127, plan step 4): ONE branch per candidate band,
 * grounded in the freshest origin fact the band carries (R12 order: failed
 * look > approach failure > accepted > holding side > repeated defense) or,
 * with no fact, the band's WATCHED default — never the band × condition
 * product. Condition ↔ fact:
 *
 *   failed look (R5)        → look-and-fail, join the rotation back across
 *   approach failure (R7)   → approach-failure, fade near the stall
 *   accepted (R6)           → build-beyond-continuation, don't counter
 *   holding side (R8) /     → hold-traverse, rebid / reoffer on arrival
 *   repeated defense (R9)
 *   no fact                 → conditional: look-and-fail at a structure edge
 *                             (a JBA-box edge, an overnight / prior-day
 *                             extreme — the corpus's default look-and-fail
 *                             triggers), hold-traverse elsewhere (a pullback
 *                             into the G line / pivot / Rip for bid or offer)
 *
 * Guards that keep a far band from grounding a lean on a trivial fact: the
 * holding side counts only inside the R10 edge-play distance (2× merge) of
 * the band and only when it agrees with which side of price the band sits;
 * acceptance counts only when the band was CROSSED inside the observation
 * window (the run did not start at its first bar). Confirmed initiative
 * (accepted) at a band suppresses any fade at it — one play per band —
 * INCLUDING a fade grounded on an earlier failed look in the acceptance's
 * direction: the look's fail has since been re-broken and accepted beyond
 * (R6), which is that fade's own invalidation clause, so the failed-look
 * fact is void and the band grounds the continuation instead.
 */

/** R9 "repeated defense": at least this many session defenses. */
export const REPEATED_DEFENSE_MIN = 2

const EDGE_SOURCES: ReadonlySet<string> = new Set(['overnight-extreme', 'previous-day-extreme', 'jba-edge'])

const long = (d: PlayDirectional): boolean => d === 'long'
const ms = (wall: string | null): number => (wall === null ? Number.NEGATIVE_INFINITY : (wallMsOfString(wall) ?? Number.NEGATIVE_INFINITY))

function isEnclosingEdge(context: JobContext, band: ConfluenceBand): boolean {
  const zone = context.location.enclosingZone
  return zone !== null && (zone.lowerEdge.bandId === band.id || zone.upperEdge.bandId === band.id)
}

function failedLook(facts: BandOriginFacts, band: ConfluenceBand): Grounding | null {
  const fl = facts.latestFailedLook
  if (fl === null) return null
  // R6 supersedes R5: confirmed acceptance beyond the edge the look failed at
  // means the fail was re-broken and built on — the fade this fact would arm is
  // already dead by its own invalidation clause, so ground the continuation.
  const acc = facts.acceptance
  if (acc.state === 'accepted' && acc.direction === fl.direction) return null
  return {
    kind: 'failed-look',
    direction: fl.direction === 'below' ? 'long' : 'short',
    factAt: fl.endedAt,
    factMs: ms(fl.endedAt),
    evidence: `Looked ${fl.direction} ${bandName(band)} at ${fl.startedAt} (${fl.scope}) to ${fmtPrice(fl.extremePrice)} and failed back inside by ${fl.endedAt ?? '?'} after ${fl.minutes} min — ${fl.grade ?? 'LATE'} (R5)`,
    rulesFired: ['R5'],
    grade: fl.grade,
  }
}

function approachFailure(facts: BandOriginFacts, band: ConfluenceBand): Grounding | null {
  const af = facts.approachFailure
  if (af === null) return null
  return {
    kind: 'approach-failure',
    direction: af.from === 'above' ? 'long' : 'short',
    factAt: af.closestApproachAt,
    factMs: ms(af.closestApproachAt),
    evidence: `Approach from ${af.from} stalled ${fmtPrice(af.closestApproachPts)} pts short of ${bandName(band)} at ${af.closestApproachAt} (${af.scope}, closest ${fmtPrice(af.closestPrice)}) and retreated ${fmtPrice(af.retreatPts)} pts, ${af.minutesSinceClosest} min ago (R7)`,
    rulesFired: ['R7'],
    grade: null,
  }
}

function accepted(facts: BandOriginFacts, band: ConfluenceBand, context: JobContext): Grounding | null {
  const acc = facts.acceptance
  if (acc.state !== 'accepted' || acc.direction === null || acc.sinceAt === null) return null
  if (acc.sinceAt === context.origin.coverage.firstBarAt) return null
  return {
    kind: 'accepted',
    direction: acc.direction === 'above' ? 'long' : 'short',
    factAt: acc.sinceAt,
    factMs: ms(acc.sinceAt),
    evidence: `Accepted ${acc.direction} ${bandName(band)} since ${acc.sinceAt} (${acc.scope ?? 'session'}) — ${acc.minutes} min of completed closes beyond, ≥ ${ACCEPTANCE_MINUTES} (R6)`,
    rulesFired: ['R6'],
    grade: null,
  }
}

function holdingSide(facts: BandOriginFacts, band: ConfluenceBand, role: BandRole, merge: number): Grounding | null {
  const hs = facts.holdingSide
  if (hs === null || hs.side === 'STRADDLING') return null
  if (role.distancePts > MID_ZONE_MULTIPLE * merge) return null
  const direction: PlayDirectional = hs.side === 'ABOVE' ? 'long' : 'short'
  if ((direction === 'long' && role.side === 'above') || (direction === 'short' && role.side === 'below')) return null
  return {
    kind: 'holding-side',
    direction,
    factAt: hs.to,
    factMs: ms(hs.to),
    evidence: `Holding ${hs.side} ${bandName(band)}: every completed close ${hs.from}–${hs.to} (${hs.closes} closes, ${hs.scope}) on that side (R8)`,
    rulesFired: ['R8'],
    grade: null,
  }
}

function sideDirection(role: BandRole): PlayDirectional | null {
  return role.side === 'below' ? 'long' : role.side === 'above' ? 'short' : null
}

function defense(facts: BandOriginFacts, band: ConfluenceBand, role: BandRole): Grounding | null {
  const count = facts.interaction.defenses.session
  const direction = sideDirection(role)
  if (count < REPEATED_DEFENSE_MIN || direction === null) return null
  return {
    kind: 'defense',
    direction,
    factAt: facts.interaction.lastAt,
    factMs: ms(facts.interaction.lastAt),
    evidence: `Defended ${count}× this session at ${bandName(band)} (last print ${facts.interaction.lastAt ?? '?'}) — prints in, closes back out (R9)`,
    rulesFired: ['R9'],
    grade: null,
  }
}

function watched(candidate: Candidate): Grounding | null {
  const direction = sideDirection(candidate.role)
  if (direction === null) return null
  return {
    kind: 'none',
    direction,
    factAt: null,
    factMs: Number.NEGATIVE_INFINITY,
    evidence: `No origin fact at ${bandName(candidate.band)} yet (${candidate.why}, ${candidate.role.role}, ${fmtPrice(candidate.role.distancePts)} pts ${candidate.role.side}) — conditional on arrival and response`,
    rulesFired: [],
    grade: null,
  }
}

/** The freshest origin fact in R12 order, else the watched default; null when the band has no directional read. */
export function ground(candidate: Candidate, context: JobContext): Grounding | null {
  const { band, role, facts } = candidate
  return (
    failedLook(facts, band) ??
    approachFailure(facts, band) ??
    accepted(facts, band, context) ??
    holdingSide(facts, band, role, context.tolerance.merge) ??
    defense(facts, band, role) ??
    watched(candidate)
  )
}

function conditionFor(grounding: Grounding, candidate: Candidate): PlayCondition {
  switch (grounding.kind) {
    case 'failed-look':
      return 'look-and-fail'
    case 'approach-failure':
      return 'approach-failure'
    case 'accepted':
      return 'build-beyond-continuation'
    case 'holding-side':
    case 'defense':
      return 'hold-traverse'
    case 'none':
      return candidate.band.members.some((m) => EDGE_SOURCES.has(m.source)) ? 'look-and-fail' : 'hold-traverse'
  }
}

function stanceFor(condition: PlayCondition, direction: PlayDirectional): PlayStance {
  if (condition === 'build-beyond-continuation') return 'continuation'
  return long(direction) ? 'rebid' : 'reoffer'
}

function triggerText(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand, g: Grounding): string {
  const name = bandName(band)
  const isLong = long(direction)
  switch (condition) {
    case 'hold-traverse':
      return `${isLong ? 'Rebid' : 'Reoffer'} ${name} on the arrival from ${isLong ? 'above' : 'below'} — the band holds → traverse`
    case 'look-and-fail':
      return `Look ${isLong ? 'below' : 'above'} ${name} and fail — the first close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} → join the rotation back across`
    case 'build-beyond-continuation':
      return `${g.evidence.split(' — ')[0]} → get on board ${direction}; don't counter until back inside`
    case 'approach-failure':
      return `Can't make progress to ${name} → ${isLong ? 'get long' : 'get short'} near the stall, target back across`
    case 'mid-zone-two-way':
      return name
  }
}

function invalidationFor(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand, context: JobContext): PlayInvalidation {
  const isLong = long(direction)
  const continuation = condition === 'build-beyond-continuation'
  // A fade is invalidated by acceptance beyond the far edge; a continuation by a close back inside.
  const price = continuation ? (isLong ? band.high : band.low) : isLong ? band.low : band.high
  const text = continuation
    ? `A completed close back inside ${bandName(band)} (${isLong ? '≤' : '≥'} ${fmtPrice(price)}) ends the continuation — counter only then`
    : `Acceptance ${isLong ? 'below' : 'above'} ${fmtPrice(price)} — completed exec-bar closes beyond for ${ACCEPTANCE_MINUTES} min (R6) — invalidates the ${isLong ? 'rebid' : 'reoffer'}`
  return {
    low: price,
    high: price,
    side: isLong ? 'below' : 'above',
    condition: text,
    thenSeek: flipDestination(context, band, direction, `${fmtPrice(price)} (${bandLabel(band)})`),
    provenance: referenceProvenance(band.members.filter((m) => priceEq(m.price, price))),
  }
}

function dontFor(condition: PlayCondition, direction: PlayDirectional, band: ConfluenceBand): string {
  const isLong = long(direction)
  const name = bandName(band)
  switch (condition) {
    case 'hold-traverse':
      return `Don't ${isLong ? 'buy' : 'sell'} ahead of ${name} and don't chase through it — wait for the arrival and the hold`
    case 'look-and-fail':
      return `Don't fade the break itself: no ${direction} until the close back ${isLong ? 'above' : 'below'} ${fmtPrice(isLong ? band.low : band.high)} — a build ${isLong ? 'below' : 'above'} is continuation, not a fade`
    case 'build-beyond-continuation':
      return `Don't counter until price is back inside ${name} (a completed close ${isLong ? 'below' : 'above'} ${fmtPrice(isLong ? band.high : band.low)})`
    case 'approach-failure':
      return `Don't wait for ${name} itself — the stall short of it is the trigger; if price does reach the band, stand aside and re-read`
    case 'mid-zone-two-way':
      return 'Don\'t trade full size in the middle — wait for the edges'
  }
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
  switch (condition) {
    case 'hold-traverse':
      return `${isLong ? 'Rebid' : 'Reoffer'} ${range} into ${bandLabel(band)} → ${chain || 'gauge the response'}${flip}`
    case 'look-and-fail':
      return `Look-${isLong ? 'below' : 'above'}-and-fail at ${bandLabel(band)} ${range} → rotate back across: ${chain || 'to the far edge'}${flip}`
    case 'build-beyond-continuation':
      return `Build ${isLong ? 'above' : 'below'} ${bandLabel(band)} ${range} → attack ${chain || 'the next structure'}${flip}`
    case 'approach-failure':
      return `Can't reach ${bandLabel(band)} ${range} → ${isLong ? 'get long' : 'get short'} near the stall, target ${chain || 'back across'}${flip}`
    case 'mid-zone-two-way':
      return range
  }
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

/** One play for one candidate band, or the reason when the band has no directional read. */
export function buildBandPlay(candidate: Candidate, context: JobContext): { draft: PlayDraft } | { pruned: string } {
  const grounding = ground(candidate, context)
  if (grounding === null) return { pruned: 'price inside the band with no directional read (no fact, no holding side)' }
  const { band, role, facts } = candidate
  const condition = conditionFor(grounding, candidate)
  const direction = grounding.direction
  const demoted = facts.interaction.triggerStatus === 'demoted' && condition !== 'build-beyond-continuation'
  const destinations = destinationChain(context, band, direction)
  const invalidation = invalidationFor(condition, direction, band, context)
  const rulesFired = [...grounding.rulesFired, ...(condition === 'hold-traverse' ? (['R11'] as const) : []), ...(demoted ? (['R9'] as const) : []), 'R12'] as const

  return {
    draft: {
      stance: stanceFor(condition, direction),
      direction,
      condition,
      band: playBand(candidate),
      trigger: triggerText(condition, direction, band, grounding),
      activation: {
        state: grounding.kind === 'none' ? 'conditional' : 'armed',
        grounding: grounding.kind,
        evidence: demoted ? `${grounding.evidence}; touched this session without a failed look or defense — demoted as a fresh trigger (R9)` : grounding.evidence,
        factAt: grounding.factAt,
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
        factMs: grounding.factMs,
        enclosingEdge: isEnclosingEdge(context, band),
        distancePts: role.distancePts,
        bandKey: band.id,
      },
    },
  }
}

export { isEnclosingEdge }
