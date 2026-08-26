import type { BandRole, BandSide, ConfluenceBand, StructuralQuality } from './contextTypes'
import { distanceToBand, r2Significance, r3AtBand, r4WithinReach } from './rules'

/**
 * Step 2 of the level-production procedure (feat-126): every band gets a
 * CONTEXTUAL ROLE, walking outward from price.
 *
 *   destination            — ladder rungs (R2, always), or further than the
 *                            R4 reach: shown, never armed.
 *   actionable-if-reached  — within reach, but not an immediate decision
 *                            point: further out than the nearest structurally
 *                            strong band on its side, or itself poorly formed
 *                            (skipped for better structure, kept on arrival).
 *   actionable-now         — within reach AND either price is AT it (R3) or it
 *                            is the nearest strong band on its side.
 *
 * "Structural quality" is the engineering proxy for 03-20's "I don't like the
 * bottom of this build" / 07-23's refusal of the nearest bid: a LONE reference
 * (no confluence) whose anchor is a low-prominence profile node or a lowest-
 * tier MGI level reads weak. Confluence, or any named-tier anchor, reads
 * strong. Not a ratified rule — a proxy the shadow evaluation can retune.
 */

/** A lone profile node ranked this low within its profile is poorly formed. */
export const WEAK_NODE_PROMINENCE = 4

const round2 = (n: number): number => Math.round(n * 100) / 100

export type RoleInput = {
  readonly bands: readonly ConfluenceBand[]
  readonly price: number
  readonly merge: number
  readonly reachPts: number
  readonly sessionSigmaPts: number | null
}

function sideOf(band: ConfluenceBand, price: number): BandSide {
  if (band.low > price) return 'above'
  if (band.high < price) return 'below'
  return 'inside'
}

export function structuralQuality(band: ConfluenceBand): { quality: StructuralQuality; reason: string } {
  if (band.confluence) return { quality: 'strong', reason: `confluence of ${band.memberCount}` }
  const anchor = band.members[0]
  if (anchor.node && anchor.node.prominence >= WEAK_NODE_PROMINENCE) {
    return { quality: 'weak', reason: `lone ${anchor.node.profile} ${anchor.node.kind} at prominence ${anchor.node.prominence}` }
  }
  if (anchor.significance >= r2Significance('mgi-other')) {
    return { quality: 'weak', reason: `lone ${anchor.source} reference` }
  }
  return { quality: 'strong', reason: `${anchor.source} anchor` }
}

type Measured = {
  readonly band: ConfluenceBand
  readonly side: BandSide
  readonly distancePts: number
  readonly at: boolean
  readonly withinReach: boolean
  readonly quality: StructuralQuality
  readonly reason: string
}

function measure(band: ConfluenceBand, input: RoleInput): Measured {
  const distancePts = round2(distanceToBand(input.price, band.low, band.high))
  const { quality, reason } = structuralQuality(band)
  return {
    band,
    side: sideOf(band, input.price),
    distancePts,
    at: r3AtBand(input.price, band.low, band.high, input.merge),
    withinReach: r4WithinReach(distancePts, input.reachPts),
    quality,
    reason,
  }
}

/** The nearest strong, armable band on a side — the immediate decision point there. */
function nearestStrongId(measured: readonly Measured[], side: BandSide): string | null {
  const candidates = measured
    .filter((m) => m.side === side && m.quality === 'strong' && !m.band.destinationOnly && m.withinReach)
    .sort((a, b) => a.distancePts - b.distancePts || a.band.id.localeCompare(b.band.id))
  return candidates[0]?.band.id ?? null
}

function nearestRanks(measured: readonly Measured[], side: BandSide): Map<string, number> {
  const ranks = new Map<string, number>()
  measured
    .filter((m) => m.side === side)
    .sort((a, b) => a.distancePts - b.distancePts || a.band.id.localeCompare(b.band.id))
    .forEach((m, i) => ranks.set(m.band.id, i + 1))
  return ranks
}

export function assignBandRoles(input: RoleInput): BandRole[] {
  const measured = input.bands.map((band) => measure(band, input))
  const firstStrong = { above: nearestStrongId(measured, 'above'), below: nearestStrongId(measured, 'below') }
  const ranks = new Map([...nearestRanks(measured, 'above'), ...nearestRanks(measured, 'below')])

  return measured.map((m) => {
    const destinationOnly = m.band.destinationOnly
    const immediate = m.at || m.band.id === firstStrong.above || m.band.id === firstStrong.below
    const role = destinationOnly || !m.withinReach
      ? 'destination'
      : immediate
        ? 'actionable-now'
        : 'actionable-if-reached'
    return {
      bandId: m.band.id,
      role,
      side: m.side,
      at: m.at,
      distancePts: m.distancePts,
      distanceSigma:
        input.sessionSigmaPts !== null && input.sessionSigmaPts > 0
          ? round2(m.distancePts / input.sessionSigmaPts)
          : null,
      withinReach: m.withinReach,
      structuralQuality: m.quality,
      qualityReason: m.reason,
      nearestRank: ranks.get(m.band.id) ?? null,
      destinationOnly,
    }
  })
}
