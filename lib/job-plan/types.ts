import type { Instrument } from './profile-vision/instrument'

/**
 * Normalized Job-study geometry (feat-125, docs/job-planning-task-plan.md "Key
 * decisions" 4). One object merged from feat-118's two per-chart exports
 * (`job-study-daily.json`, `job-study-weekly.json`). Every price is tick-aligned
 * and non-sentinel; every timestamp is DST-resolved in the exchange TZ.
 *
 * Consumers: feat-126 `classifyContext` / feat-127 `buildPlan` via the feat-128
 * job-plan task. Never the briefing engine.
 */

/** A wall-clock timestamp from the exporter, resolved to an instant in the exchange TZ. */
export type ExchangeInstant = {
  /** Exactly as exported: `YYYY-MM-DDTHH:MM:SS`, exchange-local, no offset. */
  readonly wall: string
  /** The same instant as UTC epoch milliseconds. */
  readonly epochMs: number
  /** The same instant as ISO-8601 UTC. */
  readonly iso: string
}

export type LadderSide = 'above' | 'below'

/** One rung of a pivot's target ladder. Destination-only (R2) — never a trigger anchor. */
export type PivotTarget = {
  /** The study's label, e.g. `3A` / `3B`. */
  readonly label: string
  /** Rung number (1 = nearest the pivot). */
  readonly rung: number
  readonly side: LadderSide
  readonly price: number
}

/** Both sides of a ladder, each ordered outward from the pivot (rung 1 first). */
export type PivotLadder = {
  readonly above: readonly PivotTarget[]
  readonly below: readonly PivotTarget[]
}

/**
 * `current` = the pivot for the export's trading day (fresh at run time, the one
 * the plan leans on); `historical` = a prior session's pivot. Historical pivots are
 * kept in full — an untested historical pivot stays relevant (deep-dive rule);
 * whether one is tested needs bars and is feat-126's call, not the parser's.
 */
export type PivotRole = 'current' | 'historical'

/** Per-row subgraph values the exporter found beyond the core set (observed empty). */
export type PivotExtras = Readonly<Record<string, number>>

export type DailyPivot = {
  readonly sessionDate: string
  readonly role: PivotRole
  readonly pivot: number
  readonly valueLow: number
  readonly valueHigh: number
  readonly ladder: PivotLadder
  /** The study's own complete flag (false for the developing session). */
  readonly complete: boolean
  readonly extras: PivotExtras
}

export type WeeklyPivot = {
  readonly weekOf: string
  readonly pivot: number
  readonly valueLow: number
  readonly valueHigh: number
  readonly ladder: PivotLadder
  readonly complete: boolean
  readonly extras: PivotExtras
}

/** A JBA box — a rectangle the operator drew on the daily chart (feat-118). */
export type BalanceArea = {
  readonly low: number
  readonly high: number
  readonly drawingId: number
  /** `user` is the only observed source; anything else is carried with a warning. */
  readonly source: string
  /** Rectangle anchors. Observed degenerate (begin == end) — never assume a span. */
  readonly anchorBegin: ExchangeInstant
  readonly anchorEnd: ExchangeInstant
  readonly color: string
  readonly text: string
}

/** The Autoplot balance-area extremes from the weekly chart. */
export type Autoplot = {
  readonly high: number
  readonly low: number
  /** `rectangle` (fallback read) is the only observed source. */
  readonly source: string
  readonly drawingId: number | null
  readonly color: string | null
}

export type StudySettings = Readonly<Record<string, string | number>>
export type ExportDiagnostics = Readonly<Record<string, string | number | boolean>>

/** Per-file provenance kept alongside the merged geometry. */
export type JobStudySource = {
  readonly contract: string
  readonly exportedAt: ExchangeInstant
  readonly lastBarTime: ExchangeInstant
  readonly currentPrice: number
  readonly diagnostics: ExportDiagnostics
}

export type JobStudyWarningCode =
  | 'export_skew'
  | 'weekly_history_dropped'
  | 'daily_history_missing'
  | 'daily_history_incomplete'
  | 'ladder_rung_gap'
  | 'ladder_asymmetric'
  | 'ladder_empty_side'
  | 'ladder_inside_value_zone'
  | 'value_zone_collapsed'
  | 'week_of_not_monday'
  | 'balance_areas_empty'
  | 'balance_area_duplicate'
  | 'balance_area_anchor_reversed'
  | 'balance_area_source_unknown'
  | 'autoplot_missing'
  | 'autoplot_source_unknown'
  | 'extras_present'

export type JobStudyWarning = {
  readonly code: JobStudyWarningCode
  readonly message: string
}

export type JobStudyErrorCode =
  | 'file_too_large'
  | 'json_invalid'
  | 'schema_invalid'
  | 'schema_version_unsupported'
  | 'contract_mismatch'
  | 'symbol_mismatch'
  | 'symbol_unsupported'
  | 'exchange_tz_invalid'
  | 'exchange_tz_mismatch'
  | 'session_template_unsupported'
  | 'tick_size_mismatch'
  | 'timestamp_invalid'
  | 'last_bar_after_export'
  | 'trading_day_mismatch'
  | 'trading_day_derivation'
  | 'week_of_mismatch'
  | 'price_sentinel'
  | 'tick_misaligned'
  | 'value_zone_order'
  | 'future_session'
  | 'session_duplicate'
  | 'session_weekend'
  | 'daily_current_missing'
  | 'weekly_current_missing'
  | 'target_label_invalid'
  | 'target_label_duplicate'
  | 'target_price_duplicate'
  | 'target_not_monotonic'
  | 'target_wrong_side'
  | 'balance_area_order'

export type JobStudyIssue = {
  readonly code: JobStudyErrorCode
  readonly message: string
}

export type JobStudy = {
  readonly schemaVersion: number
  /** The chart symbol as Sierra reports it, e.g. `NQU6.CME` (identical in both files). */
  readonly symbol: string
  readonly instrument: Instrument
  /** Root + month + year digit, e.g. `NQU6` — the identity used to reject rollover mixing. */
  readonly contractKey: string
  readonly exchangeTz: string
  readonly tickSize: number
  readonly sessionTemplate: string
  /** The trading day both exports describe (Sunday Globex already folded into Monday). */
  readonly tradingDay: string
  /** Monday of the trading week (warned, not rejected, when the study says otherwise). */
  readonly weekOf: string
  /** From the LATER of the two exports. */
  readonly currentPrice: number
  /** The later of the two exports' `exportedAt`. */
  readonly exportedAt: ExchangeInstant
  /** |daily.exportedAt − weekly.exportedAt| in seconds; R13's > 5 min rule is the caller's. */
  readonly exportSkewSeconds: number
  readonly daily: {
    readonly current: DailyPivot
    /** Prior sessions, newest first. */
    readonly history: readonly DailyPivot[]
  }
  readonly weekly: {
    readonly current: WeeklyPivot
    /** Non-current weekly rows discarded (feat-118: the weekly history is a back-read). */
    readonly droppedHistoryRows: number
  }
  /** JBA boxes sorted by `low`, de-duplicated. */
  readonly balanceAreas: readonly BalanceArea[]
  readonly autoplot: Autoplot | null
  readonly sources: {
    readonly daily: JobStudySource
    readonly weekly: JobStudySource
  }
  readonly settings: {
    readonly daily: StudySettings
    readonly weekly: StudySettings
  }
  readonly warnings: readonly JobStudyWarning[]
}
