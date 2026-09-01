import type { PlanFrame } from '@/knowledge/schema/job-plan.schema'
import type { JobContext, Reference } from './contextTypes'
import type { PlayDirectional } from './planTypes'
import { fmtPrice, referenceProvenance } from './playText'
import type { ReferenceSource } from './rules'

/**
 * The plan FRAME (2026-08-31 operator correction — how Job opens every prep):
 * situate price against the operative tier-one MGI structure and name the
 * productive side. "We're below the weekly pivot… not out of the weeds";
 * "beneath the G line and underneath the JBAs… want to work to sell
 * pullbacks"; "we've worked our way up to the 1A".
 *
 * The frame line comes from the TIER-ONE LADDER (operator, 2026-08-31): the
 * G line, then the weekly Job Pivot, then the weekly pivot extensions (the
 * ladder rungs — 06-15 and 08-04 frame off the 1A / 2A when the pivots are
 * far), then the daily Job Pivot — fresh at run time because runs happen
 * after the RTH open, ranked right below the weekly MGI. The most important
 * rung of the ladder WITHIN REACH (R4) wins — never a blind nearest-of-two,
 * which could name a line hundreds of points away (03-16: "G line is way
 * down here" and it drops out). With nothing in reach the nearest tier-one
 * line still frames the plan, stated at its distance.
 *
 * Within one merge tolerance of the line the frame is 'at' (balance around
 * the line, no productive side — 03-19 "if we get above the G line, expect
 * some balance between there and the weekly pivot"); otherwise the side of
 * the line price is on names the direction to lean with.
 */

/** Importance order, most important first — G line > weekly pivot > weekly extensions > daily pivot. */
export const FRAME_LADDER: readonly ReferenceSource[] = ['g-line', 'weekly-job-pivot', 'weekly-rung', 'daily-job-pivot']

type Measured = { readonly ref: Reference; readonly distance: number }

function nearest(candidates: readonly Measured[]): Measured | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => (c.distance < best.distance || (c.distance === best.distance && c.ref.id < best.ref.id) ? c : best))
}

/** The most important in-reach ladder step's nearest line; nothing in reach → the nearest tier-one line overall. */
function frameLine(context: JobContext): Measured | null {
  const price = context.price.value
  // Historical daily pivots share the source but are not the FRESH line the
  // operator framed on — only the current pivot may frame.
  const measured = context.references
    .filter((r) => FRAME_LADDER.includes(r.source) && r.pivot?.role !== 'historical')
    .map((ref) => ({ ref, distance: Math.abs(ref.price - price) }))
  for (const source of FRAME_LADDER) {
    const inReach = nearest(measured.filter((m) => m.ref.source === source && m.distance <= context.scale.reachPts))
    if (inReach) return inReach
  }
  return nearest(measured)
}

function frameText(ref: Reference, side: PlanFrame['side'], distancePts: number): string {
  const at = `At the ${ref.label} ${fmtPrice(ref.price)} — balance around the line; no productive side until price takes one and holds it`
  if (side === 'at') return at
  const productive = side === 'above' ? 'upside' : 'downside'
  const counter = side === 'above' ? 'below' : 'above'
  return `${side === 'above' ? 'Above' : 'Below'} the ${ref.label} ${fmtPrice(ref.price)} (${fmtPrice(distancePts)} pts) — ${productive} is productive; lean with it and don't counter until price is back ${counter} the line`
}

/** The frame, or null when no tier-one reference is in the inventory. */
export function planFrame(context: JobContext): PlanFrame | null {
  const line = frameLine(context)
  if (line === null) return null
  const { ref, distance } = line
  const price = context.price.value
  const distancePts = Math.round(distance * 100) / 100
  const side: PlanFrame['side'] = distance <= context.tolerance.merge ? 'at' : price > ref.price ? 'above' : 'below'
  return {
    referenceId: ref.id,
    label: ref.label,
    price: ref.price,
    side,
    distancePts,
    text: frameText(ref, side, distancePts),
    provenance: referenceProvenance([ref]),
  }
}

/** The direction the frame favours — long above the line, short below, none at it. */
export function frameDirection(frame: PlanFrame | null): PlayDirectional | null {
  if (frame === null || frame.side === 'at') return null
  return frame.side === 'above' ? 'long' : 'short'
}
