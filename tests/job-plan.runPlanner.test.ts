import { describe, expect, it } from 'vitest'
import { JobStudyParseError } from '@/lib/job-plan/parseJobStudy'
import { MGI_MAX_BYTES, PlannerInputError, parseMgiJson, runPlanner, type RunPlannerInput } from '@/lib/job-plan/runPlanner'
import { PLANNER_REVISION } from '@/lib/job-plan/rules'
import { flatBars, mgiAt, node, profileNodes, wallDate, type BarSpec } from './helpers/jobContext'
import { DAILY, WEEKLY, fixture, mutate } from './helpers/jobStudy'

/**
 * runPlanner over the raw file texts feat-128 will hand it: the real
 * job-study pair (export times moved into the session so R13 is satisfied),
 * an MGI JSON and generated bar CSVs.
 */

const AS_OF = '2026-08-24T09:30:00'

function inSession(text: string): string {
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

function execCsv(specs: readonly BarSpec[]): string {
  const rows = specs.map(([wall, high, low, close]) => `${csvDate(wall)},${close},${high},${low},${close},${close},0,750,375,375,100`)
  return ['DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity,Volume,BidVolume,AskVolume,NumberOfTrades', ...rows].join('\n')
}

function htfCsv(): string {
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

function input(overrides: Partial<RunPlannerInput> = {}): RunPlannerInput {
  const bars: BarSpec[] = [...flatBars('2026-08-23T17:00:00', 30, 30, 29350), ...flatBars('2026-08-24T08:30:00', 59, 1, 29350), ['2026-08-24T09:29:00', 29351, 29349, 29350]]
  return {
    files: {
      jobStudyDaily: inSession(DAILY),
      jobStudyWeekly: inSession(WEEKLY),
      mgi: JSON.stringify(mgiAt('09:29:00', 29350)),
      execBars: execCsv(bars),
      htfBars: htfCsv(),
    },
    profileNodes: null,
    asOf: AS_OF,
    ...overrides,
  }
}

describe('runPlanner: parse → classify → build as one pure entry point', () => {
  it('produces a ready plan from the real job-study pair + MGI + bar CSVs, deterministically', () => {
    const { plan, warnings } = runPlanner(input())
    expect(plan.status).toBe('ready')
    expect(plan.meta).toMatchObject({ plannerRevision: PLANNER_REVISION, asOf: AS_OF, instrument: 'NQ', symbol: 'NQU26', tradingDay: '2026-08-24', bundleId: null, inputFingerprint: null })
    expect(plan.context.dataQuality.sufficient).toBe(true)
    expect(plan.plays.length).toBeGreaterThan(0)
    expect(plan.plays.length).toBeLessThanOrEqual(4)
    expect(warnings).toEqual(plan.warnings)
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('profile_nodes_unavailable')]))
    expect(runPlanner(input())).toEqual(runPlanner(input()))
  })

  it('on the real geometry at 29345 (flat bars, no fact): mid-box two-way between JBA 1 low 29240 and JBA 1 high 29696.25 leads', () => {
    const bars: BarSpec[] = [...flatBars('2026-08-23T17:00:00', 30, 30, 29345), ...flatBars('2026-08-24T08:30:00', 59, 1, 29345), ['2026-08-24T09:29:00', 29346, 29344, 29345]]
    const { plan } = runPlanner(input({ files: { ...input().files, mgi: JSON.stringify(mgiAt('09:29:00', 29345)), execBars: execCsv(bars) } }))
    expect(plan.plays[0]).toMatchObject({ stance: 'stand-down', band: { low: 29240, high: 29696.25 } })
    expect(plan.lean.basis).toBe('mid-zone')
    expect(plan.plays.some((x) => x.activation.grounding === 'failed-look')).toBe(false)
  })

  it('carries the meta placeholders through and takes the vision revision / model from the read', () => {
    const nodes = profileNodes([node({ priceLow: 29280, priceHigh: 29284, primary: true })], null)
    const { plan } = runPlanner(input({ profileNodes: nodes, meta: { bundleId: 'bundle-1', inputFingerprint: 'sha', sourceHashes: { mgi: 'h1' } } }))
    expect(plan.meta).toMatchObject({ bundleId: 'bundle-1', inputFingerprint: 'sha', visionPromptRevision: 'test', visionModelId: 'test/vision' })
    expect(plan.meta.sourceHashes.mgi).toBe('h1')
    expect(plan.context.references.some((r) => r.source === 'profile-5d')).toBe(true)
    const explicit = runPlanner(input({ profileNodes: nodes, meta: { visionModelId: 'override' } }))
    expect(explicit.plan.meta.visionModelId).toBe('override')
  })

  it('geometry that parses but is skewed (R13) RETURNS an insufficient plan rather than throwing', () => {
    const { plan } = runPlanner(input({ files: { ...input().files, jobStudyDaily: DAILY, jobStudyWeekly: WEEKLY } }))
    expect(plan.status).toBe('insufficient')
    expect(plan.plays).toEqual([])
    expect(plan.standDownReasons.join('\n')).toContain('export_skew')
  })

  it('a job-study file that does not parse throws JobStudyParseError with its issues', () => {
    expect(() => runPlanner(input({ files: { ...input().files, jobStudyDaily: fixture('daily.schema-v2.json') } }))).toThrow(JobStudyParseError)
  })

  it.each([
    ['mgi_invalid', { mgi: '{not json' }],
    ['mgi_invalid', { mgi: JSON.stringify({ daily: { rip: 'x' } }) }],
    ['mgi_too_large', { mgi: JSON.stringify({ pad: 'x'.repeat(MGI_MAX_BYTES) }) }],
    ['exec_bars_invalid', { execBars: 'DateTime,Open\n2026-08-24 09:00:00,1' }],
    ['htf_bars_invalid', { htfBars: 'nope' }],
  ] as const)('%s: a broken file throws PlannerInputError', (code, files) => {
    let caught: unknown
    try {
      runPlanner(input({ files: { ...input().files, ...files } }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(PlannerInputError)
    expect((caught as PlannerInputError).code).toBe(code)
  })

  it('validates its own boundary: a malformed asOf or an empty file is input_invalid', () => {
    expect(() => runPlanner(input({ asOf: '2026-08-24 09:30' }))).toThrow(/input_invalid/)
    expect(() => runPlanner(input({ files: { ...input().files, mgi: '' } }))).toThrow(/input_invalid/)
  })

  it('parseMgiJson accepts the checked-in sample and keeps its shape', () => {
    const mgi = parseMgiJson(JSON.stringify(mgiAt('09:29:00', 29350)))
    expect(mgi.weekly?.wkOpen).toBe(29300)
    expect(mgi.symbol).toBe('NQU26')
  })
})
