import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { HtfBar } from '@/lib/engine/parseHtfBars'
import { classifyContext, type ClassifyContextInput } from '@/lib/job-plan/classifyContext'
import type { ConsensusNode, ProfileNodes } from '@/lib/job-plan/profile-vision/types'
import type { RenderMeta } from '@/lib/job-plan/profile-vision/renderProfile'
import type { JobStudy } from '@/lib/job-plan/types'
import { parseWith } from './jobStudy'

/**
 * Builders for the feat-126 classifyContext tests. The geometry is the REAL
 * job-study pair (NQ, trading day 2026-08-24: weekly pivot 29488 in
 * [29292.25, 29683.5], daily pivot 29393.5 in [29379.5, 29407.5], JBA boxes
 * [29240, 29696.25] and [30204, 30334], autoplot [29863.5, 30287.5]); the
 * export times are moved into the session so the happy path is not skewed.
 */

export const TRADING_DAY = '2026-08-24'
export const AS_OF = '2026-08-24T09:30:00'

/** Wall-clock `YYYY-MM-DDTHH:MM:SS` → the engine's process-local bar Date. */
export function wallDate(wall: string): Date {
  const [date, time] = wall.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi, s] = time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi, s)
}

export function studyAt(exportedAt: string = AS_OF, overrides: Partial<JobStudy> = {}): JobStudy {
  const base = parseWith()
  const instant = { wall: exportedAt, epochMs: 0, iso: '' }
  return {
    ...base,
    exportedAt: instant,
    exportSkewSeconds: 0,
    sources: {
      daily: { ...base.sources.daily, exportedAt: instant },
      weekly: { ...base.sources.weekly, exportedAt: instant },
    },
    ...overrides,
  }
}

export function mgiAt(time: string, price: number, overrides: Partial<MgiStaticLevels> = {}): MgiStaticLevels {
  return {
    symbol: 'NQU26',
    current: { time, price },
    daily: {
      rip: 29420,
      onh: 29460,
      onl: 29280,
      pdh: 29540,
      pdl: 29230,
      pdc: 29350,
      jobPivot: 29393.5,
      vwap24: 29360,
      ibh: 0,
      ibl: 0,
      orHigh: 0,
      orLow: 0,
      orMid: 0,
      ...overrides.daily,
    },
    weekly: {
      wkOpen: 29300,
      jobPivot: 29488,
      pwHigh: 29800,
      pwLow: 29150,
      pwVAH: 29650,
      pwVAL: 29310,
      vwap: 29400,
      ...overrides.weekly,
    },
    monthly: { pmHigh: 30975.5, pmLow: 28227.75, ...overrides.monthly },
    ...(overrides.symbol !== undefined ? { symbol: overrides.symbol } : {}),
    ...(overrides.current !== undefined ? { current: overrides.current } : {}),
  }
}

export type BarSpec = readonly [wall: string, high: number, low: number, close: number]

export function execBar(wall: string, high: number, low: number, close: number, volume = 750): ExecBar {
  return {
    dateTime: wallDate(wall),
    open: close,
    high,
    low,
    close,
    legVWAP: 0,
    deltaIntensity: 0,
    volume,
    bidVolume: volume / 2,
    askVolume: volume / 2,
    numberOfTrades: 100,
    delta: 0,
  }
}

/** Bars from specs plus a trailing in-progress bar one minute after the last. */
export function execBars(specs: readonly BarSpec[], inProgress?: BarSpec): ExecBar[] {
  const bars = specs.map(([wall, high, low, close]) => execBar(wall, high, low, close))
  if (inProgress) bars.push(execBar(inProgress[0], inProgress[1], inProgress[2], inProgress[3], 320))
  return bars
}

/** `count` flat bars every `stepMinutes` from `startWall`, all at `price` ± 1. */
export function flatBars(startWall: string, count: number, stepMinutes: number, price: number): BarSpec[] {
  const start = wallDate(startWall)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * stepMinutes * 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const wall = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return [wall, price + 1, price - 1, price] as const
  })
}

function htfBar(wall: string, o: number, h: number, l: number, c: number): HtfBar {
  return { dateTime: wallDate(wall), open: o, high: h, low: l, close: c, volume: 1000, bidVolume: 500, askVolume: 500, delta: 0 }
}

/**
 * Complete RTH sessions (15 × 30-min bars) with an overnight bar each, for the
 * volatility scale. `trailing` appends that day's 03:00 overnight bar and an
 * in-progress 09:00 RTH row (the export's last row, always dropped as of asOf).
 */
export function htfSessions(dates: readonly string[], base: number, halfRange: number, trailing?: string): HtfBar[] {
  const tail = trailing
    ? [
        htfBar(`${trailing}T03:00:00`, base, base + halfRange / 2, base - halfRange / 2, base),
        htfBar(`${trailing}T09:00:00`, base, base + 1, base - 1, base),
      ]
    : []
  return [...sessions(dates, base, halfRange), ...tail]
}

function sessions(dates: readonly string[], base: number, halfRange: number): HtfBar[] {
  return dates.flatMap((date) => {
    const overnight = htfBar(`${date}T03:00:00`, base, base + halfRange / 2, base - halfRange / 2, base)
    const rth = Array.from({ length: 15 }, (_, i) => {
      const minutes = 8 * 60 + 30 + i * 30
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
      const mm = String(minutes % 60).padStart(2, '0')
      const wide = i === 7
      return htfBar(`${date}T${hh}:${mm}:00`, base, base + (wide ? halfRange : halfRange / 4), base - (wide ? halfRange : halfRange / 4), base)
    })
    return [overnight, ...rth]
  })
}

export const HTF_DATES = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']

export type NodeSpec = Partial<ConsensusNode> & { priceLow: number; priceHigh: number }

export function node(spec: NodeSpec): ConsensusNode {
  return {
    kind: 'lvn',
    prominence: 1,
    primary: false,
    position: 'mid',
    shape: 'valley',
    agreement: 3,
    samples: 3,
    ...spec,
  }
}

export function profileNodes(fiveDay: readonly ConsensusNode[] | null, fourHour: readonly ConsensusNode[] | null): ProfileNodes {
  const entry = (nodes: readonly ConsensusNode[] | null) => ({
    consensus:
      nodes === null
        ? null
        : { nodes, thinZones: [], profileShape: 'bell' as const, unfinished: false, successfulSamples: 3, samples: 3 },
    raw: [],
    imageHashes: [],
    render: {} as RenderMeta,
  })
  return {
    instrument: 'NQ',
    modelId: 'test/vision',
    effort: null,
    promptRevision: 'test',
    fewShotSource: 'test',
    samples: 3,
    profiles: { '5d': entry(fiveDay), '4h': entry(fourHour) },
    warnings: [],
  }
}

/** The default happy-path input: 09:30 Monday, price 29350, overnight + 60 min of session bars. */
export function defaultInput(overrides: Partial<ClassifyContextInput> = {}): ClassifyContextInput {
  const overnight = flatBars('2026-08-23T17:00:00', 30, 30, 29350)
  const session = flatBars('2026-08-24T08:30:00', 59, 1, 29350)
  return {
    jobStudy: studyAt(),
    mgi: mgiAt('09:29:00', 29350),
    execBars: execBars([...overnight, ...session], ['2026-08-24T09:29:00', 29351, 29349, 29350]),
    htfBars: htfSessions(HTF_DATES, 29400, 100, TRADING_DAY),
    profileNodes: null,
    asOf: AS_OF,
    ...overrides,
  }
}

export const classify = (overrides: Partial<ClassifyContextInput> = {}) => classifyContext(defaultInput(overrides))
