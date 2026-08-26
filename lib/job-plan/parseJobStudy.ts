import type { z } from 'zod'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { parseContractSymbol } from './contractSymbol'
import { validateMetaPair } from './jobStudyMeta'
import {
  normalizeAutoplot,
  normalizeBalanceAreas,
  normalizeDailyPivots,
  normalizeWeeklyPivots,
} from './jobStudyRows'
import {
  JOB_STUDY_MAX_FILE_BYTES,
  dailyFileSchema,
  envelopeSchema,
  weeklyFileSchema,
  type RawDailyFile,
  type RawWeeklyFile,
} from './jobStudySchema'
import { ticksBetween } from './priceChecks'
import type { JobStudy, JobStudyErrorCode, JobStudyIssue, JobStudyWarning } from './types'

/**
 * parseJobStudy (feat-125) — strict parse + normalization of feat-118's two
 * Job-study exports (`job-study-daily.json`: meta + dailyPivots + balanceAreas;
 * `job-study-weekly.json`: meta + weeklyPivots + autoplot) into ONE `JobStudy`
 * geometry. Pure: strings in, object out, no I/O, no clock. FAILS CLOSED: any
 * error throws `JobStudyParseError` carrying every issue found; nothing is
 * "filled in" (docs/job-planning-task-plan.md, key decisions 3–4).
 *
 * Invariants are calibrated to the real samples `chart-data/job-study-daily.json`
 * + `job-study-weekly.json` and feat-118's recorded evidence:
 *
 * ERRORS — observed to hold on every exported row, or structural to the format:
 *   - byte / array / map-key size caps (a broken exporter cannot DoS the task)
 *   - valid JSON, strict shape (unknown keys rejected), supported `schemaVersion`
 *   - `meta.contract` names the right file; both files carry the SAME symbol
 *     (rollover mixing rejected) and a supported NQ/ES root; the Central exchange
 *     TZ (`America/Chicago` — the 17:00 CT roll below assumes it, so another zone
 *     is unsupported, not merely different); same tick size, tradingDay and
 *     weekOf; the operator's Globex session template
 *   - timestamps resolve in the exchange TZ (DST gaps rejected); lastBarTime is
 *     not after exportedAt; `tradingDay` equals the day lastBarTime's 17:00 CT
 *     roll derives (Sunday Globex folds into Monday); tradingDay lies in weekOf's week
 *   - every price positive (Sierra `0.00` placeholders rejected) and on the tick grid
 *   - `valueLow <= pivot <= valueHigh` on every row (feat-118: holds on every row)
 *   - ladder labels `<n>A|B`, unique labels, unique prices, rungs strictly monotonic
 *     outward, A above / B below the pivot
 *   - no session after tradingDay, no weekend sessions, no duplicate sessions,
 *     a daily row FOR tradingDay (the current pivot), a weekly row FOR weekOf
 *   - JBA box low < high; autoplot low < high
 *
 * WARNINGS — plausible under other study settings, or unobserved, or the
 * caller's decision (R13):
 *   - export skew between the two files > 5 min (`exportSkewSeconds` is reported;
 *     R13's `insufficient` verdict spans MGI/bars too and belongs to the task)
 *   - non-current weekly rows dropped (feat-118: the weekly history is a back-read)
 *   - no prior daily session / an incomplete historical row (planner's call)
 *   - ladder depth gaps, asymmetry, an empty side, a rung inside the value zone
 *   - value zone collapsed to the pivot; weekOf not a Monday (holiday weeks)
 *   - empty balanceAreas, duplicate boxes, reversed anchors, unknown sources,
 *     null autoplot; non-empty `extras`
 *
 * Historical daily pivots are kept in full and flagged `historical` — an
 * untested historical pivot stays relevant; selection is feat-126's.
 */

export * from './types'
export {
  JOB_STUDY_MAX_BALANCE_AREAS,
  JOB_STUDY_MAX_FILE_BYTES,
  JOB_STUDY_MAX_MAP_KEYS,
  JOB_STUDY_MAX_PIVOT_ROWS,
  JOB_STUDY_MAX_TARGETS,
} from './jobStudySchema'
export {
  JOB_STUDY_DAILY_CONTRACT,
  JOB_STUDY_EXCHANGE_TZ,
  JOB_STUDY_EXPORT_SKEW_WARN_SECONDS,
  JOB_STUDY_SESSION_TEMPLATE,
  JOB_STUDY_WEEKLY_CONTRACT,
} from './jobStudyMeta'

export const JOB_STUDY_SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1]

/** MGI Job Pivot vs study pivot: at most this many ticks apart counts as a match. */
export const MGI_CROSS_CHECK_TOLERANCE_TICKS = 1

export type JobStudyInput = {
  /** Raw text of `job-study-daily.json`. */
  readonly daily: string
  /** Raw text of `job-study-weekly.json`. */
  readonly weekly: string
}

export class JobStudyParseError extends Error {
  readonly code: JobStudyErrorCode
  readonly issues: readonly JobStudyIssue[]

  constructor(issues: readonly JobStudyIssue[]) {
    const summary = issues.map((i) => `[${i.code}] ${i.message}`).join('; ')
    super(
      `job-study parse failed (${issues.length} issue${issues.length === 1 ? '' : 's'}): ${summary}`
    )
    this.name = 'JobStudyParseError'
    this.code = issues[0]?.code ?? 'schema_invalid'
    this.issues = issues
  }
}

type FileKind = 'daily' | 'weekly'

type FileResult<T> = { readonly data: T | null; readonly issues: readonly JobStudyIssue[] }

const failed = <T>(code: JobStudyErrorCode, message: string): FileResult<T> => ({
  data: null,
  issues: [{ code, message }],
})

function parseJsonText(text: string, kind: FileKind): FileResult<unknown> {
  if (Buffer.byteLength(text, 'utf8') > JOB_STUDY_MAX_FILE_BYTES) {
    return failed('file_too_large', `${kind} file exceeds ${JOB_STUDY_MAX_FILE_BYTES} bytes`)
  }
  try {
    return { data: JSON.parse(text) as unknown, issues: [] }
  } catch (error) {
    return failed('json_invalid', `${kind} file is not valid JSON: ${(error as Error).message}`)
  }
}

function formatZodIssues(kind: FileKind, error: z.ZodError): JobStudyIssue[] {
  return error.issues.map((i) => ({
    code: 'schema_invalid' as const,
    message: `${kind} ${i.path.map(String).join('.') || '<root>'}: ${i.message}`,
  }))
}

/** Size cap, JSON, schema version, then the strict shape — never throws; issues are collected. */
function parseFile<T>(text: string, kind: FileKind, schema: z.ZodType<T>): FileResult<T> {
  const json = parseJsonText(text, kind)
  if (json.issues.length > 0) return { data: null, issues: json.issues }
  const envelope = envelopeSchema.safeParse(json.data)
  if (!envelope.success) return { data: null, issues: formatZodIssues(kind, envelope.error) }
  const version = envelope.data.meta.schemaVersion
  if (!JOB_STUDY_SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return failed(
      'schema_version_unsupported',
      `${kind} schemaVersion ${version} is not supported (supported: ${JOB_STUDY_SUPPORTED_SCHEMA_VERSIONS.join(',')})`
    )
  }
  const result = schema.safeParse(json.data)
  if (!result.success) return { data: null, issues: formatZodIssues(kind, result.error) }
  return { data: result.data, issues: [] }
}

function mergeStudy(daily: RawDailyFile, weekly: RawWeeklyFile): JobStudy {
  const meta = validateMetaPair(daily.meta, weekly.meta)
  if (meta.shared === null || meta.sources === null) throw new JobStudyParseError(meta.issues)
  const { shared, sources } = meta

  const dailyRows = normalizeDailyPivots(daily.dailyPivots, shared.tradingDay, shared.tickSize)
  const weeklyRows = normalizeWeeklyPivots(weekly.weeklyPivots, shared.weekOf, shared.tickSize)
  const boxes = normalizeBalanceAreas(daily.balanceAreas, shared.exchangeTz, shared.tickSize)
  const autoplot = normalizeAutoplot(weekly.autoplot, shared.tickSize)

  const issues = [...dailyRows.issues, ...weeklyRows.issues, ...boxes.issues, ...autoplot.issues]
  if (issues.length > 0 || dailyRows.current === null || weeklyRows.current === null) {
    throw new JobStudyParseError(issues)
  }
  const warnings: JobStudyWarning[] = [
    ...meta.warnings,
    ...dailyRows.warnings,
    ...weeklyRows.warnings,
    ...boxes.warnings,
    ...autoplot.warnings,
  ]

  return {
    schemaVersion: shared.schemaVersion,
    symbol: shared.symbol,
    instrument: shared.instrument,
    contractKey: shared.contractKey,
    exchangeTz: shared.exchangeTz,
    tickSize: shared.tickSize,
    sessionTemplate: shared.sessionTemplate,
    tradingDay: shared.tradingDay,
    weekOf: shared.weekOf,
    currentPrice: shared.currentPrice,
    exportedAt: shared.exportedAt,
    exportSkewSeconds: shared.exportSkewSeconds,
    daily: { current: dailyRows.current, history: dailyRows.history },
    weekly: { current: weeklyRows.current, droppedHistoryRows: weeklyRows.droppedHistoryRows },
    balanceAreas: boxes.balanceAreas,
    autoplot: autoplot.autoplot,
    sources,
    settings: { daily: daily.meta.studySettings.daily, weekly: weekly.meta.studySettings.weekly },
    warnings,
  }
}

/**
 * Parse both Job-study export files into one normalized geometry.
 * @throws JobStudyParseError with every invariant failure found (fail closed).
 */
export function parseJobStudy(input: JobStudyInput): JobStudy {
  const daily = parseFile(input.daily, 'daily', dailyFileSchema)
  const weekly = parseFile(input.weekly, 'weekly', weeklyFileSchema)
  if (daily.data === null || weekly.data === null) {
    throw new JobStudyParseError([...daily.issues, ...weekly.issues])
  }
  return mergeStudy(daily.data, weekly.data)
}

export type MgiCrossCheckStatus = 'match' | 'mismatch' | 'mgi_missing'

export type MgiPivotCheck = {
  readonly status: MgiCrossCheckStatus
  readonly studyPivot: number
  /** null when the MGI export lacks the level or carries a `0.00` placeholder. */
  readonly mgiPivot: number | null
  readonly diffTicks: number | null
}

export type MgiSymbolCheck = {
  readonly status: MgiCrossCheckStatus
  readonly study: string
  readonly mgi: string | null
}

export type MgiCrossCheck = {
  /** True when nothing CONTRADICTS: no pivot or symbol mismatch, and both pivots present. */
  readonly ok: boolean
  readonly toleranceTicks: number
  readonly daily: MgiPivotCheck
  readonly weekly: MgiPivotCheck
  readonly symbol: MgiSymbolCheck
}

function checkPivot(
  studyPivot: number,
  mgiPivot: number | undefined,
  tickSize: number,
  toleranceTicks: number
): MgiPivotCheck {
  if (mgiPivot === undefined || mgiPivot <= 0) {
    return { status: 'mgi_missing', studyPivot, mgiPivot: null, diffTicks: null }
  }
  const diffTicks = ticksBetween(studyPivot, mgiPivot, tickSize)
  return {
    status: diffTicks <= toleranceTicks ? 'match' : 'mismatch',
    studyPivot,
    mgiPivot,
    diffTicks,
  }
}

function checkSymbol(study: string, mgiSymbol: string | undefined): MgiSymbolCheck {
  if (mgiSymbol === undefined) return { status: 'mgi_missing', study, mgi: null }
  const a = parseContractSymbol(study)
  const b = parseContractSymbol(mgiSymbol)
  const same = a !== null && b !== null && a.key === b.key
  return { status: same ? 'match' : 'mismatch', study, mgi: mgiSymbol }
}

/**
 * Compare the study's current daily / weekly pivots against the MGI export's
 * `daily.jobPivot` / `weekly.jobPivot` (both are meant to be the same study's
 * value) and the two exports' contract identity. Returns the structured result;
 * the caller decides what is fatal. `mgi_missing` is reported, not a match.
 */
export function crossCheckWithMgi(
  study: JobStudy,
  mgi: MgiStaticLevels,
  toleranceTicks: number = MGI_CROSS_CHECK_TOLERANCE_TICKS
): MgiCrossCheck {
  const daily = checkPivot(
    study.daily.current.pivot,
    mgi.daily?.jobPivot,
    study.tickSize,
    toleranceTicks
  )
  const weekly = checkPivot(
    study.weekly.current.pivot,
    mgi.weekly?.jobPivot,
    study.tickSize,
    toleranceTicks
  )
  const symbol = checkSymbol(study.symbol, mgi.symbol)
  const ok = daily.status === 'match' && weekly.status === 'match' && symbol.status !== 'mismatch'
  return { ok, toleranceTicks, daily, weekly, symbol }
}
