import type { BandOriginFacts, JobContext } from '../contextTypes'
import { frameCandidates, type FrameCandidate } from '../frameCandidates'
import { distributionEdgeText, fadeFirst, importantReasons, isImportantLevel } from '../frameRelation'
import { bandLabel } from '../playText'
import { tapeBarLine } from '../sessionTape'

/**
 * Serialize the `JobContext` into the compact payload the LLM shadow planner
 * judges from (feat-144). Everything is measured by code and injected — the
 * prompt text itself stays number-free. Deliberately id-keyed: the model
 * answers in `bandId` / `referenceId`, so every level it names traces back
 * here by construction.
 *
 * The payload carries MORE than the deterministic candidate set on purpose:
 * all bands with their roles (reach is guidance for the model, a wall for
 * R12), so judgment like "the farther weekly pivot over the nearer minor
 * line" is expressible.
 *
 * Session history (feat-154, operator 2026-09-09): each band carries its
 * measured `interaction` (prints, first/last touch, defenses, holding side)
 * beside the R9 `triggerStatus`, and the payload carries the `sessionTape` —
 * this trading day's completed 30-min bars since the Globex open — so the
 * model can see where price has been. Both are context for the judgment,
 * never a reason for a play (the output rules still forbid restating history
 * as justification) and never a level source (bar prices are not known prices
 * for the invented-price gate).
 */

/**
 * A frame candidate as the model sees it (feat-148): a BAND holding an
 * eligible anchor, with its ladder tier, every anchor in it, the members
 * that count toward confluence, and reach. The model answers with `bandId`.
 */
export type LlmFrameCandidatePayload = {
  readonly bandId: string
  readonly low: number
  readonly high: number
  readonly anchorId: string
  readonly anchorLabel: string
  readonly anchorSource: string
  /** 0 = current daily pivot, 1 = weekly pivot / G line, 2 = JBA border, 3 = balance-area distribution edge, 4 = rotation distribution edge. */
  readonly tier: number
  readonly tierName: string
  readonly anchors: readonly { readonly id: string; readonly label: string; readonly tier: number; readonly reason: string }[]
  readonly confluenceLabels: readonly string[]
  /** More than one counting member — a stacked band outranks a lone line. */
  readonly stacked: boolean
  readonly side: 'above' | 'below' | 'at'
  readonly distancePts: number
  /** Hard gate for every tier but the daily pivot when any candidate is in reach. */
  readonly withinReach: boolean
}

export type LlmReferencePayload = {
  readonly id: string
  readonly label: string
  readonly source: string
  /** R2 rank, 0 = most significant (the G line). */
  readonly significanceRank: number
  readonly price: number
  /** Ladder rungs, prior-day daily pivots, profile hvns: shown as destinations, never play areas. */
  readonly destinationOnly: boolean
}

export type LlmBandPayload = {
  readonly bandId: string
  readonly label: string
  readonly low: number
  readonly high: number
  readonly anchorSource: string
  /** The anchor's R2 rank (0 = most significant). */
  readonly significanceRank: number
  readonly memberLabels: readonly string[]
  /** More than one reference stacking into this band. */
  readonly confluence: boolean
  /** Best profile-node prominence among members (1 = primary LVN), null without a node. */
  readonly profileProminence: number | null
  /** feat-150: a real important level — a distribution boundary LVN, a JBA border, a pivot, the G line, a prior-day / overnight extreme, or a stacked band. */
  readonly important: boolean
  /** One line per qualifying fact (empty when not important). */
  readonly importantBecause: readonly string[]
  /** feat-150: important AND stacked — the counter-trend fail is the first read here. */
  readonly fadeFirst: boolean
  /** Distributions a member LVN bounds (from the vision read), in words. */
  readonly distributionEdges: readonly string[]
  readonly side: 'above' | 'below' | 'inside'
  readonly distancePts: number
  /** |distance| / session sigma, null without a scale. */
  readonly distanceSigma: number | null
  /** R4 guidance — within one reach of price. */
  readonly withinReach: boolean
  /** R3 — price is at the band now. */
  readonly atBand: boolean
  /** Every member is a rung, a prior-day pivot or an hvn — destination only, never a play area. */
  readonly destinationOnly: boolean
  /** R9 freshness: fresh | full | demoted (touched this session without a fail or a defense). */
  readonly triggerStatus: 'fresh' | 'full' | 'demoted'
  /** feat-154: how this session has interacted with the band so far (measured by code from the exec bars). */
  readonly interaction: LlmBandInteractionPayload
}

export type LlmBandInteractionPayload = {
  /** Completed session bars that printed inside the band. */
  readonly prints: number
  readonly firstAt: string | null
  readonly lastAt: string | null
  /** Prints into the band that closed back out on the side they came from. */
  readonly defenses: { readonly session: number; readonly overnight: number }
  readonly failedLookThisSession: boolean
  /** Which side of the band recent closes have held, or null without enough bars. */
  readonly holdingSide: 'above' | 'below' | 'straddling' | null
}

/** feat-154: this trading day's completed 30-min bars since the Globex open, one line per bar. */
export type LlmSessionTapePayload = {
  readonly what: string
  readonly tradingDay: string
  readonly globexOpenAt: string
  readonly rthOpenAt: string
  readonly overnightBars: number
  readonly sessionBars: number
  readonly bars: readonly string[]
}

export type LlmLocationPayload = {
  readonly enclosingZone: {
    readonly lowerLabel: string
    readonly lowerPrice: number
    readonly lowerBandId: string | null
    readonly upperLabel: string
    readonly upperPrice: number
    readonly upperBandId: string | null
    readonly midZone: boolean
  } | null
  readonly vsWeeklyValue: string
  readonly vsDailyValue: string
  readonly crossRead: {
    readonly weekly: string
    readonly daily: string
    readonly jba: string
    readonly disagreements: readonly string[]
  }
}

export type LlmContextPayload = {
  readonly asOf: string
  readonly instrument: string
  readonly symbol: string
  readonly currentPrice: number
  readonly mergeTolerancePts: number
  readonly scale: {
    readonly sessionSigmaPts: number | null
    readonly reachPts: number
  }
  readonly frameCandidates: readonly LlmFrameCandidatePayload[]
  readonly references: readonly LlmReferencePayload[]
  readonly bands: readonly LlmBandPayload[]
  readonly location: LlmLocationPayload
  readonly sessionTape: LlmSessionTapePayload
  readonly dataWarnings: readonly string[]
}

function frameCandidatePayload(c: FrameCandidate): LlmFrameCandidatePayload {
  return {
    bandId: c.bandId,
    low: c.low,
    high: c.high,
    anchorId: c.anchorId,
    anchorLabel: c.anchorLabel,
    anchorSource: c.anchorSource,
    tier: c.tier,
    tierName: c.tierName,
    anchors: c.anchors.map((a) => ({ id: a.id, label: a.label, tier: a.tier, reason: a.reason })),
    confluenceLabels: c.confluenceLabels,
    stacked: c.stacked,
    side: c.side,
    distancePts: c.distancePts,
    withinReach: c.withinReach,
  }
}

/** The frame candidates (feat-148, `frameCandidates.ts`), strongest first. */
export function frameCandidatesPayload(context: JobContext): LlmFrameCandidatePayload[] {
  return frameCandidates(context).map(frameCandidatePayload)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const HOLDING_SIDE_WORD = { ABOVE: 'above', BELOW: 'below', STRADDLING: 'straddling' } as const

function interactionPayload(facts: BandOriginFacts | undefined): LlmBandInteractionPayload {
  const i = facts?.interaction
  return {
    prints: i?.prints ?? 0,
    firstAt: i?.firstAt ?? null,
    lastAt: i?.lastAt ?? null,
    defenses: { session: i?.defenses.session ?? 0, overnight: i?.defenses.overnight ?? 0 },
    failedLookThisSession: i?.failedLookThisSession ?? false,
    holdingSide: facts?.holdingSide ? HOLDING_SIDE_WORD[facts.holdingSide.side] : null,
  }
}

export function sessionTapePayload(context: JobContext): LlmSessionTapePayload {
  const tape = context.tape
  return {
    what: 'Completed 30-min bars this trading day since the Globex open, oldest first, exchange wall clock. Where price has been — context for shape and freshness only. A bar price is never a level: name levels by their labels and inventory prices.',
    tradingDay: tape.tradingDay,
    globexOpenAt: tape.globexOpenAt,
    rthOpenAt: tape.rthOpenAt,
    overnightBars: tape.overnightBars,
    sessionBars: tape.sessionBars,
    bars: tape.bars.map(tapeBarLine),
  }
}

export function llmContextPayload(context: JobContext): LlmContextPayload {
  const roleByBand = new Map(context.roles.map((r) => [r.bandId, r]))
  const factsByBand = new Map(context.origin.bands.map((f) => [f.bandId, f]))
  const zone = context.location.enclosingZone
  return {
    asOf: context.asOf,
    instrument: context.instrument,
    symbol: context.symbol,
    currentPrice: context.price.value,
    mergeTolerancePts: context.tolerance.merge,
    scale: {
      sessionSigmaPts: context.scale.sessionSigmaPts,
      reachPts: context.scale.reachPts,
    },
    frameCandidates: frameCandidatesPayload(context),
    references: context.references.map((r) => ({
      id: r.id,
      label: r.label,
      source: r.source,
      significanceRank: r.significance,
      price: r.price,
      destinationOnly: r.destinationOnly,
    })),
    bands: context.bands.flatMap((band) => {
      const role = roleByBand.get(band.id)
      if (!role) return []
      return [
        {
          bandId: band.id,
          label: bandLabel(band),
          low: band.low,
          high: band.high,
          anchorSource: band.anchorSource,
          significanceRank: band.significance,
          memberLabels: band.members.map((m) => m.label),
          confluence: band.confluence,
          profileProminence: band.prominence,
          important: isImportantLevel(band),
          importantBecause: importantReasons(band),
          fadeFirst: fadeFirst(band),
          distributionEdges: band.members.flatMap((m) => (m.node?.distributionEdges ?? []).map((e) => `${m.label}: ${distributionEdgeText(m, e)}`)),
          side: role.side,
          distancePts: round2(role.distancePts),
          distanceSigma: role.distanceSigma === null ? null : round2(role.distanceSigma),
          withinReach: role.withinReach,
          atBand: role.at,
          destinationOnly: band.destinationOnly,
          triggerStatus: factsByBand.get(band.id)?.interaction.triggerStatus ?? 'fresh',
          interaction: interactionPayload(factsByBand.get(band.id)),
        },
      ]
    }),
    location: {
      enclosingZone:
        zone === null
          ? null
          : {
              lowerLabel: zone.lowerEdge.label,
              lowerPrice: zone.lowerEdge.price,
              lowerBandId: zone.lowerEdge.bandId,
              upperLabel: zone.upperEdge.label,
              upperPrice: zone.upperEdge.price,
              upperBandId: zone.upperEdge.bandId,
              midZone: zone.midZone,
            },
      vsWeeklyValue: context.location.vsWeeklyValue.read,
      vsDailyValue: context.location.vsDailyValue.read,
      crossRead: {
        weekly: context.location.crossRead.weekly,
        daily: context.location.crossRead.daily,
        jba: context.location.crossRead.jba,
        disagreements: context.location.crossRead.disagreements,
      },
    },
    sessionTape: sessionTapePayload(context),
    dataWarnings: context.warnings,
  }
}
