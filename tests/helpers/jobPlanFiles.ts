import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BundleRow } from '@/lib/analyze/loadBundle'
import { flatBars, mgiAt, wallDate, type BarSpec } from './jobContext'
import { DAILY, WEEKLY, mutate } from './jobStudy'

/**
 * The raw bundle file texts the job-plan task downloads (feat-128 tests): the
 * real job-study pair with its export times moved into the session, the real
 * rolling profiles from chart-data/, an MGI JSON and generated bar CSVs — the
 * same inputs tests/job-plan.runPlanner.test.ts feeds the planner directly.
 */

/** 2026-08-24 09:30:00 America/Chicago (CDT) — the run's asOf. */
export const RECEIVED_AT = '2026-08-24T14:30:00.000Z'
export const AS_OF_WALL = '2026-08-24T09:30:00'
export const BUNDLE_ID = '11111111-1111-4111-8111-111111111111'
export const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
export const RUN_ID = 'run_jobplan_test_0001'

export function inSession(text: string): string {
  return mutate(text, (doc) => {
    doc.meta.exportedAt = '2026-08-24T09:29:00'
    doc.meta.lastBarTime = '2026-08-24T09:28:00'
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
function csvDate(wall: string): string {
  const d = wallDate(wall)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function execCsv(specs: readonly BarSpec[]): string {
  const rows = specs.map(
    ([wall, high, low, close]) => `${csvDate(wall)},${close},${high},${low},${close},${close},0,750,375,375,100`,
  )
  return ['DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity,Volume,BidVolume,AskVolume,NumberOfTrades', ...rows].join('\n')
}

export function htfCsv(): string {
  const dates = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24']
  const rows: string[] = []
  for (const date of dates) {
    rows.push(`${date} 03:00:00,29400,29450,29350,29400,1000,500,500`)
    if (date === '2026-08-24') {
      rows.push(`${date} 09:00:00,29400,29401,29399,29400,100,50,50`)
      continue
    }
    for (let i = 0; i < 15; i++) {
      const minutes = 8 * 60 + 30 + i * 30
      const wide = i === 7 ? 100 : 25
      rows.push(`${date} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00,29400,${29400 + wide},${29400 - wide},29400,1000,500,500`)
    }
  }
  return ['DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume', ...rows].join('\n')
}

export function sessionBars(): BarSpec[] {
  return [
    ...flatBars('2026-08-23T17:00:00', 30, 30, 29350),
    ...flatBars('2026-08-24T08:30:00', 59, 1, 29350),
    ['2026-08-24T09:29:00', 29351, 29349, 29350],
  ]
}

const chartData = (name: string) => readFileSync(join(process.cwd(), 'chart-data', name), 'utf8')

export type BundleTexts = {
  readonly jobStudyDaily: string
  readonly jobStudyWeekly: string
  readonly execBars: string
  readonly htfBars: string
  readonly balanceAreaProfile: string
  readonly rotationProfile: string
}

export function bundleTexts(overrides: Partial<BundleTexts> = {}): BundleTexts {
  return {
    jobStudyDaily: inSession(DAILY),
    jobStudyWeekly: inSession(WEEKLY),
    execBars: execCsv(sessionBars()),
    htfBars: htfCsv(),
    balanceAreaProfile: chartData('balance-area.vbp.md'),
    rotationProfile: chartData('four-hundred-rotation.vbp.md'),
    ...overrides,
  }
}

/** Storage paths per ref column, under the per-bundle prefix. */
export const REF_PATHS = {
  job_study_daily_ref: `${BUNDLE_ID}/job-study-daily.json`,
  job_study_weekly_ref: `${BUNDLE_ID}/job-study-weekly.json`,
  exec_csv_ref: `${BUNDLE_ID}/execution_bars.csv`,
  htf_csv_ref: `${BUNDLE_ID}/htf_bars.csv`,
  balance_area_vbp_ref: `${BUNDLE_ID}/balance-area.vbp.md`,
  rotation_vbp_ref: `${BUNDLE_ID}/four-hundred-rotation.vbp.md`,
} as const

export function bundleRow(overrides: Partial<BundleRow> = {}): BundleRow {
  return {
    id: BUNDLE_ID,
    received_at: RECEIVED_AT,
    mgi_json: mgiAt('09:29:00', 29350),
    current_price: 29350,
    is_stale: false,
    five_day_vbp_ref: null,
    four_hour_vbp_ref: null,
    half_rotation_delta_ref: null,
    full_rotation_delta_ref: null,
    tpo_data_ref: null,
    daily_va_ref: null,
    htf_png_ref: null,
    tpo_png_ref: null,
    exec_png_ref: null,
    ...REF_PATHS,
    ...overrides,
  }
}

/** The object store the fake `downloadObject` serves: path → text. */
export function storageOf(texts: BundleTexts): Map<string, string> {
  return new Map([
    [REF_PATHS.job_study_daily_ref, texts.jobStudyDaily],
    [REF_PATHS.job_study_weekly_ref, texts.jobStudyWeekly],
    [REF_PATHS.exec_csv_ref, texts.execBars],
    [REF_PATHS.htf_csv_ref, texts.htfBars],
    [REF_PATHS.balance_area_vbp_ref, texts.balanceAreaProfile],
    [REF_PATHS.rotation_vbp_ref, texts.rotationProfile],
  ])
}
