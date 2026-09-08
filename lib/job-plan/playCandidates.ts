import type { PlanFrame, PrunedBranch } from '@/knowledge/schema/job-plan.schema'
import type { BandOriginFacts, BandRole, BandSide, ConfluenceBand, JobContext } from './contextTypes'
import { biasDirection, readAgainstFrame, type FrameRelation } from './frameRelation'
import type { Candidate } from './planTypes'
import { bandName } from './playText'
import { MAX_ARMED_BANDS_PER_SIDE, r12SkipBand } from './rules'

/**
 * R12's actionable set (feat-127, plan step 2): walking outward from price,
 * arm at most {@link MAX_ARMED_BANDS_PER_SIDE} bands per side nearest-first —
 * where "side" is read against the FRAME since feat-149 when it has a
 * direction: the bias side (between the line and price), beyond price on the
 * bias side, and the far side beyond the line, each walked nearest-first
 * from price; the line itself is always in. With no frame direction the
 * sides are the two sides of price, as before —
 * skipping a band with no confluence AND a lowest-tier source — plus the
 * enclosing zone's edges. Bands price is AT (inside) are decision points now
 * and always in. Rungs never arm (R2); beyond-reach bands are destinations
 * (R4) — an enclosing-zone edge further than the reach stays a destination
 * too (R4 says "never armed"; the stand-down play still names it). Every
 * band walked past is listed with its reason — pruning is part of the
 * procedure, never silent.
 */

export type CandidateSelection = {
  readonly candidates: readonly Candidate[]
  readonly pruned: readonly PrunedBranch[]
}

type Indexed = {
  readonly bands: ReadonlyMap<string, ConfluenceBand>
  readonly facts: ReadonlyMap<string, BandOriginFacts>
}

function index(context: JobContext): Indexed {
  return {
    bands: new Map(context.bands.map((b) => [b.id, b])),
    facts: new Map(context.origin.bands.map((f) => [f.bandId, f])),
  }
}

function candidate(role: BandRole, idx: Indexed, why: string): Candidate | null {
  const band = idx.bands.get(role.bandId)
  const facts = idx.facts.get(role.bandId)
  return band && facts ? { band, role, facts, why } : null
}

const byDistance = (a: BandRole, b: BandRole): number => a.distancePts - b.distancePts || a.bandId.localeCompare(b.bandId)

function walkRoles(context: JobContext, idx: Indexed, side: string, roles: readonly BandRole[]): CandidateSelection {
  const candidates: Candidate[] = []
  const pruned: PrunedBranch[] = []
  const reachable = [...roles].filter((r) => !r.destinationOnly && r.withinReach).sort(byDistance)
  for (const role of reachable) {
    const band = idx.bands.get(role.bandId)
    if (!band) continue
    if (r12SkipBand(band)) {
      pruned.push({ bandId: band.id, label: bandName(band), reason: `R12: skipped — no confluence and a lowest-tier source (${band.anchorSource})` })
      continue
    }
    if (candidates.length >= MAX_ARMED_BANDS_PER_SIDE) {
      pruned.push({ bandId: band.id, label: bandName(band), reason: `R12: beyond the ${MAX_ARMED_BANDS_PER_SIDE} nearest armed bands ${side}` })
      continue
    }
    const c = candidate(role, idx, `nearest ${side} #${candidates.length + 1}`)
    if (c) candidates.push(c)
  }
  return { candidates, pruned }
}

function walkSide(context: JobContext, idx: Indexed, side: BandSide): CandidateSelection {
  return walkRoles(context, idx, side, context.roles.filter((r) => r.side === side))
}

/** feat-149: the roles on one frame relation (the line never walks — feat-151). */
function walkRelation(context: JobContext, idx: Indexed, frame: PlanFrame, relation: FrameRelation): CandidateSelection {
  const roles = context.roles.filter((r) => {
    const band = idx.bands.get(r.bandId)
    return band !== undefined && readAgainstFrame(band, r.side, frame)?.relation === relation
  })
  return walkRoles(context, idx, relation === 'far' ? 'on the far side of the line' : relation === 'beyond' ? 'beyond price on the bias side' : 'on the bias side', roles)
}

/** The enclosing zone's edges, within reach (R4) and never a band R12 skips (a lone lowest-tier band stays skipped). */
function enclosingEdges(context: JobContext, idx: Indexed): Candidate[] {
  const zone = context.location.enclosingZone
  if (zone === null) return []
  return [zone.lowerEdge.bandId, zone.upperEdge.bandId]
    .filter((id): id is string => id !== null)
    .map((id) => context.roles.find((r) => r.bandId === id))
    .filter((role): role is BandRole => role !== undefined && role.withinReach)
    .filter((role) => {
      const band = idx.bands.get(role.bandId)
      return band !== undefined && !r12SkipBand(band)
    })
    .map((role) => candidate(role, idx, 'enclosing-zone edge'))
    .filter((c): c is Candidate => c !== null)
}

export function selectCandidates(context: JobContext, frame: PlanFrame | null = null): CandidateSelection {
  const idx = index(context)
  const inside = context.roles
    .filter((r) => r.side === 'inside' && !r.destinationOnly)
    .sort(byDistance)
    .map((role) => candidate(role, idx, 'price inside the band'))
    .filter((c): c is Candidate => c !== null)
  const edges = enclosingEdges(context, idx)

  const walks =
    frame !== null && biasDirection(frame) !== null
      ? [
          // the line itself is never a candidate (feat-151): two-way by assumption, drawn as the frame
          walkRelation(context, idx, frame, 'bias'),
          walkRelation(context, idx, frame, 'beyond'),
          walkRelation(context, idx, frame, 'far'),
        ]
      : [walkSide(context, idx, 'below'), walkSide(context, idx, 'above')]

  const chosen = new Map<string, Candidate>()
  for (const c of [...inside, ...walks.flatMap((w) => w.candidates), ...edges]) {
    if (!chosen.has(c.band.id)) chosen.set(c.band.id, c)
  }
  const pruned = walks.flatMap((w) => w.pruned).filter((p) => p.bandId === null || !chosen.has(p.bandId))
  return { candidates: [...chosen.values()], pruned }
}
