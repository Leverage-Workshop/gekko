import type {
  BoxDimension,
  BoxRead,
  CoarseRead,
  ConfluenceBand,
  CrossRead,
  EnclosingZone,
  LocationDimensions,
  ValueZoneDimension,
  ValueZoneRead,
} from './contextTypes'
import { APPROACH_ZONE_MULTIPLE, MID_ZONE_MULTIPLE, r10MidZone } from './rules'
import type { BalanceArea, JobStudy } from './types'

/**
 * The orthogonal LOCATION dimensions (feat-126): price vs weekly value, vs
 * the current daily value zone, vs EACH JBA box, plus the enclosing zone's
 * R10 mid-zone read and a cross-read that EXPOSES disagreements between the
 * weekly / daily / JBA reads — never a single bias. "At" is R3 (one merge
 * tolerance, inclusive); "outside-near" is the R7 approach zone (2×).
 */

const round2 = (n: number): number => Math.round(n * 100) / 100

type ValueZone = { readonly valueLow: number; readonly pivot: number; readonly valueHigh: number }

export function readValueZone(price: number, zone: ValueZone, merge: number): ValueZoneDimension {
  const fromPivotPts = round2(price - zone.pivot)
  const read: ValueZoneRead =
    Math.abs(fromPivotPts) <= merge
      ? 'at-pivot'
      : price < zone.valueLow
        ? 'below'
        : price > zone.valueHigh
          ? 'above'
          : price < zone.pivot
            ? 'lower-half'
            : 'upper-half'
  return {
    read,
    evidence: {
      price,
      valueLow: zone.valueLow,
      pivot: zone.pivot,
      valueHigh: zone.valueHigh,
      fromPivotPts,
      mergeTolerancePts: merge,
    },
  }
}

export function readBox(price: number, box: BalanceArea, boxIndex: number, merge: number): BoxDimension {
  const fromLowPts = round2(price - box.low)
  const fromHighPts = round2(price - box.high)
  const inside = price >= box.low && price <= box.high
  const side = inside ? 'inside' : price < box.low ? 'below' : 'above'
  const toLow = Math.abs(fromLowPts)
  const toHigh = Math.abs(fromHighPts)
  const nearest = Math.min(toLow, toHigh)
  let read: BoxRead
  if (nearest <= merge) {
    read = toLow <= toHigh ? 'at-lower-edge' : 'at-upper-edge'
  } else if (inside) {
    read = 'inside-middle'
  } else {
    read = nearest <= APPROACH_ZONE_MULTIPLE * merge ? 'outside-near' : 'outside-extended'
  }
  return {
    boxIndex,
    drawingId: box.drawingId,
    read,
    side,
    evidence: { price, low: box.low, high: box.high, fromLowPts, fromHighPts, mergeTolerancePts: merge },
  }
}

function bandIdOfMember(bands: readonly ConfluenceBand[], memberId: string): string | null {
  return bands.find((band) => band.members.some((m) => m.id === memberId))?.id ?? null
}

/**
 * The enclosing zone: the narrowest JBA box containing price, else the span
 * between the nearest armable bands on either side. Null when price has no
 * named edge on one side.
 */
export function enclosingZone(
  price: number,
  boxes: readonly BalanceArea[],
  bands: readonly ConfluenceBand[],
  merge: number,
): EnclosingZone | null {
  const limit = MID_ZONE_MULTIPLE * merge
  const containing = boxes
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => price >= box.low && price <= box.high)
    .sort((a, b) => a.box.high - a.box.low - (b.box.high - b.box.low) || a.index - b.index)
  if (containing.length > 0) {
    const { box, index } = containing[0]
    return {
      kind: 'jba-box',
      lowerEdge: { label: `JBA ${index + 1} low`, price: box.low, bandId: bandIdOfMember(bands, `jba:${index}:low`) },
      upperEdge: { label: `JBA ${index + 1} high`, price: box.high, bandId: bandIdOfMember(bands, `jba:${index}:high`) },
      fromLowerPts: round2(price - box.low),
      fromUpperPts: round2(box.high - price),
      midZone: r10MidZone(price - box.low, box.high - price, merge),
      midZoneLimitPts: limit,
    }
  }
  const armable = bands.filter((band) => !band.destinationOnly)
  const below = armable.filter((band) => band.high < price).sort((a, b) => b.high - a.high)[0]
  const above = armable.filter((band) => band.low > price).sort((a, b) => a.low - b.low)[0]
  if (!below || !above) return null
  return {
    kind: 'between-bands',
    lowerEdge: { label: below.members[0].label, price: below.high, bandId: below.id },
    upperEdge: { label: above.members[0].label, price: above.low, bandId: above.id },
    fromLowerPts: round2(price - below.high),
    fromUpperPts: round2(above.low - price),
    midZone: r10MidZone(price - below.high, above.low - price, merge),
    midZoneLimitPts: limit,
  }
}

function coarseOf(read: ValueZoneRead): CoarseRead {
  return read === 'above' ? 'above' : read === 'below' ? 'below' : 'inside'
}

function jbaRead(price: number, boxes: readonly BalanceArea[]): CrossRead['jba'] {
  if (boxes.length === 0) return 'none'
  if (boxes.some((box) => price >= box.low && price <= box.high)) return 'inside'
  if (boxes.every((box) => price > box.high)) return 'above-all'
  if (boxes.every((box) => price < box.low)) return 'below-all'
  return 'between'
}

export function crossRead(
  weekly: ValueZoneDimension,
  daily: ValueZoneDimension,
  price: number,
  boxes: readonly BalanceArea[],
): CrossRead {
  const reads: Array<[string, CoarseRead]> = [
    ['weekly value', coarseOf(weekly.read)],
    ['daily value', coarseOf(daily.read)],
  ]
  const jba = jbaRead(price, boxes)
  const jbaCoarse: CoarseRead | null =
    jba === 'inside' ? 'inside' : jba === 'above-all' ? 'above' : jba === 'below-all' ? 'below' : null
  if (jbaCoarse !== null) reads.push(['JBA boxes', jbaCoarse])

  const disagreements: string[] = []
  for (let i = 0; i < reads.length; i++) {
    for (let j = i + 1; j < reads.length; j++) {
      if (reads[i][1] !== reads[j][1]) {
        disagreements.push(`${reads[i][0]} reads ${reads[i][1]} while ${reads[j][0]} reads ${reads[j][1]}`)
      }
    }
  }
  return { weekly: reads[0][1], daily: reads[1][1], jba, unanimous: disagreements.length === 0, disagreements }
}

export function classifyLocation(
  price: number,
  study: JobStudy,
  bands: readonly ConfluenceBand[],
  merge: number,
): LocationDimensions {
  const vsWeeklyValue = readValueZone(price, study.weekly.current, merge)
  const vsDailyValue = readValueZone(price, study.daily.current, merge)
  return {
    vsWeeklyValue,
    vsDailyValue,
    vsBoxes: study.balanceAreas.map((box, index) => readBox(price, box, index, merge)),
    enclosingZone: enclosingZone(price, study.balanceAreas, bands, merge),
    crossRead: crossRead(vsWeeklyValue, vsDailyValue, price, study.balanceAreas),
  }
}
