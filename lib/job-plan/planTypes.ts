import type { GroundingKind, Play } from '@/knowledge/schema/job-plan.schema'
import type { BandOriginFacts, BandRole, ConfluenceBand } from './contextTypes'
import type { RuleId } from './rules'

/**
 * Internal shapes shared by the buildPlan modules (feat-127). Nothing here is
 * persisted: a `PlayDraft` becomes a `Play` once the precedence table has
 * ranked it and assigned its id.
 */

export type PlayDirectional = 'long' | 'short'

/** A band the R12 walk selected, with everything the grammar needs to read it. */
export type Candidate = {
  readonly band: ConfluenceBand
  readonly role: BandRole
  readonly facts: BandOriginFacts
  /** Why the band is in the actionable set (`inside` / `nearest` / `enclosing-zone edge`). */
  readonly why: string
}

/** The origin fact a play is grounded in, resolved in R12 order. */
export type Grounding = {
  readonly kind: Exclude<GroundingKind, 'mid-zone'>
  readonly direction: PlayDirectional
  readonly factAt: string | null
  /** Wall-ms of `factAt` for freshness ordering; -Infinity when conditional. */
  readonly factMs: number
  readonly evidence: string
  readonly rulesFired: readonly RuleId[]
  /** R5 grade, failed-look groundings only. */
  readonly grade: 'EARLY' | 'LATE' | null
}

export type PrecedenceKey = {
  /** Lower wins; see planPrecedence.ts for the table. */
  readonly tier: number
  readonly factMs: number
  readonly enclosingEdge: boolean
  readonly distancePts: number
  readonly bandKey: string
}

export type PlayDraft = Omit<Play, 'id' | 'rank' | 'primary'> & {
  readonly precedence: PrecedenceKey
}
