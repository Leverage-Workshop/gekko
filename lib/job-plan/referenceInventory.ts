import { computeMgiPriority, type MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { computeOvernightSession } from '@/lib/engine/overnightSession'
import type { HtfBar } from '@/lib/engine/parseHtfBars'
import { rthOpenMsOf } from './chartClock'
import type {
  DataQualityIssue,
  ExcludedReference,
  PivotTestedStatus,
  Reference,
  ReferencePivot,
} from './contextTypes'
import type { ObservedBar } from './observedBars'
import { PROFILE_KEYS, type ProfileKey, type ProfileNodes } from './profile-vision/types'
import { r2DestinationOnly, r2Significance, type ReferenceSource } from './rules'
import type { DailyPivot, JobStudy, PivotLadder } from './types'

/**
 * Step 1 of the level-production procedure (feat-126): the REFERENCE INVENTORY
 * with R2 source significance. Every price the plan may quote comes from here —
 * the MGI export, the Job-study geometry, or the vision read's `ProfileNodes`
 * taken AS-IS (prominence / primary never recomputed). Ladder rungs are
 * destination-only (R2). Sierra's `0.00` placeholders are excluded, not
 * levels; a missing overnight extreme falls back to the HTF bars' own
 * overnight session (the engine fact the plan's inventory table names) — over
 * the observation day's bars at/before `asOf` only, never a later day's — and
 * says so.
 */

export type InventoryInput = {
  readonly jobStudy: JobStudy
  readonly mgi: MgiStaticLevels
  readonly profileNodes: ProfileNodes | null
  /** HTF bars of the observation trading day at/before asOf ONLY (the ONH/ONL fallback). */
  readonly htfBars: readonly HtfBar[]
  /** Every completed bar at/before asOf, any trading day (historical-pivot check). */
  readonly completedBars: readonly ObservedBar[]
  readonly price: number
}

export type InventoryResult = {
  readonly references: readonly Reference[]
  readonly excluded: readonly ExcludedReference[]
  readonly issues: readonly DataQualityIssue[]
}

/** MGI codes that feed a named R2 tier — never re-listed under `mgi-other`. */
const NAMED_MGI_CODES: ReadonlySet<string> = new Set([
  'weekly.wkOpen',
  'weekly.jobPivot',
  'daily.jobPivot',
  'daily.rip',
  'daily.onh',
  'daily.onl',
  'daily.pdh',
  'daily.pdl',
])

const round2 = (n: number): number => Math.round(n * 100) / 100

function isLevel(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

type RefSeed = Partial<Reference> & {
  id: string
  source: ReferenceSource
  label: string
  price: number
}

function ref(seed: RefSeed): Reference {
  return {
    significance: r2Significance(seed.source),
    subRank: 0,
    priceLow: seed.price,
    priceHigh: seed.price,
    destinationOnly: r2DestinationOnly(seed.source),
    origin: 'job-study',
    boxIndex: null,
    node: null,
    pivot: null,
    mgiCode: null,
    ...seed,
  }
}

function mgiRef(
  seed: Omit<RefSeed, 'price'> & { code: string; value: number | undefined },
  excluded: ExcludedReference[],
): Reference | null {
  if (!isLevel(seed.value)) {
    excluded.push({ label: seed.label, price: seed.value ?? null, reason: seed.value === undefined ? 'missing' : 'sentinel' })
    return null
  }
  const { code, value, ...rest } = seed
  return ref({ ...rest, price: value, origin: 'mgi', mgiCode: code })
}

/** Deep-dive rule: a historical pivot the market never came back to stays relevant. */
function testedStatus(pivot: DailyPivot, bars: readonly ObservedBar[]): 'tested' | PivotTestedStatus {
  const since = bars.filter((bar) => bar.tradingDay >= pivot.sessionDate)
  if (since.some((bar) => bar.low <= pivot.pivot && pivot.pivot <= bar.high)) return 'tested'
  const covered = since.length > 0 && since[0].ms <= rthOpenMsOf(pivot.sessionDate)
  return covered ? 'untested' : 'unknown'
}

function pivotRefs(study: JobStudy, bars: readonly ObservedBar[], excluded: ExcludedReference[]): Reference[] {
  const current = study.daily.current
  const currentPivot: ReferencePivot = { role: 'current', sessionDate: current.sessionDate, testedStatus: null }
  const refs: Reference[] = [
    ref({ id: 'weekly-pivot', source: 'weekly-job-pivot', label: 'Weekly Job Pivot', price: study.weekly.current.pivot }),
    ref({ id: 'daily-pivot', source: 'daily-job-pivot', label: 'Daily Job Pivot', price: current.pivot, pivot: currentPivot }),
  ]
  for (const historical of study.daily.history) {
    const status = testedStatus(historical, bars)
    const label = `Daily Job Pivot ${historical.sessionDate}`
    if (status === 'tested') {
      excluded.push({ label, price: historical.pivot, reason: 'historical_pivot_tested' })
      continue
    }
    refs.push(
      ref({
        id: `daily-pivot:${historical.sessionDate}`,
        source: 'daily-job-pivot',
        subRank: 1,
        label: `${label} (${status})`,
        price: historical.pivot,
        pivot: { role: 'historical', sessionDate: historical.sessionDate, testedStatus: status },
      }),
    )
  }
  return refs
}

function boxRefs(study: JobStudy): Reference[] {
  return study.balanceAreas.flatMap((box, boxIndex) => [
    ref({ id: `jba:${boxIndex}:low`, source: 'jba-edge', label: `JBA ${boxIndex + 1} low`, price: box.low, boxIndex }),
    ref({ id: `jba:${boxIndex}:high`, source: 'jba-edge', label: `JBA ${boxIndex + 1} high`, price: box.high, boxIndex }),
  ])
}

function overnightRefs(
  mgi: MgiStaticLevels,
  htfBars: readonly HtfBar[],
  price: number,
  excluded: ExcludedReference[],
  issues: DataQualityIssue[],
): Reference[] {
  const onh = mgi.daily?.onh
  const onl = mgi.daily?.onl
  if (isLevel(onh) && isLevel(onl)) {
    return [
      ref({ id: 'onh', source: 'overnight-extreme', label: 'ONH', price: onh, origin: 'mgi', mgiCode: 'daily.onh' }),
      ref({ id: 'onl', source: 'overnight-extreme', label: 'ONL', price: onl, origin: 'mgi', mgiCode: 'daily.onl' }),
    ]
  }
  const fallback = htfBars.length > 0 ? computeOvernightSession(htfBars, price) : null
  if (fallback === null) {
    excluded.push({ label: 'ONH', price: onh ?? null, reason: isLevel(onh) ? 'missing' : 'sentinel' })
    excluded.push({ label: 'ONL', price: onl ?? null, reason: isLevel(onl) ? 'missing' : 'sentinel' })
    issues.push({
      code: 'overnight_levels_missing',
      severity: 'warning',
      message: 'MGI ONH/ONL are 0.00 placeholders and the HTF export carries no overnight session — overnight extremes are absent from the inventory',
    })
    return []
  }
  issues.push({
    code: 'overnight_levels_from_htf',
    severity: 'warning',
    message: `MGI ONH/ONL are 0.00 placeholders — overnight extremes taken from the HTF bars' ${fallback.sessionDate} overnight session (${fallback.overnight.high} / ${fallback.overnight.low})`,
  })
  return [
    ref({ id: 'onh', source: 'overnight-extreme', label: 'ONH (HTF bars)', price: fallback.overnight.high, origin: 'htf-bars' }),
    ref({ id: 'onl', source: 'overnight-extreme', label: 'ONL (HTF bars)', price: fallback.overnight.low, origin: 'htf-bars' }),
  ]
}

function profileRefs(profileNodes: ProfileNodes | null): Reference[] {
  if (profileNodes === null) return []
  const sourceOf: Record<ProfileKey, ReferenceSource> = { balance: 'profile-balance', rotation: 'profile-rotation' }
  const nameOf: Record<ProfileKey, string> = { balance: 'balance-area', rotation: '400-pt rotation' }
  return PROFILE_KEYS.flatMap((key) => {
    const consensus = profileNodes.profiles[key]?.consensus ?? null
    if (consensus === null) return []
    return consensus.nodes.map((node, index) =>
      ref({
        id: `node:${key}:${index}`,
        source: sourceOf[key],
        label: `${nameOf[key]} ${node.kind}${node.primary ? ' (primary)' : ''} #${node.prominence}`,
        price: round2((node.priceLow + node.priceHigh) / 2),
        priceLow: node.priceLow,
        priceHigh: node.priceHigh,
        origin: 'profile-nodes',
        node: {
          profile: key,
          kind: node.kind,
          prominence: node.prominence,
          primary: node.primary,
          position: node.position,
          edgeBelow: node.edgeBelow,
          edgeAbove: node.edgeAbove,
          agreement: node.agreement,
          samples: node.samples,
        },
      }),
    )
  })
}

function autoplotRefs(study: JobStudy): Reference[] {
  if (study.autoplot === null) return []
  return [
    ref({ id: 'autoplot:high', source: 'autoplot', label: 'Autoplot high', price: study.autoplot.high }),
    ref({ id: 'autoplot:low', source: 'autoplot', label: 'Autoplot low', price: study.autoplot.low }),
  ]
}

function otherMgiRefs(mgi: MgiStaticLevels, price: number): Reference[] {
  const levels = computeMgiPriority(mgi, { currentPrice: price }).levels
  const refs = levels
    .filter((level) => !NAMED_MGI_CODES.has(`${level.group}.${level.code}`) && isLevel(level.price))
    .map((level) =>
      ref({
        id: `mgi:${level.group}.${level.code}`,
        source: 'mgi-other',
        label: level.label,
        price: level.price,
        origin: 'mgi',
        mgiCode: `${level.group}.${level.code}`,
      }),
    )
  // pwVAH / pwVAL (feat-118) are not in the priority engine's level specs.
  const pw: Array<[string, string, number | undefined]> = [
    ['weekly.pwVAH', 'PW VAH', mgi.weekly?.pwVAH],
    ['weekly.pwVAL', 'PW VAL', mgi.weekly?.pwVAL],
  ]
  for (const [code, label, value] of pw) {
    if (isLevel(value)) refs.push(ref({ id: `mgi:${code}`, source: 'mgi-other', label, price: value, origin: 'mgi', mgiCode: code }))
  }
  return refs
}

function rungRefs(ladder: PivotLadder, source: 'weekly-rung' | 'daily-rung', name: string): Reference[] {
  return [...ladder.above, ...ladder.below].map((rung) =>
    ref({ id: `rung:${source === 'weekly-rung' ? 'weekly' : 'daily'}:${rung.label}`, source, label: `${name} ${rung.label}`, price: rung.price }),
  )
}

export function buildReferenceInventory(input: InventoryInput): InventoryResult {
  const { jobStudy, mgi, profileNodes, htfBars, completedBars, price } = input
  const excluded: ExcludedReference[] = []
  const issues: DataQualityIssue[] = []
  const daily = mgi.daily ?? {}

  const named: Array<Reference | null> = [
    mgiRef({ id: 'g-line', source: 'g-line', label: 'G line (week open)', code: 'weekly.wkOpen', value: mgi.weekly?.wkOpen }, excluded),
    ...pivotRefs(jobStudy, completedBars, excluded),
    ...boxRefs(jobStudy),
    mgiRef({ id: 'rip', source: 'rip', label: 'Rip', code: 'daily.rip', value: daily.rip }, excluded),
    ...overnightRefs(mgi, htfBars, price, excluded, issues),
    mgiRef({ id: 'pdh', source: 'previous-day-extreme', label: 'PDH', code: 'daily.pdh', value: daily.pdh }, excluded),
    mgiRef({ id: 'pdl', source: 'previous-day-extreme', label: 'PDL', code: 'daily.pdl', value: daily.pdl }, excluded),
    ...profileRefs(profileNodes),
    ...autoplotRefs(jobStudy),
    ...otherMgiRefs(mgi, price),
    ...rungRefs(jobStudy.weekly.current.ladder, 'weekly-rung', 'Weekly'),
    ...rungRefs(jobStudy.daily.current.ladder, 'daily-rung', 'Daily'),
  ]

  const references = named
    .filter((r): r is Reference => r !== null)
    .sort((a, b) => a.significance - b.significance || a.subRank - b.subRank || a.price - b.price || a.id.localeCompare(b.id))

  return { references, excluded, issues }
}
