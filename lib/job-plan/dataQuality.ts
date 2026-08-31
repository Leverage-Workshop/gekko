import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import {
  MINUTE_MS,
  SECOND_MS,
  calendarDateOfMs,
  rthOpenMsOf,
  wallMsOfDate,
  wallMsOfString,
  wallStringOfMs,
} from './chartClock'
import type {
  ContextScale,
  DataQuality,
  DataQualityIssue,
  ExportTimes,
  ObservationCoverage,
} from './contextTypes'
import type { MgiCrossCheck } from './parseJobStudy'
import { PROFILE_KEYS, type ProfileNodes } from './profile-vision/types'
import { EXPORT_SKEW_MAX_SECONDS, r13ExportSkewExceeded, r13TradingDayMatches } from './rules'
import type { JobStudy } from './types'

/**
 * The SEPARATE data-quality field (feat-126, R13) — never a pseudo-state.
 * `insufficient` issues (R13's export skew > 5 min between any two exports,
 * `tradingDay` ≠ the bundle's session, instrument mismatch) make the plan
 * not-`ready`; warnings (provisional boxes, stale bars, missing profile
 * nodes — R14, no volatility scale, MGI cross-check noise) ride along for the
 * card. The MGI and bar exports carry no `exportedAt`; their proxies are the
 * MGI `current.time` on the export's last bar date and the export's last
 * (in-progress) bar timestamp, both a lower bound of the write time.
 */

const HALF_DAY_MS = 12 * 60 * MINUTE_MS

/** asOf this far past the last completed bar means the snapshot is not what the operator is looking at. */
export const BARS_BEHIND_ASOF_MAX_SECONDS = EXPORT_SKEW_MAX_SECONDS

export type DataQualityInput = {
  readonly jobStudy: JobStudy
  readonly mgi: MgiStaticLevels
  readonly execBars: readonly ExecBar[]
  readonly asOfMs: number
  readonly coverage: ObservationCoverage
  readonly instrumentIssue: DataQualityIssue | null
  readonly scale: ContextScale
  readonly profileNodes: ProfileNodes | null
  readonly crossCheck: MgiCrossCheck
  readonly inventoryIssues: readonly DataQualityIssue[]
}

/** MGI `current.time` (HH:MM:SS) placed on the export's last-bar calendar date, ±1 day if that lands > 12 h away. */
function mgiExportMs(mgi: MgiStaticLevels, lastBarMs: number | null): number | null {
  const time = mgi.current?.time
  if (lastBarMs === null || typeof time !== 'string' || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null
  const sameDay = wallMsOfString(`${calendarDateOfMs(lastBarMs)}T${time}`)
  if (sameDay === null) return null
  if (sameDay - lastBarMs > HALF_DAY_MS) return sameDay - 24 * 60 * MINUTE_MS
  if (lastBarMs - sameDay > HALF_DAY_MS) return sameDay + 24 * 60 * MINUTE_MS
  return sameDay
}

function exportTimes(study: JobStudy, mgi: MgiStaticLevels, execBars: readonly ExecBar[]): ExportTimes & { readonly ms: readonly number[] } {
  const last = execBars.at(-1)
  const barsMs = last ? wallMsOfDate(last.dateTime) : null
  const mgiMs = mgiExportMs(mgi, barsMs)
  const dailyMs = wallMsOfString(study.sources.daily.exportedAt.wall)
  const weeklyMs = wallMsOfString(study.sources.weekly.exportedAt.wall)
  return {
    daily: study.sources.daily.exportedAt.wall,
    weekly: study.sources.weekly.exportedAt.wall,
    mgi: mgiMs === null ? null : wallStringOfMs(mgiMs),
    bars: barsMs === null ? null : wallStringOfMs(barsMs),
    ms: [dailyMs, weeklyMs, mgiMs, barsMs].filter((ms): ms is number => ms !== null),
  }
}

function skewIssues(times: ReturnType<typeof exportTimes>): { maxSkewSeconds: number | null; issues: DataQualityIssue[] } {
  const issues: DataQualityIssue[] = []
  const maxSkewSeconds = Math.round((Math.max(...times.ms) - Math.min(...times.ms)) / SECOND_MS)
  if (r13ExportSkewExceeded(maxSkewSeconds)) {
    issues.push({
      code: 'export_skew',
      severity: 'insufficient',
      message: `exports are ${maxSkewSeconds}s apart (> ${EXPORT_SKEW_MAX_SECONDS}s, R13): daily ${times.daily}, weekly ${times.weekly}, mgi ${times.mgi ?? 'unknown'}, bars ${times.bars ?? 'unknown'} — request a fresh bundle`,
    })
  }
  if (times.mgi === null || times.bars === null) {
    issues.push({
      code: 'export_time_unknown',
      severity: 'warning',
      message: `export time unknown for ${[times.mgi === null ? 'mgi' : null, times.bars === null ? 'bars' : null].filter(Boolean).join(' + ')} — R13 skew checked over the known exports only`,
    })
  }
  return { maxSkewSeconds, issues }
}

function profileIssues(profileNodes: ProfileNodes | null): { status: DataQuality['profileNodes']; issues: DataQualityIssue[] } {
  if (profileNodes === null) {
    return {
      status: 'null',
      issues: [{ code: 'profile_nodes_unavailable', severity: 'warning', message: 'no profile node read — R2 tiers 8/9 (balance-area / 400-pt rotation profile nodes) are empty (R14)' }],
    }
  }
  const missing = PROFILE_KEYS.filter((key) => (profileNodes.profiles[key]?.consensus ?? null) === null)
  return {
    status: missing.length === 0 ? 'present' : 'partial',
    issues: missing.map((key) => ({
      code: 'profile_nodes_unavailable' as const,
      severity: 'warning' as const,
      message: `profile_nodes_unavailable:${key} — that profile's LVN/HVN references are absent (R14)`,
    })),
  }
}

function crossCheckIssues(check: MgiCrossCheck): DataQualityIssue[] {
  const issues: DataQualityIssue[] = []
  for (const [name, pivot] of [['daily', check.daily], ['weekly', check.weekly]] as const) {
    if (pivot.status === 'mismatch') {
      issues.push({ code: 'mgi_pivot_mismatch', severity: 'warning', message: `${name} Job Pivot: study ${pivot.studyPivot} vs MGI ${pivot.mgiPivot} (${pivot.diffTicks} ticks) — the study is the source, the MGI disagrees` })
    } else if (pivot.status === 'mgi_missing') {
      issues.push({ code: 'mgi_pivot_missing', severity: 'warning', message: `${name} Job Pivot absent from the MGI export — cross-check skipped` })
    }
  }
  return issues
}

export function assessDataQuality(input: DataQualityInput): DataQuality {
  const { jobStudy, coverage, asOfMs } = input
  const times = exportTimes(jobStudy, input.mgi, input.execBars)
  const skew = skewIssues(times)
  const profile = profileIssues(input.profileNodes)
  const tradingDayMatch = r13TradingDayMatches(jobStudy.tradingDay, coverage.tradingDay)
  const boxesProvisional = (wallMsOfString(jobStudy.sources.daily.exportedAt.wall) ?? 0) < rthOpenMsOf(jobStudy.tradingDay)
  const lastBarMs = coverage.lastCompletedBarAt === null ? null : wallMsOfString(coverage.lastCompletedBarAt)

  const issues: DataQualityIssue[] = [
    ...skew.issues,
    ...(tradingDayMatch ? [] : [{ code: 'trading_day_mismatch' as const, severity: 'insufficient' as const, message: `job-study tradingDay ${jobStudy.tradingDay} is not the bundle's session ${coverage.tradingDay} (R13)` }]),
    ...(input.instrumentIssue ? [input.instrumentIssue] : []),
    ...(boxesProvisional ? [{ code: 'boxes_provisional' as const, severity: 'warning' as const, message: `daily export ${jobStudy.sources.daily.exportedAt.wall} precedes the ${jobStudy.tradingDay} RTH open — JBA box edges are provisional until the boxes reform at the open` }] : []),
    ...(lastBarMs === null
      ? [{ code: 'no_observed_bars' as const, severity: 'warning' as const, message: 'no completed exec bar at/before asOf — origin facts are empty' }]
      : asOfMs - lastBarMs > BARS_BEHIND_ASOF_MAX_SECONDS * SECOND_MS
        ? [{ code: 'bars_behind_asof' as const, severity: 'warning' as const, message: `last completed exec bar ${coverage.lastCompletedBarAt} is ${Math.round((asOfMs - lastBarMs) / SECOND_MS)}s before asOf` }]
        : []),
    ...(coverage.sessionStarted ? [] : [{ code: 'session_not_started' as const, severity: 'warning' as const, message: `asOf precedes the ${coverage.rthOpenAt} RTH open — no session facts yet, overnight only` }]),
    ...profile.issues,
    ...(input.scale.source === 'fallback-points' ? [{ code: 'volatility_scale_unavailable' as const, severity: 'warning' as const, message: `computeVolatilityScale returned null — R4 reach is the plain-points fallback (${input.scale.reachPts} pts)` }] : []),
    ...crossCheckIssues(input.crossCheck),
    ...input.inventoryIssues,
  ]

  return {
    sufficient: issues.every((issue) => issue.severity !== 'insufficient'),
    issues,
    exportTimes: { daily: times.daily, weekly: times.weekly, mgi: times.mgi, bars: times.bars },
    maxSkewSeconds: skew.maxSkewSeconds,
    tradingDay: { study: jobStudy.tradingDay, bundle: coverage.tradingDay, match: tradingDayMatch },
    boxesProvisional,
    profileNodes: profile.status,
  }
}
