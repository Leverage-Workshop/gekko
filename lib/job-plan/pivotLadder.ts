import type { RawTarget } from './jobStudySchema'
import { checkPrice } from './priceChecks'
import type { JobStudyIssue, JobStudyWarning, LadderSide, PivotLadder, PivotTarget } from './types'

/**
 * Target-ladder normalization for a Job pivot row (feat-125).
 *
 * The study labels its rungs `<n>A` (above the pivot) / `<n>B` (below), and the
 * real exports show every rung unique, strictly monotonic outward from the pivot
 * and on the correct side — those are errors. Depth (±6 daily, ±3 weekly),
 * contiguity, symmetry and "outside the value zone" always held too, but they
 * depend on study settings the operator can change, so they only warn.
 * Ladders are destination-only (R2); a thin ladder never blocks a plan.
 */

const LABEL_RE = /^(\d{1,2})([AB])$/

export type LadderCheck = {
  readonly ladder: PivotLadder
  readonly issues: readonly JobStudyIssue[]
  readonly warnings: readonly JobStudyWarning[]
}

type ValueZone = { readonly pivot: number; readonly valueLow: number; readonly valueHigh: number }

function parseLabel(label: string): { rung: number; side: LadderSide } | null {
  const m = LABEL_RE.exec(label)
  if (!m) return null
  return { rung: Number(m[1]), side: m[2] === 'A' ? 'above' : 'below' }
}

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>()
  const dup = new Set<T>()
  for (const v of values) (seen.has(v) ? dup : seen).add(v)
  return [...dup]
}

function sideTargets(targets: readonly PivotTarget[], side: LadderSide): PivotTarget[] {
  return targets.filter((t) => t.side === side).sort((a, b) => a.rung - b.rung)
}

/** Rungs must move strictly outward from the pivot as the rung number grows. */
function monotonicIssues(side: readonly PivotTarget[], where: string): JobStudyIssue[] {
  return side.flatMap((t, i) => {
    if (i === 0) return []
    const prev = side[i - 1]
    const outward = t.side === 'above' ? t.price > prev.price : t.price < prev.price
    return outward
      ? []
      : [
          {
            code: 'target_not_monotonic' as const,
            message: `${where} ${t.label} (${t.price}) is not beyond ${prev.label} (${prev.price})`,
          },
        ]
  })
}

function sideWarnings(
  side: readonly PivotTarget[],
  name: LadderSide,
  zone: ValueZone,
  where: string
): JobStudyWarning[] {
  if (side.length === 0) {
    return [{ code: 'ladder_empty_side', message: `${where} has no ${name} rungs` }]
  }
  const contiguous = side.every((t, i) => t.rung === i + 1)
  const gap: JobStudyWarning[] = contiguous
    ? []
    : [
        {
          code: 'ladder_rung_gap',
          message: `${where} ${name} rungs are ${side.map((t) => t.rung).join(',')}, not 1..${side.length}`,
        },
      ]
  const inside = side.filter((t) =>
    name === 'above' ? t.price <= zone.valueHigh : t.price >= zone.valueLow
  )
  const insideZone: JobStudyWarning[] =
    inside.length === 0
      ? []
      : [
          {
            code: 'ladder_inside_value_zone',
            message: `${where} ${inside.map((t) => t.label).join(',')} inside the value zone ${zone.valueLow}-${zone.valueHigh}`,
          },
        ]
  return [...gap, ...insideZone]
}

/**
 * Parse, validate and order a row's targets. `where` prefixes every message
 * (e.g. `dailyPivots[2026-08-21]`). Issues are collected, never thrown.
 */
export function normalizeLadder(
  targets: readonly RawTarget[],
  zone: ValueZone,
  tickSize: number,
  where: string
): LadderCheck {
  const parsed = targets.flatMap((t): PivotTarget[] => {
    const label = parseLabel(t.label)
    return label ? [{ label: t.label, rung: label.rung, side: label.side, price: t.price }] : []
  })

  const labelIssues: JobStudyIssue[] = targets
    .filter((t) => parseLabel(t.label) === null)
    .map((t) => ({
      code: 'target_label_invalid',
      message: `${where} target label "${t.label}" is not <rung>A|B`,
    }))
  const priceIssues = parsed.flatMap((t) =>
    checkPrice(t.price, tickSize, `${where} target ${t.label}`)
  )
  const dupLabels: JobStudyIssue[] = duplicates(targets.map((t) => t.label)).map((label) => ({
    code: 'target_label_duplicate',
    message: `${where} target label ${label} appears more than once`,
  }))
  const dupPrices: JobStudyIssue[] = duplicates(targets.map((t) => t.price)).map((p) => ({
    code: 'target_price_duplicate',
    message: `${where} target price ${p} appears more than once`,
  }))
  const wrongSide: JobStudyIssue[] = parsed
    .filter((t) => (t.side === 'above' ? t.price <= zone.pivot : t.price >= zone.pivot))
    .map((t) => ({
      code: 'target_wrong_side',
      message: `${where} ${t.label} (${t.price}) is on the wrong side of the pivot ${zone.pivot}`,
    }))

  const above = sideTargets(parsed, 'above')
  const below = sideTargets(parsed, 'below')
  const issues = [
    ...labelIssues,
    ...priceIssues,
    ...dupLabels,
    ...dupPrices,
    ...wrongSide,
    ...monotonicIssues(above, where),
    ...monotonicIssues(below, where),
  ]

  const asymmetric: JobStudyWarning[] =
    above.length === below.length
      ? []
      : [
          {
            code: 'ladder_asymmetric',
            message: `${where} has ${above.length} rungs above and ${below.length} below`,
          },
        ]
  const warnings = [
    ...sideWarnings(above, 'above', zone, where),
    ...sideWarnings(below, 'below', zone, where),
    ...asymmetric,
  ]

  return { ladder: { above, below }, issues, warnings }
}
