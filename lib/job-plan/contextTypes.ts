import type { Instrument } from './profile-vision/instrument'
import type { NodeKind, NodePosition, NodeEdge } from './profile-vision/schema'
import type { ProfileKey } from './profile-vision/types'
import type {
  FailedLookGrade,
  HoldingSide,
  ReferenceSource,
  TriggerStatus,
} from './rules'

/**
 * The `classifyContext` output (feat-126, docs/job-planning-task-plan.md "Key
 * decisions" 4): an ORTHOGONAL dimensions object — never one state enum. Every
 * dimension carries machine-readable evidence; every origin fact is stamped
 * `asOf` and scoped overnight vs session-so-far; data quality is its own field.
 * Consumed by feat-127's `buildPlan` and persisted inside the JobPlan.
 */

/** Which bundle file / read a reference came from. */
export type ReferenceOrigin = 'mgi' | 'job-study' | 'profile-nodes' | 'htf-bars'

export type PivotTestedStatus = 'untested' | 'unknown'

export type ReferenceNode = {
  readonly profile: ProfileKey
  readonly kind: NodeKind
  readonly prominence: number
  readonly primary: boolean
  readonly position: NodePosition
  readonly edgeBelow: NodeEdge
  readonly edgeAbove: NodeEdge
  readonly agreement: number
  readonly samples: number
}

export type ReferencePivot = {
  readonly role: 'current' | 'historical'
  readonly sessionDate: string
  /** Historical pivots only: whether the bundle's bars have traded through it. */
  readonly testedStatus: PivotTestedStatus | null
}

/** One inventory entry — a price the plan may quote, with its R2 significance. */
export type Reference = {
  readonly id: string
  readonly source: ReferenceSource
  /** R2 rank, 0 = the G line. */
  readonly significance: number
  /** Within-tier order (0 first): current daily pivot before historical ones. */
  readonly subRank: number
  readonly label: string
  /** The point the band clustering uses (a node's band midpoint). */
  readonly price: number
  readonly priceLow: number
  readonly priceHigh: number
  /** R2: ladder rungs — shown, never armed. */
  readonly destinationOnly: boolean
  readonly origin: ReferenceOrigin
  readonly boxIndex: number | null
  readonly node: ReferenceNode | null
  readonly pivot: ReferencePivot | null
  readonly mgiCode: string | null
}

export type ExcludedReference = {
  readonly label: string
  readonly price: number | null
  readonly reason:
    | 'sentinel'
    | 'historical_pivot_tested'
    | 'missing'
}

/** A confluence band (R1/R1b): [lowest member, highest member], anchored on its most significant member. */
export type ConfluenceBand = {
  readonly id: string
  readonly low: number
  readonly high: number
  readonly anchorId: string
  readonly anchorPrice: number
  readonly anchorSource: ReferenceSource
  /** The anchor's R2 rank. */
  readonly significance: number
  /** Members ordered by significance (anchor first). */
  readonly members: readonly Reference[]
  readonly memberCount: number
  /** More than one member — a promoter, not the ranking. */
  readonly confluence: boolean
  /** Every member is a ladder rung. */
  readonly destinationOnly: boolean
  /** Best profile prominence among members (1 = primary), null without a node. */
  readonly prominence: number | null
}

export type BandRoleKind = 'actionable-now' | 'actionable-if-reached' | 'destination'
export type BandSide = 'above' | 'below' | 'inside'
export type StructuralQuality = 'strong' | 'weak'

export type BandRole = {
  readonly bandId: string
  readonly role: BandRoleKind
  readonly side: BandSide
  /** R3. */
  readonly at: boolean
  readonly distancePts: number
  /** |distance| / session sigma, null without a scale. */
  readonly distanceSigma: number | null
  /** R4. */
  readonly withinReach: boolean
  readonly structuralQuality: StructuralQuality
  readonly qualityReason: string
  /** 1 = nearest band on that side (all bands, destination-only included); null inside. */
  readonly nearestRank: number | null
  readonly destinationOnly: boolean
}

export type ScaleSource = 'session-sigma' | 'fallback-points'

export type ContextScale = {
  readonly source: ScaleSource
  readonly sessionSigmaPts: number | null
  /** The R4 reach in points (1.0σ, or the fallback). */
  readonly reachPts: number
  readonly sessionsAnalyzed: number | null
}

export type ValueZoneRead = 'below' | 'lower-half' | 'at-pivot' | 'upper-half' | 'above'

export type ValueZoneDimension = {
  readonly read: ValueZoneRead
  readonly evidence: {
    readonly price: number
    readonly valueLow: number
    readonly pivot: number
    readonly valueHigh: number
    readonly fromPivotPts: number
    readonly mergeTolerancePts: number
  }
}

export type BoxRead =
  | 'inside-middle'
  | 'at-lower-edge'
  | 'at-upper-edge'
  | 'outside-near'
  | 'outside-extended'

export type BoxDimension = {
  readonly boxIndex: number
  readonly drawingId: number
  readonly read: BoxRead
  readonly side: BandSide
  readonly evidence: {
    readonly price: number
    readonly low: number
    readonly high: number
    readonly fromLowPts: number
    readonly fromHighPts: number
    readonly mergeTolerancePts: number
  }
}

export type EnclosingZoneKind = 'jba-box' | 'between-bands'

export type EnclosingZone = {
  readonly kind: EnclosingZoneKind
  readonly lowerEdge: { readonly label: string; readonly price: number; readonly bandId: string | null }
  readonly upperEdge: { readonly label: string; readonly price: number; readonly bandId: string | null }
  readonly fromLowerPts: number
  readonly fromUpperPts: number
  /** R10. */
  readonly midZone: boolean
  readonly midZoneLimitPts: number
}

export type CoarseRead = 'above' | 'inside' | 'below'

export type CrossRead = {
  readonly weekly: CoarseRead
  readonly daily: CoarseRead
  /** Vs the JBA boxes: inside one, or above / below / between them all. */
  readonly jba: 'inside' | 'above-all' | 'below-all' | 'between' | 'none'
  readonly unanimous: boolean
  /** Each conflicting pair, spelled out — never collapsed into a bias. */
  readonly disagreements: readonly string[]
}

export type LocationDimensions = {
  readonly vsWeeklyValue: ValueZoneDimension
  readonly vsDailyValue: ValueZoneDimension
  readonly vsBoxes: readonly BoxDimension[]
  readonly enclosingZone: EnclosingZone | null
  readonly crossRead: CrossRead
}

export type ObservationScope = 'overnight' | 'session'
export type ExcursionDirection = 'above' | 'below'
export type ExcursionOutcome = 'failed-look' | 'extended-return' | 'open'

export type Excursion = {
  readonly direction: ExcursionDirection
  readonly startedAt: string
  readonly endedAt: string | null
  readonly minutes: number
  readonly scope: ObservationScope
  readonly outcome: ExcursionOutcome
  /** R5 grade, failed looks only. */
  readonly grade: FailedLookGrade | null
  readonly extremePrice: number
}

export type HoldingSideFact = {
  readonly side: HoldingSide
  readonly windowMinutes: number
  readonly closes: number
  readonly scope: ObservationScope | 'mixed'
  readonly from: string
  readonly to: string
}

export type AcceptanceState = 'accepted' | 'testing' | 'none'

export type AcceptanceFact = {
  readonly state: AcceptanceState
  readonly direction: ExcursionDirection | null
  readonly sinceAt: string | null
  readonly minutes: number
  readonly scope: ObservationScope | null
}

export type ApproachFailureFact = {
  readonly from: 'below' | 'above'
  readonly closestApproachPts: number
  readonly closestApproachAt: string
  readonly closestPrice: number
  readonly retreatPts: number
  readonly minutesSinceClosest: number
  readonly scope: ObservationScope
}

export type InteractionFact = {
  readonly interacted: boolean
  readonly prints: number
  readonly firstAt: string | null
  readonly lastAt: string | null
  readonly defenses: { readonly session: number; readonly overnight: number }
  readonly failedLookThisSession: boolean
  readonly triggerStatus: TriggerStatus
}

export type BandOriginFacts = {
  readonly bandId: string
  readonly asOf: string
  readonly holdingSide: HoldingSideFact | null
  readonly excursions: readonly Excursion[]
  /** The freshest failed look, or null. */
  readonly latestFailedLook: Excursion | null
  readonly acceptance: AcceptanceFact
  readonly approachFailure: ApproachFailureFact | null
  readonly interaction: InteractionFact
}

export type ObservationCoverage = {
  readonly asOf: string
  readonly tradingDay: string
  readonly rthOpenAt: string
  readonly sessionStarted: boolean
  readonly minutesSinceOpen: number | null
  /** Inside R5's EARLY window. */
  readonly earlyWindow: boolean
  readonly overnightBars: number
  readonly sessionBars: number
  readonly firstBarAt: string | null
  readonly lastCompletedBarAt: string | null
  /** Bars dropped: the export's in-progress bar, bars after asOf, prior trading days. */
  readonly excludedBars: {
    readonly inProgress: number
    readonly afterAsOf: number
    readonly priorTradingDays: number
  }
}

export type OriginDimension = {
  readonly coverage: ObservationCoverage
  readonly bands: readonly BandOriginFacts[]
}

export type DataQualitySeverity = 'insufficient' | 'warning'

export type DataQualityCode =
  | 'export_skew'
  | 'trading_day_mismatch'
  | 'instrument_mismatch'
  | 'export_time_unknown'
  | 'boxes_provisional'
  | 'bars_behind_asof'
  | 'no_observed_bars'
  | 'profile_nodes_unavailable'
  | 'volatility_scale_unavailable'
  | 'overnight_levels_from_htf'
  | 'overnight_levels_missing'
  | 'mgi_symbol_missing'
  | 'mgi_pivot_mismatch'
  | 'mgi_pivot_missing'
  | 'session_not_started'

export type DataQualityIssue = {
  readonly code: DataQualityCode
  readonly severity: DataQualitySeverity
  readonly message: string
}

export type ExportTimes = {
  readonly daily: string
  readonly weekly: string
  readonly mgi: string | null
  readonly bars: string | null
}

export type DataQuality = {
  /** False when any issue is `insufficient` (R13) — the plan must not be `ready`. */
  readonly sufficient: boolean
  readonly issues: readonly DataQualityIssue[]
  readonly exportTimes: ExportTimes
  readonly maxSkewSeconds: number | null
  readonly tradingDay: { readonly study: string; readonly bundle: string; readonly match: boolean }
  readonly boxesProvisional: boolean
  readonly profileNodes: 'present' | 'partial' | 'null'
}

export type JobContext = {
  readonly plannerRevision: string
  readonly asOf: string
  readonly instrument: Instrument
  readonly symbol: string
  readonly tolerance: { readonly merge: number; readonly cap: number }
  readonly price: { readonly value: number; readonly source: 'mgi' | 'job-study' }
  readonly scale: ContextScale
  readonly references: readonly Reference[]
  readonly excludedReferences: readonly ExcludedReference[]
  readonly bands: readonly ConfluenceBand[]
  readonly roles: readonly BandRole[]
  readonly location: LocationDimensions
  readonly origin: OriginDimension
  readonly dataQuality: DataQuality
  readonly warnings: readonly string[]
}
