import type { Play, PlanFrame, PrimaryLean, PrunedBranch } from '@/knowledge/schema/job-plan.schema'
import { frameDirection } from './planFrame'
import type { PlayDraft } from './planTypes'
import { MAX_PLAYS } from './rules'

/**
 * The PRECEDENCE TABLE, rebuilt 2026-08-31 with the forward-conditional
 * grammar: plays are ranked by the FRAME and the STRUCTURE, never by origin
 * facts (that half of R12 is retired — see rules.ts). Lower tier wins:
 *
 *   0  mid-zone stand-down (R10)  — the current state: preps in balance lead
 *                                   with the two-way declaration ("still in
 *                                   balance… play the edges")
 *   1  fresh conditional play     — the watch list
 *   2  demoted (R9)               — already interacted this session without
 *                                   a fail or a defense
 *
 * Inside a tier the SIDES ALTERNATE, frame side first — every prep outlines
 * both directions ("watching that for offer up here… watching the 21s down
 * here for bid"), leading with the side of the G line / weekly pivot price
 * is on. Within a side: the enclosing zone's edges first ("play the edges"),
 * then nearest-first, then structural significance (R2), then band id —
 * fully deterministic. The cap ({@link MAX_PLAYS}) applies after the sort;
 * whatever falls off is listed as pruned with the reason.
 */

const TIER_STAND_DOWN = 0
const TIER_FRESH = 1
const TIER_DEMOTED = 2

export function tierOf(draft: PlayDraft): number {
  if (draft.activation.grounding === 'mid-zone') return TIER_STAND_DOWN
  return draft.activation.demoted ? TIER_DEMOTED : TIER_FRESH
}

/** Within one side of one tier: zone edges, then nearest, then R2 significance. */
function withinSide(a: PlayDraft, b: PlayDraft): number {
  return (
    Number(b.precedence.enclosingEdge) - Number(a.precedence.enclosingEdge) ||
    a.precedence.distancePts - b.precedence.distancePts ||
    a.precedence.significance - b.precedence.significance ||
    a.precedence.bandKey.localeCompare(b.precedence.bandKey)
  )
}

function interleave(lead: readonly PlayDraft[], other: readonly PlayDraft[]): PlayDraft[] {
  const out: PlayDraft[] = []
  for (let i = 0; i < Math.max(lead.length, other.length); i++) {
    if (lead[i]) out.push(lead[i])
    if (other[i]) out.push(other[i])
  }
  return out
}

export function rankDrafts(drafts: readonly PlayDraft[], frame: PlanFrame | null): PlayDraft[] {
  const dir = frameDirection(frame)
  const keyed = drafts.map((d) => ({ ...d, precedence: { ...d.precedence, tier: tierOf(d) } }))
  const tiers = [...new Set(keyed.map((d) => d.precedence.tier))].sort((a, b) => a - b)
  return tiers.flatMap((tier) => {
    const group = keyed.filter((d) => d.precedence.tier === tier).sort(withinSide)
    // With no frame direction ('at' the line) the structurally-first play's side
    // leads — both sides still alternate so the cap never one-sides the plan.
    const lead = dir ?? group.find((d) => d.direction !== 'two-way')?.direction ?? null
    if (lead === null) return group
    const leads = group.filter((d) => d.direction === lead || d.direction === 'two-way')
    return interleave(leads, group.filter((d) => !leads.includes(d)))
  })
}

export type RankedPlays = {
  readonly plays: readonly Play[]
  readonly pruned: readonly PrunedBranch[]
  readonly lean: PrimaryLean
}

function leanOf(first: Play | undefined, frame: PlanFrame | null): PrimaryLean {
  if (!first) {
    return { playId: null, basis: 'none', text: 'No playable structure in reach — destinations only; wait for arrival at the next key area' }
  }
  if (first.stance === 'stand-down') {
    return { playId: first.id, basis: 'mid-zone', text: `${first.summary} (mid-zone stand-down — play the edges, R10)` }
  }
  const dir = frameDirection(frame)
  const suffix =
    frame === null
      ? 'the nearest key area'
      : dir !== null && first.direction === dir
        ? `the frame-aligned look (${frame.side} the ${frame.label})`
        : `the nearest key area (frame: ${frame.side} the ${frame.label})`
  return { playId: first.id, basis: 'frame', text: `${first.summary} — primary look at ${suffix}` }
}

/** Sort, cap at MAX_PLAYS, number the survivors and name the lean. */
export function rankPlays(drafts: readonly PlayDraft[], frame: PlanFrame | null): RankedPlays {
  const ranked = rankDrafts(drafts, frame)
  const kept = ranked.slice(0, MAX_PLAYS)
  const plays: Play[] = kept.map((draft, i) => {
    const { precedence: _precedence, ...play } = draft
    void _precedence
    return { id: `play-${i + 1}`, rank: i + 1, primary: i === 0, ...play }
  })
  const pruned: PrunedBranch[] = ranked.slice(MAX_PLAYS).map((draft) => ({
    bandId: draft.band.bandId,
    label: `${draft.band.label} ${draft.band.low === draft.band.high ? draft.band.low : `${draft.band.low}–${draft.band.high}`}`,
    reason: `R12: max ${MAX_PLAYS} branches — ranked below the kept set (tier ${draft.precedence.tier}, ${draft.condition})`,
  }))
  return { plays, pruned, lean: leanOf(plays[0], frame) }
}
