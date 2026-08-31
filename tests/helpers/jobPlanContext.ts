import { buildConfluenceBands } from '@/lib/job-plan/confluenceBands'
import type {
  BandOriginFacts,
  DataQuality,
  JobContext,
  ObservationCoverage,
  Reference,
  ReferenceNode,
} from '@/lib/job-plan/contextTypes'
import { crossRead, enclosingZone, readBox, readValueZone } from '@/lib/job-plan/locationDimensions'
import { assignBandRoles } from '@/lib/job-plan/referenceRoles'
import { PLANNER_REVISION, r2DestinationOnly, r2Significance, resolveBandTolerance, type ReferenceSource } from '@/lib/job-plan/rules'
import type { BalanceArea } from '@/lib/job-plan/types'
import type { Instrument } from '@/lib/job-plan/profile-vision/instrument'

/**
 * A SYNTHETIC `JobContext` for the feat-127 buildPlan tests: hand-built
 * references and origin facts through the real band / role / location
 * modules, so a grammar case can state its facts directly instead of
 * engineering bars around them. `mirror` reflects a spec around a price so
 * long/short symmetry can be asserted mechanically.
 */

export const SYNTH_AS_OF = '2026-08-24T09:30:00'

export type SynthRef = {
  readonly id: string
  readonly source: ReferenceSource
  readonly price: number
  readonly label?: string
  readonly boxIndex?: number
  readonly node?: Partial<ReferenceNode>
}

export type ValueZoneSpec = { readonly valueLow: number; readonly pivot: number; readonly valueHigh: number }

export type SynthSpec = {
  readonly instrument?: Instrument
  readonly price: number
  readonly refs: readonly SynthRef[]
  readonly weekly?: ValueZoneSpec
  readonly daily?: ValueZoneSpec
  readonly boxes?: readonly { readonly low: number; readonly high: number }[]
  /** Origin-fact overrides keyed by a MEMBER reference id (applied to that member's band). */
  readonly facts?: Readonly<Record<string, Partial<BandOriginFacts>>>
  readonly coverage?: Partial<ObservationCoverage>
  readonly dataQuality?: Partial<DataQuality>
  readonly reachPts?: number
  readonly sessionSigmaPts?: number | null
  readonly asOf?: string
}

export function synthRef(spec: SynthRef): Reference {
  const node: ReferenceNode | null = spec.node
    ? { profile: '5d', kind: 'lvn', prominence: 1, primary: false, position: 'mid', edgeBelow: 'taper', edgeAbove: 'flat', agreement: 3, samples: 3, ...spec.node }
    : null
  return {
    id: spec.id,
    source: spec.source,
    significance: r2Significance(spec.source),
    subRank: 0,
    label: spec.label ?? spec.id,
    price: spec.price,
    priceLow: spec.price,
    priceHigh: spec.price,
    destinationOnly: r2DestinationOnly(spec.source),
    origin: node ? 'profile-nodes' : spec.source === 'weekly-job-pivot' || spec.source === 'daily-job-pivot' || spec.source === 'jba-edge' ? 'job-study' : 'mgi',
    boxIndex: spec.boxIndex ?? null,
    node,
    pivot: spec.source === 'daily-job-pivot' ? { role: 'current', sessionDate: '2026-08-24', testedStatus: null } : null,
    mgiCode: null,
  }
}

const instant = { wall: '', epochMs: 0, iso: '' }

function box(low: number, high: number, index: number): BalanceArea {
  return { low, high, drawingId: -(index + 1), source: 'user', anchorBegin: instant, anchorEnd: instant, color: '', text: '' }
}

export function emptyFacts(bandId: string, asOf: string): BandOriginFacts {
  return {
    bandId,
    asOf,
    holdingSide: null,
    excursions: [],
    latestFailedLook: null,
    acceptance: { state: 'none', direction: null, sinceAt: null, minutes: 0, scope: null },
    approachFailure: null,
    interaction: { interacted: false, prints: 0, firstAt: null, lastAt: null, defenses: { session: 0, overnight: 0 }, failedLookThisSession: false, triggerStatus: 'fresh' },
  }
}

const DEFAULT_COVERAGE: ObservationCoverage = {
  asOf: SYNTH_AS_OF,
  tradingDay: '2026-08-24',
  rthOpenAt: '2026-08-24T08:30:00',
  sessionStarted: true,
  minutesSinceOpen: 60,
  earlyWindow: true,
  overnightBars: 30,
  sessionBars: 59,
  firstBarAt: '2026-08-23T17:00:00',
  lastCompletedBarAt: '2026-08-24T09:28:00',
  excludedBars: { inProgress: 1, afterAsOf: 0, priorTradingDays: 0 },
}

const DEFAULT_QUALITY: DataQuality = {
  sufficient: true,
  issues: [],
  exportTimes: { daily: SYNTH_AS_OF, weekly: SYNTH_AS_OF, mgi: SYNTH_AS_OF, bars: SYNTH_AS_OF },
  maxSkewSeconds: 0,
  tradingDay: { study: '2026-08-24', bundle: '2026-08-24', match: true },
  boxesProvisional: false,
  profileNodes: 'null',
}

function around(price: number, halfWidth: number): ValueZoneSpec {
  return { valueLow: price - halfWidth, pivot: price, valueHigh: price + halfWidth }
}

export function synthContext(spec: SynthSpec): JobContext {
  const instrument = spec.instrument ?? 'NQ'
  const tolerance = resolveBandTolerance(instrument)
  const asOf = spec.asOf ?? SYNTH_AS_OF
  const references = spec.refs.map(synthRef)
  const bands = buildConfluenceBands(references, tolerance)
  const reachPts = spec.reachPts ?? 300
  const sessionSigmaPts = spec.sessionSigmaPts === undefined ? reachPts : spec.sessionSigmaPts
  const roles = assignBandRoles({ bands, price: spec.price, merge: tolerance.merge, reachPts, sessionSigmaPts })
  const boxes = (spec.boxes ?? []).map((b, i) => box(b.low, b.high, i))
  const weekly = readValueZone(spec.price, spec.weekly ?? around(spec.price, 10 * tolerance.merge), tolerance.merge)
  const daily = readValueZone(spec.price, spec.daily ?? around(spec.price, 5 * tolerance.merge), tolerance.merge)
  const memberBand = (memberId: string) => bands.find((b) => b.members.some((m) => m.id === memberId))
  const overrides = new Map<string, Partial<BandOriginFacts>>()
  for (const [memberId, facts] of Object.entries(spec.facts ?? {})) {
    const band = memberBand(memberId)
    if (!band) throw new Error(`synthContext: no band contains member ${memberId}`)
    overrides.set(band.id, { ...overrides.get(band.id), ...facts })
  }
  const dataQuality = { ...DEFAULT_QUALITY, ...spec.dataQuality }
  return {
    plannerRevision: PLANNER_REVISION,
    asOf,
    instrument,
    symbol: instrument === 'NQ' ? 'NQU26' : 'ESU26',
    tolerance,
    price: { value: spec.price, source: 'mgi' },
    scale: { source: sessionSigmaPts === null ? 'fallback-points' : 'session-sigma', sessionSigmaPts, reachPts, sessionsAnalyzed: 5 },
    references,
    excludedReferences: [],
    bands,
    roles,
    location: {
      vsWeeklyValue: weekly,
      vsDailyValue: daily,
      vsBoxes: boxes.map((b, i) => readBox(spec.price, b, i, tolerance.merge)),
      enclosingZone: enclosingZone(spec.price, boxes, bands, tolerance.merge),
      crossRead: crossRead(weekly, daily, spec.price, boxes),
    },
    origin: {
      coverage: { ...DEFAULT_COVERAGE, asOf, ...spec.coverage },
      bands: bands.map((b) => ({ ...emptyFacts(b.id, asOf), ...overrides.get(b.id) })),
    },
    dataQuality,
    warnings: dataQuality.issues.map((i) => `${i.code}: ${i.message}`),
  }
}

const flip = <T extends string>(v: T, a: T, b: T): T => (v === a ? b : v === b ? a : v)

/** Reflect every price of a spec through `center` and flip every directional fact. */
export function mirror(spec: SynthSpec, center: number): SynthSpec {
  const m = (p: number) => 2 * center - p
  const zone = (z: ValueZoneSpec | undefined) => (z ? { valueLow: m(z.valueHigh), pivot: m(z.pivot), valueHigh: m(z.valueLow) } : undefined)
  const facts = Object.fromEntries(
    Object.entries(spec.facts ?? {}).map(([id, f]) => [
      id,
      {
        ...f,
        ...(f.latestFailedLook ? { latestFailedLook: { ...f.latestFailedLook, direction: flip(f.latestFailedLook.direction, 'above', 'below'), extremePrice: m(f.latestFailedLook.extremePrice) } } : {}),
        ...(f.approachFailure ? { approachFailure: { ...f.approachFailure, from: flip(f.approachFailure.from, 'above', 'below'), closestPrice: m(f.approachFailure.closestPrice) } } : {}),
        ...(f.acceptance ? { acceptance: { ...f.acceptance, direction: f.acceptance.direction ? flip(f.acceptance.direction, 'above', 'below') : null } } : {}),
        ...(f.holdingSide ? { holdingSide: { ...f.holdingSide, side: flip(f.holdingSide.side, 'ABOVE', 'BELOW') } } : {}),
      },
    ]),
  )
  return {
    ...spec,
    price: m(spec.price),
    refs: spec.refs.map((r) => ({ ...r, price: m(r.price) })),
    weekly: zone(spec.weekly),
    daily: zone(spec.daily),
    boxes: spec.boxes?.map((b) => ({ low: m(b.high), high: m(b.low) })),
    facts,
  }
}
