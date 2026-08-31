import type { PlanFrame } from '@/knowledge/schema/job-plan.schema'
import type { JobContext, Reference } from './contextTypes'
import type { PlayDirectional } from './planTypes'
import { fmtPrice, referenceProvenance } from './playText'

/**
 * The plan FRAME (2026-08-31 operator correction — how Job opens every prep):
 * situate price against the operative major structure and name the productive
 * side. "We're below the weekly pivot… not out of the weeds"; "beneath the
 * G line and underneath the JBAs… want to work to sell pullbacks"; "we're
 * above the RP… don't want to be stepping in front of a train".
 *
 * The frame line is the NEARER of the G line and the weekly Job Pivot — the
 * two R2-top references every prep orients against. Within one merge
 * tolerance of it the frame is 'at' (balance around the line, no productive
 * side — 03-19 "if we get above the G line, expect some balance between
 * there and the weekly pivot"); otherwise the side of the line price is on
 * names the direction to lean with and warns against countering.
 */

const FRAME_SOURCES = new Set(['g-line', 'weekly-job-pivot'])

function frameCandidates(context: JobContext): Reference[] {
  return context.references.filter((r) => FRAME_SOURCES.has(r.source))
}

function frameText(ref: Reference, side: PlanFrame['side'], distancePts: number): string {
  const at = `At the ${ref.label} ${fmtPrice(ref.price)} — balance around the line; no productive side until price takes one and holds it`
  if (side === 'at') return at
  const productive = side === 'above' ? 'upside' : 'downside'
  const counter = side === 'above' ? 'below' : 'above'
  return `${side === 'above' ? 'Above' : 'Below'} the ${ref.label} ${fmtPrice(ref.price)} (${fmtPrice(distancePts)} pts) — ${productive} is productive; lean with it and don't counter until price is back ${counter} the line`
}

/** The frame, or null when neither frame reference is in the inventory. */
export function planFrame(context: JobContext): PlanFrame | null {
  const candidates = frameCandidates(context)
  if (candidates.length === 0) return null
  const price = context.price.value
  const ref = candidates.reduce((best, r) => (Math.abs(r.price - price) < Math.abs(best.price - price) ? r : best))
  const distance = Math.abs(price - ref.price)
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
