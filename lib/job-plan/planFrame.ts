import type { PlanFrame } from '@/knowledge/schema/job-plan.schema'
import type { JobContext } from './contextTypes'
import { selectFrameCandidate, type FrameCandidate } from './frameCandidates'
import type { PlayDirectional } from './planTypes'
import { fmtPrice, fmtRange, referenceProvenance } from './playText'

/**
 * The plan FRAME — the BIAS LINE (feat-148, operator ratification 2026-09-07,
 * replacing the 2026-08-31 tier-one ladder G > weekly > rungs > daily).
 *
 * The frame answers one question: at what level do I look for longs above
 * and shorts below? Above the line the plan's plays are longs at the areas
 * that offer a rebid; below it, shorts at the areas that offer a reoffer.
 * Positions never have to initiate at the line itself.
 *
 * The candidate ladder, confluence and reach live in `frameCandidates.ts`.
 * This module composes the persisted `PlanFrame` from a chosen candidate —
 * the deterministic pick here (the rollback path behind JOB_PLANNER) or the
 * LLM's (feat-145) — and names the side:
 *
 *   above / below  the productive direction; the other side's plays are the
 *                  fork (what to expect if price takes the line)
 *   at             inside the band or within one merge tolerance of it — a
 *                  legal state, not a reason to reach for a farther line:
 *                  holding above it, longs at the areas above; losing it,
 *                  shorts at the areas below
 *
 * The frame is a BAND: a lone line collapses to low = high.
 */

function frameText(c: FrameCandidate): string {
  const name = `${c.anchorLabel}${c.confluenceCount > 1 ? ` (+${c.confluenceCount - 1})` : ''} ${fmtRange(c.low, c.high)}`
  if (c.side === 'at') {
    return `At the ${name} — no bias yet: holding above it, longs at the areas above; losing it, shorts at the areas below`
  }
  if (c.side === 'above') {
    return `Above the ${name} (${fmtPrice(c.distancePts)} pts) — longs only: look for rebids at the areas above the line; shorts come back only below it. The line itself is two-way: rebid while it holds, reoffer once lost`
  }
  return `Below the ${name} (${fmtPrice(c.distancePts)} pts) — shorts only: look for reoffers at the areas below the line; longs come back only above it. The line itself is two-way: reoffer while it holds, rebid once lost`
}

/** The frame composed around one chosen candidate (the deterministic pick, or the LLM's — feat-145). */
export function frameFor(context: JobContext, candidate: FrameCandidate): PlanFrame {
  const band = context.bands.find((b) => b.id === candidate.bandId)
  const members = band ? band.members : context.references.filter((r) => r.id === candidate.anchorId)
  return {
    referenceId: candidate.anchorId,
    label: candidate.anchorLabel,
    price: candidate.anchorPrice,
    side: candidate.side,
    distancePts: candidate.distancePts,
    text: frameText(candidate),
    provenance: referenceProvenance(members),
    bandId: candidate.bandId,
    low: candidate.low,
    high: candidate.high,
    tier: candidate.tier,
    memberLabels: [...candidate.confluenceLabels],
  }
}

/** The frame, or null when no eligible anchor is in the inventory. */
export function planFrame(context: JobContext): PlanFrame | null {
  const candidate = selectFrameCandidate(context)
  return candidate === null ? null : frameFor(context, candidate)
}

/** The direction the frame favours — long above the line, short below, none at it. */
export function frameDirection(frame: PlanFrame | null): PlayDirectional | null {
  if (frame === null || frame.side === 'at') return null
  return frame.side === 'above' ? 'long' : 'short'
}
