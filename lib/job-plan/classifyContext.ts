import { z } from 'zod'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { HtfBar } from '@/lib/engine/parseHtfBars'
import { computeVolatilityScale } from '@/lib/engine/volatilityScale'
import { wallMsOfString } from './chartClock'
import { buildConfluenceBands } from './confluenceBands'
import type { ContextScale, DataQualityIssue, JobContext } from './contextTypes'
import { assessDataQuality } from './dataQuality'
import { classifyLocation } from './locationDimensions'
import { htfBarsAsOf, observeBars } from './observedBars'
import { classifyOrigin } from './originFacts'
import { crossCheckWithMgi } from './parseJobStudy'
import { instrumentFromSymbol, type Instrument } from './profile-vision/instrument'
import type { ProfileNodes } from './profile-vision/types'
import { buildReferenceInventory } from './referenceInventory'
import { assignBandRoles } from './referenceRoles'
import { PLANNER_REVISION, REACH_FALLBACK_PTS, REACH_SIGMA, resolveBandTolerance } from './rules'
import type { JobStudy } from './types'

/**
 * `classifyContext` (feat-126, docs/job-planning-task-plan.md "Key decisions"
 * 4): the pure, deterministic context read the Job planner plans from. One
 * instrument (resolved from the MGI `symbol` root — NQ merge 20 / cap 40, ES
 * 5 / 10), everything keyed off the `asOf` input (exchange wall clock,
 * `YYYY-MM-DDTHH:MM:SS`), no clock reads, no I/O, no LLM.
 *
 *   (a) reference inventory with R2 significance (profile nodes AS-IS)
 *   (b) confluence bands, R1 / R1b
 *   (c) role-assigned bands, R4 on `computeVolatilityScale` over the HTF bars
 *   (d) orthogonal location dimensions — weekly value / each JBA box / daily
 *       value zone, R3 "at", R10 mid-zone, disagreements EXPOSED
 *   (e) origin facts R5–R9 from the exec bars in wall-clock minutes, stamped
 *       `asOf`, scoped overnight vs session-so-far
 *   (f) a SEPARATE data-quality field (R13)
 *
 * The Zod schema guards the call boundary only — the JobStudy is the parser's
 * validated output and the bars are the engine parsers'; what is checked here
 * is the shape this module reads.
 */

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const finite = z.number().finite()
const bar = z.looseObject({ dateTime: z.date(), open: finite, high: finite, low: finite, close: finite })
const instant = z.looseObject({ wall: z.string().regex(WALL_CLOCK) })
const valueZone = z.looseObject({ pivot: finite, valueLow: finite, valueHigh: finite })

export const classifyContextInputSchema = z.object({
  jobStudy: z.looseObject({
    symbol: z.string().min(1),
    instrument: z.enum(['NQ', 'ES']),
    tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currentPrice: finite.positive(),
    daily: z.looseObject({ current: valueZone, history: z.array(valueZone) }),
    weekly: z.looseObject({ current: valueZone }),
    balanceAreas: z.array(z.looseObject({ low: finite, high: finite })),
    sources: z.looseObject({
      daily: z.looseObject({ exportedAt: instant }),
      weekly: z.looseObject({ exportedAt: instant }),
    }),
  }),
  mgi: z.looseObject({
    symbol: z.string().optional(),
    current: z.looseObject({ time: z.string().optional(), price: z.number().optional() }).optional(),
  }),
  execBars: z.array(bar),
  htfBars: z.array(bar),
  profileNodes: z.looseObject({ profiles: z.looseObject({}) }).nullable(),
  asOf: z
    .string()
    .regex(WALL_CLOCK, 'asOf must be an exchange wall clock YYYY-MM-DDTHH:MM:SS')
    .refine((s) => wallMsOfString(s) !== null, 'asOf is not a real wall-clock time'),
})

export type ClassifyContextInput = {
  readonly jobStudy: JobStudy
  readonly mgi: MgiStaticLevels
  /** 750-volume exec bars, chronological, in-progress bar last. */
  readonly execBars: readonly ExecBar[]
  /** 30-min HTF bars — the volatility scale (and the overnight fallback) only; bars after asOf are ignored. */
  readonly htfBars: readonly HtfBar[]
  readonly profileNodes: ProfileNodes | null
  /** Exchange wall clock `YYYY-MM-DDTHH:MM:SS`; every fact is keyed off it. */
  readonly asOf: string
}

type InstrumentResolution = {
  readonly instrument: Instrument
  readonly symbol: string
  readonly issue: DataQualityIssue | null
}

/** One instrument per run, from the MGI symbol root; the study's root is the fallback and the cross-check. */
function resolveInstrument(mgi: MgiStaticLevels, study: JobStudy): InstrumentResolution {
  const symbol = mgi.symbol?.trim() ?? ''
  const fromMgi = symbol.length > 0 ? instrumentFromSymbol(symbol) : null
  if (fromMgi === null) {
    return {
      instrument: study.instrument,
      symbol: study.symbol,
      issue: {
        code: 'mgi_symbol_missing',
        severity: 'warning',
        message: `MGI export carries no recognizable symbol (${symbol || 'absent'}) — instrument ${study.instrument} taken from the job-study`,
      },
    }
  }
  if (fromMgi !== study.instrument) {
    return {
      instrument: fromMgi,
      symbol,
      issue: {
        code: 'instrument_mismatch',
        severity: 'insufficient',
        message: `MGI symbol ${symbol} is ${fromMgi} but the job-study is ${study.instrument} (${study.symbol}) — one instrument only`,
      },
    }
  }
  return { instrument: fromMgi, symbol, issue: null }
}

function resolvePrice(mgi: MgiStaticLevels, study: JobStudy): JobContext['price'] {
  const live = mgi.current?.price
  return typeof live === 'number' && Number.isFinite(live) && live > 0
    ? { value: live, source: 'mgi' }
    : { value: study.currentPrice, source: 'job-study' }
}

function resolveScale(htfBars: readonly HtfBar[], price: number, instrument: Instrument): ContextScale {
  const facts = htfBars.length > 0 ? computeVolatilityScale({ bars: htfBars, currentPrice: price }) : null
  if (facts === null) {
    return { source: 'fallback-points', sessionSigmaPts: null, reachPts: REACH_FALLBACK_PTS[instrument], sessionsAnalyzed: null }
  }
  return {
    source: 'session-sigma',
    sessionSigmaPts: facts.sessionSigmaPts,
    reachPts: Math.round(REACH_SIGMA * facts.sessionSigmaPts * 100) / 100,
    sessionsAnalyzed: facts.sessionsAnalyzed,
  }
}

export function classifyContext(input: ClassifyContextInput): JobContext {
  classifyContextInputSchema.parse(input)
  const { jobStudy, mgi, execBars, htfBars, profileNodes, asOf } = input

  const resolved = resolveInstrument(mgi, jobStudy)
  const tolerance = resolveBandTolerance(resolved.instrument)
  const price = resolvePrice(mgi, jobStudy)
  const observation = observeBars(execBars, wallMsOfString(asOf)!)
  // Nothing after asOf may leak in: the scale sees the sessions completed by
  // asOf, the overnight fallback only this trading day's bars.
  const scale = resolveScale(htfBarsAsOf(htfBars, observation.asOfMs), price.value, resolved.instrument)

  const inventory = buildReferenceInventory({
    jobStudy,
    mgi,
    profileNodes,
    htfBars: htfBarsAsOf(htfBars, observation.asOfMs, observation.tradingDay),
    completedBars: observation.allCompleted,
    price: price.value,
  })
  const bands = buildConfluenceBands(inventory.references, tolerance)
  const roles = assignBandRoles({
    bands,
    price: price.value,
    merge: tolerance.merge,
    reachPts: scale.reachPts,
    sessionSigmaPts: scale.sessionSigmaPts,
  })
  const location = classifyLocation(price.value, jobStudy, bands, tolerance.merge)
  const origin = classifyOrigin(bands, observation, tolerance.merge)

  const dataQuality = assessDataQuality({
    jobStudy,
    mgi,
    execBars,
    asOfMs: observation.asOfMs,
    coverage: observation.coverage,
    instrumentIssue: resolved.issue,
    scale,
    profileNodes,
    crossCheck: crossCheckWithMgi(jobStudy, mgi),
    inventoryIssues: inventory.issues,
  })

  return {
    plannerRevision: PLANNER_REVISION,
    asOf,
    instrument: resolved.instrument,
    symbol: resolved.symbol,
    tolerance,
    price,
    scale,
    references: inventory.references,
    excludedReferences: inventory.excluded,
    bands,
    roles,
    location,
    origin,
    dataQuality,
    warnings: dataQuality.issues.map((issue) => `${issue.code}: ${issue.message}`),
  }
}
