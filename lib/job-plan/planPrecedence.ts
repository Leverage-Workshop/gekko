import type { Play, PrimaryLean, PrunedBranch } from '@/knowledge/schema/job-plan.schema'
import type { JobContext } from './contextTypes'
import type { PlayDirectional, PlayDraft } from './planTypes'
import { MAX_PLAYS, r12OriginRank, type OriginFactKind } from './rules'

/**
 * The PRECEDENCE TABLE (feat-127, plan step 5 + "Key decisions" 4), applied
 * as one ordered sort over the drafted plays. Lower tier wins:
 *
 *   —  invalid / stale input                 → `insufficient`, no plays at all
 *                                              (buildPlan, before any draft)
 *   0  failed look, EARLY (R5)               ┐ R12 origin order: the freshest
 *   1  failed look, LATE                     │ fact backs the primary lean.
 *   2  approach failure (R7)                 │ Failed-look + re-entry enables
 *   3  confirmed initiative — accepted (R6)  ┘ traversal (its chain crosses the zone)
 *   4  mid-zone stand-down (R10)             — beats WEAK directional context …
 *   5  holding side (R8)                     ┐ … which is these two
 *   6  repeated defense (R9)                 ┘
 *   7  watched band, no fact                 — conditional, never the lean
 *   8  touched band demoted (R9)             — unless it produced a failed look
 *                                              or a defense (it keeps its tier)
 *
 * Confirmed initiative beats responsive fades: tier 3 outranks every fade
 * tier below it, and a band that is accepted never also carries a fade (one
 * play per band, grammar). Inside a tier: the fresher fact first, then the
 * enclosing zone's edges (R12 arms them explicitly — "play the edges"), then
 * WEEKLY CONTEXT, which RE-ORDERS but never manufactures (plays aligned with
 * the weekly-value read sort first; no play is created from it), then
 * nearest-first, then band id — fully deterministic. The cap
 * ({@link MAX_PLAYS}) applies after the sort; whatever falls off is listed
 * as pruned with the reason.
 */

const TIER_LATE_FAILED_LOOK = 1
const TIER_STAND_DOWN = 4
const TIER_WATCHED = 7
const TIER_DEMOTED = 8

export function tierOf(draft: PlayDraft): number {
  if (draft.activation.demoted) return TIER_DEMOTED
  const g = draft.activation.grounding
  switch (g) {
    case 'mid-zone':
      return TIER_STAND_DOWN
    case 'none':
      return TIER_WATCHED
    case 'failed-look':
      return draft.activation.evidence.includes('EARLY') ? r12OriginRank(g) : TIER_LATE_FAILED_LOOK
    case 'approach-failure':
      return 2
    case 'accepted':
      return 3
    case 'holding-side':
      return 5
    case 'defense':
      return 6
  }
}

/** The direction the weekly-value read favours: above value → longs first, below → shorts first, at the pivot → none. */
export function weeklyPreference(context: JobContext): PlayDirectional | null {
  switch (context.location.vsWeeklyValue.read) {
    case 'above':
    case 'upper-half':
      return 'long'
    case 'below':
    case 'lower-half':
      return 'short'
    case 'at-pivot':
      return null
  }
}

/** Fresher first; two conditional plays (no fact) compare equal. */
function fresher(a: PlayDraft, b: PlayDraft): number {
  if (a.precedence.factMs === b.precedence.factMs) return 0
  return b.precedence.factMs - a.precedence.factMs
}

function alignment(draft: PlayDraft, preferred: PlayDirectional | null): number {
  if (preferred === null || draft.direction === 'two-way') return 0
  return draft.direction === preferred ? 0 : 1
}

export function rankDrafts(drafts: readonly PlayDraft[], context: JobContext): PlayDraft[] {
  const preferred = weeklyPreference(context)
  const keyed = drafts.map((d) => ({ ...d, precedence: { ...d.precedence, tier: tierOf(d) } }))
  return keyed.sort(
    (a, b) =>
      a.precedence.tier - b.precedence.tier ||
      fresher(a, b) ||
      Number(b.precedence.enclosingEdge) - Number(a.precedence.enclosingEdge) ||
      alignment(a, preferred) - alignment(b, preferred) ||
      a.precedence.distancePts - b.precedence.distancePts ||
      a.precedence.bandKey.localeCompare(b.precedence.bandKey),
  )
}

export type RankedPlays = {
  readonly plays: readonly Play[]
  readonly pruned: readonly PrunedBranch[]
  readonly lean: PrimaryLean
}

function leanOf(first: Play | undefined): PrimaryLean {
  if (!first || first.activation.grounding === 'none') {
    return { playId: null, basis: 'none', text: 'No origin fact grounds a lean — conditional plays only; wait for a response at an armed band' }
  }
  const basis = first.activation.grounding
  const text =
    basis === 'mid-zone'
      ? `${first.summary} (mid-zone stand-down beats weak directional context)`
      : `${first.summary} — backed by the freshest ${basis} fact (R12: ${ORIGIN_LABELS[basis]})`
  return { playId: first.id, basis, text }
}

const ORIGIN_LABELS: Readonly<Record<OriginFactKind, string>> = {
  'failed-look': 'failed look ranks first',
  'approach-failure': 'approach failure ranks after a failed look',
  accepted: 'building/accepted ranks after approach failure',
  'holding-side': 'holding side ranks after building/accepted',
  defense: 'repeated defense ranks last',
}

/** Sort, cap at MAX_PLAYS, number the survivors and name the lean. */
export function rankPlays(drafts: readonly PlayDraft[], context: JobContext): RankedPlays {
  const ranked = rankDrafts(drafts, context)
  const kept = ranked.slice(0, MAX_PLAYS)
  const plays: Play[] = kept.map((draft, i) => {
    const { precedence: _precedence, ...play } = draft
    void _precedence
    return { id: `play-${i + 1}`, rank: i + 1, primary: i === 0 && draft.activation.grounding !== 'none', ...play }
  })
  const pruned: PrunedBranch[] = ranked.slice(MAX_PLAYS).map((draft) => ({
    bandId: draft.band.bandId,
    label: `${draft.band.label} ${draft.band.low === draft.band.high ? draft.band.low : `${draft.band.low}–${draft.band.high}`}`,
    reason: `R12: max ${MAX_PLAYS} branches — ranked below the kept set (tier ${draft.precedence.tier}, ${draft.condition})`,
  }))
  return { plays, pruned, lean: leanOf(plays[0]) }
}
