import { parseContractSymbol } from './contractSymbol'
import {
  addDays,
  isValidTimeZone,
  resolveWallClock,
  tradingDayOfWallClock,
  weekdayOf,
} from './exchangeTime'
import type { RawDailyMeta, RawWeeklyMeta } from './jobStudySchema'
import { checkPrice } from './priceChecks'
import type { Instrument } from './profile-vision/instrument'
import type { ExchangeInstant, JobStudyIssue, JobStudySource, JobStudyWarning } from './types'

/**
 * Cross-file meta agreement for the two Job-study exports (feat-125). Both files
 * come from the same Sierra instance within one export cycle, so their contract,
 * TZ, session template, tick size, trading day and week must agree — a
 * disagreement means a straddled cycle, a stale file, or a chart on a rolled
 * contract, and the planner must not merge them.
 */

/** The file-identity strings feat-118's exporters write into `meta.contract`. */
export const JOB_STUDY_DAILY_CONTRACT = 'gekko.job-study-daily'
export const JOB_STUDY_WEEKLY_CONTRACT = 'gekko.job-study-weekly'

/** The operator's chart session template; the 17:00 CT roll in exchangeTime.ts assumes it. */
export const JOB_STUDY_SESSION_TEMPLATE = 'Globex 17:00:00-16:59:59 CT'

/** R13: exports further apart than this are reported (the caller decides `insufficient`). */
export const JOB_STUDY_EXPORT_SKEW_WARN_SECONDS = 300

const MONDAY = 1
const DAYS_IN_WEEK = 7

export type SharedMeta = {
  readonly schemaVersion: number
  readonly symbol: string
  readonly instrument: Instrument
  readonly contractKey: string
  readonly exchangeTz: string
  readonly tickSize: number
  readonly sessionTemplate: string
  readonly tradingDay: string
  readonly weekOf: string
  readonly currentPrice: number
  readonly exportedAt: ExchangeInstant
  readonly exportSkewSeconds: number
}

export type MetaCheck = {
  readonly shared: SharedMeta | null
  readonly sources: { readonly daily: JobStudySource; readonly weekly: JobStudySource } | null
  readonly issues: readonly JobStudyIssue[]
  readonly warnings: readonly JobStudyWarning[]
}

type FileKind = 'daily' | 'weekly'
type AnyMeta = RawDailyMeta | RawWeeklyMeta

const issue = (code: JobStudyIssue['code'], message: string): JobStudyIssue => ({ code, message })

/** Resolve a wall-clock string in `tz`, or null with a `timestamp_invalid` issue. */
export function toInstant(
  wall: string,
  tz: string,
  where: string
): { instant: ExchangeInstant | null; issues: JobStudyIssue[] } {
  const epochMs = resolveWallClock(wall, tz)
  if (epochMs === null) {
    return {
      instant: null,
      issues: [issue('timestamp_invalid', `${where} "${wall}" does not resolve in ${tz}`)],
    }
  }
  return { instant: { wall, epochMs, iso: new Date(epochMs).toISOString() }, issues: [] }
}

function checkContract(meta: AnyMeta, kind: FileKind): JobStudyIssue[] {
  const expected = kind === 'daily' ? JOB_STUDY_DAILY_CONTRACT : JOB_STUDY_WEEKLY_CONTRACT
  return meta.contract === expected
    ? []
    : [issue('contract_mismatch', `${kind} file is "${meta.contract}", expected "${expected}"`)]
}

function checkTemplate(meta: AnyMeta, kind: FileKind): JobStudyIssue[] {
  const template = meta.studySettings.sessionTemplate
  return template === JOB_STUDY_SESSION_TEMPLATE
    ? []
    : [
        issue(
          'session_template_unsupported',
          `${kind} session template "${template}" is not "${JOB_STUDY_SESSION_TEMPLATE}"`
        ),
      ]
}

/** One file's own timestamps and their consistency with its trading day. */
function checkFileClock(
  meta: AnyMeta,
  kind: FileKind
): { source: JobStudySource | null; issues: JobStudyIssue[] } {
  if (!isValidTimeZone(meta.exchangeTz)) {
    return {
      source: null,
      issues: [issue('exchange_tz_invalid', `${kind} exchangeTz "${meta.exchangeTz}" is unknown`)],
    }
  }
  const exported = toInstant(meta.exportedAt, meta.exchangeTz, `${kind} exportedAt`)
  const lastBar = toInstant(meta.lastBarTime, meta.exchangeTz, `${kind} lastBarTime`)
  const issues = [...exported.issues, ...lastBar.issues]
  if (exported.instant === null || lastBar.instant === null) return { source: null, issues }

  const order =
    lastBar.instant.epochMs > exported.instant.epochMs
      ? [
          issue(
            'last_bar_after_export',
            `${kind} lastBarTime ${meta.lastBarTime} is after exportedAt ${meta.exportedAt}`
          ),
        ]
      : []
  const derived = tradingDayOfWallClock(meta.lastBarTime)
  const derivation =
    derived === meta.tradingDay
      ? []
      : [
          issue(
            'trading_day_derivation',
            `${kind} tradingDay ${meta.tradingDay} but lastBarTime ${meta.lastBarTime} belongs to ${derived} (17:00 CT roll)`
          ),
        ]
  return {
    source: {
      contract: meta.contract,
      exportedAt: exported.instant,
      lastBarTime: lastBar.instant,
      currentPrice: meta.currentPrice,
      diagnostics: meta.diagnostics,
    },
    issues: [...issues, ...order, ...derivation],
  }
}

function checkAgreement(daily: RawDailyMeta, weekly: RawWeeklyMeta): JobStudyIssue[] {
  const pairs: [boolean, JobStudyIssue['code'], string][] = [
    [
      daily.symbol === weekly.symbol,
      'symbol_mismatch',
      `daily is ${daily.symbol}, weekly is ${weekly.symbol} (one contract only)`,
    ],
    [
      daily.exchangeTz === weekly.exchangeTz,
      'exchange_tz_mismatch',
      `daily is ${daily.exchangeTz}, weekly is ${weekly.exchangeTz}`,
    ],
    [
      daily.tickSize === weekly.tickSize,
      'tick_size_mismatch',
      `daily is ${daily.tickSize}, weekly is ${weekly.tickSize}`,
    ],
    [
      daily.tradingDay === weekly.tradingDay,
      'trading_day_mismatch',
      `daily is ${daily.tradingDay}, weekly is ${weekly.tradingDay}`,
    ],
    [
      daily.weekOf === weekly.weekOf,
      'week_of_mismatch',
      `daily is ${daily.weekOf}, weekly is ${weekly.weekOf}`,
    ],
  ]
  return pairs.flatMap(([ok, code, message]) => (ok ? [] : [issue(code, message)]))
}

function checkSymbol(symbol: string): {
  identity: { instrument: Instrument; contractKey: string } | null
  issues: JobStudyIssue[]
} {
  const parsed = parseContractSymbol(symbol)
  if (parsed === null || parsed.instrument === null) {
    return {
      identity: null,
      issues: [issue('symbol_unsupported', `symbol "${symbol}" is not a supported NQ/ES contract`)],
    }
  }
  return { identity: { instrument: parsed.instrument, contractKey: parsed.key }, issues: [] }
}

function checkWeek(
  tradingDay: string,
  weekOf: string
): {
  issues: JobStudyIssue[]
  warnings: JobStudyWarning[]
} {
  const inWeek = tradingDay >= weekOf && tradingDay < addDays(weekOf, DAYS_IN_WEEK)
  const issues = inWeek
    ? []
    : [issue('week_of_mismatch', `tradingDay ${tradingDay} is not in the week of ${weekOf}`)]
  const warnings: JobStudyWarning[] =
    weekdayOf(weekOf) === MONDAY
      ? []
      : [{ code: 'week_of_not_monday', message: `weekOf ${weekOf} is not a Monday` }]
  return { issues, warnings }
}

function skewSeconds(a: ExchangeInstant, b: ExchangeInstant): number {
  return Math.round(Math.abs(a.epochMs - b.epochMs) / 1000)
}

/** Validate both files' meta blocks and derive the shared geometry header. */
export function validateMetaPair(daily: RawDailyMeta, weekly: RawWeeklyMeta): MetaCheck {
  const dailyClock = checkFileClock(daily, 'daily')
  const weeklyClock = checkFileClock(weekly, 'weekly')
  const symbol = checkSymbol(daily.symbol)
  const week = checkWeek(daily.tradingDay, daily.weekOf)
  const issues = [
    ...checkContract(daily, 'daily'),
    ...checkContract(weekly, 'weekly'),
    ...checkTemplate(daily, 'daily'),
    ...checkTemplate(weekly, 'weekly'),
    ...checkAgreement(daily, weekly),
    ...symbol.issues,
    ...dailyClock.issues,
    ...weeklyClock.issues,
    ...week.issues,
    ...checkPrice(daily.currentPrice, daily.tickSize, 'daily currentPrice'),
    ...checkPrice(weekly.currentPrice, weekly.tickSize, 'weekly currentPrice'),
  ]
  if (
    issues.length > 0 ||
    dailyClock.source === null ||
    weeklyClock.source === null ||
    symbol.identity === null
  ) {
    return { shared: null, sources: null, issues, warnings: week.warnings }
  }

  const sources = { daily: dailyClock.source, weekly: weeklyClock.source }
  const later =
    sources.weekly.exportedAt.epochMs >= sources.daily.exportedAt.epochMs
      ? sources.weekly
      : sources.daily
  const exportSkewSeconds = skewSeconds(sources.daily.exportedAt, sources.weekly.exportedAt)
  const skew: JobStudyWarning[] =
    exportSkewSeconds > JOB_STUDY_EXPORT_SKEW_WARN_SECONDS
      ? [
          {
            code: 'export_skew',
            message: `daily and weekly exports are ${exportSkewSeconds}s apart (> ${JOB_STUDY_EXPORT_SKEW_WARN_SECONDS}s, R13)`,
          },
        ]
      : []

  return {
    shared: {
      schemaVersion: daily.schemaVersion,
      symbol: daily.symbol,
      instrument: symbol.identity.instrument,
      contractKey: symbol.identity.contractKey,
      exchangeTz: daily.exchangeTz,
      tickSize: daily.tickSize,
      sessionTemplate: daily.studySettings.sessionTemplate,
      tradingDay: daily.tradingDay,
      weekOf: daily.weekOf,
      currentPrice: later.currentPrice,
      exportedAt: later.exportedAt,
      exportSkewSeconds,
    },
    sources,
    issues: [],
    warnings: [...skew, ...week.warnings],
  }
}
