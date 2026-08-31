import type { PlanFrame, Play } from '@/knowledge/schema/job-plan.schema'
import type { BandOriginFacts, BandRole, ConfluenceBand } from './contextTypes'

/**
 * Internal shapes shared by the buildPlan modules. Nothing here is
 * persisted: a `PlayDraft` becomes a `Play` once the precedence table has
 * ranked it and assigned its id.
 */

export type PlayDirectional = 'long' | 'short'

/** The frame as the grammar receives it (null before core geometry exists). */
export type PlanFrameInput = PlanFrame | null

/** A band the R12 walk selected, with everything the grammar needs to read it. */
export type Candidate = {
  readonly band: ConfluenceBand
  readonly role: BandRole
  readonly facts: BandOriginFacts
  /** Why the band is in the actionable set (`inside` / `nearest` / `enclosing-zone edge`). */
  readonly why: string
}

export type PrecedenceKey = {
  /** Lower wins; see planPrecedence.ts for the table. */
  readonly tier: number
  /** The play's direction agrees with the frame (or there is no frame direction). */
  readonly aligned: boolean
  readonly enclosingEdge: boolean
  /** The band anchor's R2 rank (lower = more significant structure). */
  readonly significance: number
  readonly distancePts: number
  readonly bandKey: string
}

export type PlayDraft = Omit<Play, 'id' | 'rank' | 'primary'> & {
  readonly precedence: PrecedenceKey
}
