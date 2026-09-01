import type { JobContext } from '../contextTypes'
import { FRAME_LADDER } from '../planFrame'
import { bandLabel } from '../playText'

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
 * line" is expressible. What it never carries: raw session history — each
 * band's `triggerStatus` (R9) is the only session fact, because freshness is
 * the only thing history may change.
 */

export type LlmFrameCandidatePayload = {
  readonly id: string
  readonly label: string
  readonly source: string
  readonly price: number
  readonly distancePts: number
  readonly withinReach: boolean
}

export type LlmReferencePayload = {
  readonly id: string
  readonly label: string
  readonly source: string
  /** R2 rank, 0 = most significant (the G line). */
  readonly significanceRank: number
  readonly price: number
  /** Ladder rungs: shown as destinations, never play areas. */
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
  readonly side: 'above' | 'below' | 'inside'
  readonly distancePts: number
  /** |distance| / session sigma, null without a scale. */
  readonly distanceSigma: number | null
  /** R4 guidance — within one reach of price. */
  readonly withinReach: boolean
  /** R3 — price is at the band now. */
  readonly atBand: boolean
  /** Every member is a ladder rung — destination only, never a play area. */
  readonly destinationOnly: boolean
  /** R9 freshness: fresh | full | demoted (touched this session without a fail or a defense). */
  readonly triggerStatus: 'fresh' | 'full' | 'demoted'
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
  readonly dataWarnings: readonly string[]
}

/** Tier-one lines the frame may come from — historical daily pivots never frame. */
export function frameCandidates(context: JobContext): LlmFrameCandidatePayload[] {
  const price = context.price.value
  return context.references
    .filter((r) => FRAME_LADDER.includes(r.source) && r.pivot?.role !== 'historical')
    .map((r) => ({
      id: r.id,
      label: r.label,
      source: r.source,
      price: r.price,
      distancePts: round2(Math.abs(r.price - price)),
      withinReach: Math.abs(r.price - price) <= context.scale.reachPts,
    }))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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
    frameCandidates: frameCandidates(context),
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
          side: role.side,
          distancePts: round2(role.distancePts),
          distanceSigma: role.distanceSigma === null ? null : round2(role.distanceSigma),
          withinReach: role.withinReach,
          atBand: role.at,
          destinationOnly: band.destinationOnly,
          triggerStatus: factsByBand.get(band.id)?.interaction.triggerStatus ?? 'fresh',
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
    dataWarnings: context.warnings,
  }
}
