import { isWeekend } from './exchangeTime'
import { toInstant } from './jobStudyMeta'
import type { RawAutoplot, RawBalanceArea, RawDailyPivot, RawWeeklyPivot } from './jobStudySchema'
import { normalizeLadder } from './pivotLadder'
import { checkPrices } from './priceChecks'
import type {
  Autoplot,
  BalanceArea,
  DailyPivot,
  JobStudyIssue,
  JobStudyWarning,
  PivotLadder,
  WeeklyPivot,
} from './types'

/**
 * Section normalizers for the Job-study exports (feat-125): daily pivots, the
 * weekly pivot, JBA boxes and the Autoplot extremes. Each returns its normalized
 * value plus collected issues (errors) and warnings; nothing throws here.
 */

/** The only balance-area source feat-118 emits (rectangles the operator drew). */
export const BALANCE_AREA_SOURCE_USER = 'user'
/** The only Autoplot read path that works (the OFL study exposes no subgraphs). */
export const AUTOPLOT_SOURCE_RECTANGLE = 'rectangle'

type Sink = {
  readonly issues: readonly JobStudyIssue[]
  readonly warnings: readonly JobStudyWarning[]
}

const issue = (code: JobStudyIssue['code'], message: string): JobStudyIssue => ({ code, message })
const warn = (code: JobStudyWarning['code'], message: string): JobStudyWarning => ({
  code,
  message,
})

type ZoneRow = Pick<RawDailyPivot, 'pivot' | 'valueLow' | 'valueHigh' | 'targets' | 'extras'>

/** Prices, zone order, ladder and extras for one pivot row (daily or weekly). */
function normalizeZoneRow(
  row: ZoneRow,
  tickSize: number,
  where: string
): Sink & { ladder: PivotLadder } {
  const prices = checkPrices(
    { pivot: row.pivot, valueLow: row.valueLow, valueHigh: row.valueHigh },
    tickSize,
    where
  )
  const ordered = row.valueLow <= row.pivot && row.pivot <= row.valueHigh
  const order = ordered
    ? []
    : [
        issue(
          'value_zone_order',
          `${where} needs valueLow <= pivot <= valueHigh, got ${row.valueLow} / ${row.pivot} / ${row.valueHigh}`
        ),
      ]
  const collapsed =
    ordered && row.valueLow === row.valueHigh
      ? [warn('value_zone_collapsed', `${where} value zone collapsed to ${row.pivot}`)]
      : []
  const extras =
    Object.keys(row.extras).length > 0
      ? [warn('extras_present', `${where} carries extras ${Object.keys(row.extras).join(',')}`)]
      : []
  const ladder = normalizeLadder(row.targets, row, tickSize, where)
  return {
    ladder: ladder.ladder,
    issues: [...prices, ...order, ...ladder.issues],
    warnings: [...collapsed, ...extras, ...ladder.warnings],
  }
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const v of values) (seen.has(v) ? dup : seen).add(v)
  return [...dup]
}

export type DailyCheck = Sink & {
  readonly current: DailyPivot | null
  readonly history: readonly DailyPivot[]
}

/**
 * Daily rows: no session after `tradingDay`, no weekend sessions (Globex folds
 * into the weekday), unique dates, and exactly one row FOR `tradingDay` (the
 * current pivot). History is every other row, newest first, kept in full.
 */
export function normalizeDailyPivots(
  rows: readonly RawDailyPivot[],
  tradingDay: string,
  tickSize: number
): DailyCheck {
  const sessionIssues = rows.flatMap((r) => {
    const where = `dailyPivots[${r.sessionDate}]`
    const future =
      r.sessionDate > tradingDay
        ? [issue('future_session', `${where} is after tradingDay ${tradingDay}`)]
        : []
    const weekend = isWeekend(r.sessionDate)
      ? [issue('session_weekend', `${where} falls on a weekend`)]
      : []
    return [...future, ...weekend]
  })
  const dupIssues = duplicateValues(rows.map((r) => r.sessionDate)).map((d) =>
    issue('session_duplicate', `dailyPivots has more than one row for ${d}`)
  )

  const normalized = rows.map((r) => {
    const where = `dailyPivots[${r.sessionDate}]`
    const zone = normalizeZoneRow(r, tickSize, where)
    const pivot: DailyPivot = {
      sessionDate: r.sessionDate,
      role: r.sessionDate === tradingDay ? 'current' : 'historical',
      pivot: r.pivot,
      valueLow: r.valueLow,
      valueHigh: r.valueHigh,
      ladder: zone.ladder,
      complete: r.complete,
      extras: r.extras,
    }
    return { pivot, issues: zone.issues, warnings: zone.warnings }
  })

  const current = normalized.find((n) => n.pivot.role === 'current')?.pivot ?? null
  const currentIssues = current
    ? []
    : [issue('daily_current_missing', `dailyPivots has no row for tradingDay ${tradingDay}`)]
  const history = normalized
    .map((n) => n.pivot)
    .filter((p) => p.role === 'historical')
    .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))

  const historyWarnings: JobStudyWarning[] = [
    ...(history.length === 0
      ? [warn('daily_history_missing', 'dailyPivots carries no prior session')]
      : []),
    ...history
      .filter((p) => !p.complete)
      .map((p) =>
        warn('daily_history_incomplete', `dailyPivots[${p.sessionDate}] is not complete`)
      ),
  ]

  return {
    current,
    history,
    issues: [
      ...sessionIssues,
      ...dupIssues,
      ...currentIssues,
      ...normalized.flatMap((n) => n.issues),
    ],
    warnings: [...normalized.flatMap((n) => n.warnings), ...historyWarnings],
  }
}

export type WeeklyCheck = Sink & {
  readonly current: WeeklyPivot | null
  readonly droppedHistoryRows: number
}

/**
 * Weekly rows: only the row for `weekOf` is trusted (feat-118: the study back-reads
 * the CURRENT week's values at prior weeks' last bars, so history rows duplicate
 * it). Every row is still validated in full — a corrupt row fails the parse even
 * when it would be dropped (strict, no partial trust); only the current row's
 * warnings are reported, since the others never reach the geometry.
 */
export function normalizeWeeklyPivots(
  rows: readonly RawWeeklyPivot[],
  weekOf: string,
  tickSize: number
): WeeklyCheck {
  const future = rows
    .filter((r) => r.weekOf > weekOf)
    .map((r) => issue('future_session', `weeklyPivots[${r.weekOf}] is after weekOf ${weekOf}`))
  const currentRows = rows.filter((r) => r.weekOf === weekOf)
  const dup =
    currentRows.length > 1
      ? [issue('session_duplicate', `weeklyPivots has ${currentRows.length} rows for ${weekOf}`)]
      : []
  const row = currentRows[0]
  if (row === undefined) {
    return {
      current: null,
      droppedHistoryRows: rows.length,
      issues: [
        ...future,
        issue('weekly_current_missing', `weeklyPivots has no row for weekOf ${weekOf}`),
      ],
      warnings: [],
    }
  }
  const checked = rows.map((r) => ({
    row: r,
    zone: normalizeZoneRow(r, tickSize, `weeklyPivots[${r.weekOf}]`),
  }))
  const zone = checked.find((c) => c.row === row)?.zone ?? normalizeZoneRow(row, tickSize, '')
  const rowIssues = checked.flatMap((c) => c.zone.issues)
  const droppedHistoryRows = rows.length - currentRows.length
  const dropped =
    droppedHistoryRows > 0
      ? [
          warn(
            'weekly_history_dropped',
            `${droppedHistoryRows} non-current weekly row(s) dropped (weekly history is a back-read)`
          ),
        ]
      : []
  return {
    current: {
      weekOf: row.weekOf,
      pivot: row.pivot,
      valueLow: row.valueLow,
      valueHigh: row.valueHigh,
      ladder: zone.ladder,
      complete: row.complete,
      extras: row.extras,
    },
    droppedHistoryRows,
    issues: [...future, ...dup, ...rowIssues],
    warnings: [...zone.warnings, ...dropped],
  }
}

export type BalanceAreasCheck = Sink & { readonly balanceAreas: readonly BalanceArea[] }

function normalizeBalanceArea(
  raw: RawBalanceArea,
  tz: string,
  tickSize: number
): Sink & { area: BalanceArea | null } {
  const where = `balanceAreas[${raw.drawingId}]`
  const prices = checkPrices({ low: raw.low, high: raw.high }, tickSize, where)
  const order =
    raw.low < raw.high
      ? []
      : [issue('balance_area_order', `${where} low ${raw.low} >= high ${raw.high}`)]
  const begin = toInstant(raw.anchorTimes.begin, tz, `${where} anchorTimes.begin`)
  const end = toInstant(raw.anchorTimes.end, tz, `${where} anchorTimes.end`)
  const issues = [...prices, ...order, ...begin.issues, ...end.issues]
  if (begin.instant === null || end.instant === null) return { area: null, issues, warnings: [] }

  const warnings: JobStudyWarning[] = [
    ...(begin.instant.epochMs > end.instant.epochMs
      ? [warn('balance_area_anchor_reversed', `${where} anchor begin is after end`)]
      : []),
    ...(raw.source === BALANCE_AREA_SOURCE_USER
      ? []
      : [
          warn(
            'balance_area_source_unknown',
            `${where} source "${raw.source}" is not "${BALANCE_AREA_SOURCE_USER}"`
          ),
        ]),
  ]
  return {
    area: {
      low: raw.low,
      high: raw.high,
      drawingId: raw.drawingId,
      source: raw.source,
      anchorBegin: begin.instant,
      anchorEnd: end.instant,
      color: raw.color,
      text: raw.text,
    },
    issues,
    warnings,
  }
}

/** JBA boxes: low < high, aligned, anchors resolvable; de-duplicated on (low, high), sorted by low. */
export function normalizeBalanceAreas(
  raws: readonly RawBalanceArea[],
  tz: string,
  tickSize: number
): BalanceAreasCheck {
  const checked = raws.map((r) => normalizeBalanceArea(r, tz, tickSize))
  const areas = checked.flatMap((c) => (c.area ? [c.area] : []))
  const keyOf = (a: BalanceArea) => `${a.low}:${a.high}`
  const unique = areas.filter((a, i) => areas.findIndex((b) => keyOf(b) === keyOf(a)) === i)
  const dupWarnings = duplicateValues(areas.map(keyOf)).map((k) =>
    warn('balance_area_duplicate', `balance area ${k.replace(':', '-')} is drawn more than once`)
  )
  const empty = raws.length === 0 ? [warn('balance_areas_empty', 'no JBA boxes on the chart')] : []
  const sorted = [...unique].sort((a, b) => a.low - b.low || a.high - b.high)
  return {
    balanceAreas: sorted,
    issues: checked.flatMap((c) => c.issues),
    warnings: [...checked.flatMap((c) => c.warnings), ...dupWarnings, ...empty],
  }
}

export type AutoplotCheck = Sink & { readonly autoplot: Autoplot | null }

/** Autoplot extremes: high > low, aligned, non-sentinel; null is carried with a warning. */
export function normalizeAutoplot(raw: RawAutoplot, tickSize: number): AutoplotCheck {
  if (raw === null) {
    return {
      autoplot: null,
      issues: [],
      warnings: [warn('autoplot_missing', 'weekly export carries no autoplot extremes')],
    }
  }
  const prices = checkPrices({ high: raw.high, low: raw.low }, tickSize, 'autoplot')
  const order =
    raw.low < raw.high
      ? []
      : [issue('balance_area_order', `autoplot low ${raw.low} >= high ${raw.high}`)]
  const source =
    raw.source === AUTOPLOT_SOURCE_RECTANGLE
      ? []
      : [
          warn(
            'autoplot_source_unknown',
            `autoplot source "${raw.source}" is not "${AUTOPLOT_SOURCE_RECTANGLE}"`
          ),
        ]
  return {
    autoplot: {
      high: raw.high,
      low: raw.low,
      source: raw.source,
      drawingId: raw.drawingId,
      color: raw.color,
    },
    issues: [...prices, ...order],
    warnings: source,
  }
}
