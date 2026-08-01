import type { LvnDetectionResult, LvnNodeType, PriceVolume } from './lvnDetection'
import type { MgiLevel } from './mgiPriority'

/**
 * Fakeout-formed extremes (feat-075): the code-owned formation test behind the
 * fakeout-formed-extreme fade doctrine (feat-073/074).
 *
 * A High/Low-type MGI level is the PRINT of whatever move created it. When that
 * move was a pre-reversal fakeout — a thin spike through structure that
 * immediately reversed — the profile shows the extreme at the far end of a thin
 * low-volume tail, with real acceptance ending at an LVN knee well before the
 * print. Retests stall at that acceptance edge and rarely re-trade the tail, so
 * a fade anchored AT the extreme usually goes unfilled (2026-07-31/08-01: three
 * consecutive briefings shipped the IBL 28079.75 print while retests reversed
 * at the ~28112 edge; the doctrine asked the model to spot the pattern itself
 * and it never engaged). This module makes the FINDING code-owned — the model
 * keeps only the judgment of where to anchor.
 *
 * Detection runs against the rotation profile by deliberate choice: the
 * doctrine's session-lens rule says the profile whose timeframe matches the
 * trade governs where a retest stalls, and the balance-area composite is
 * exactly the lens that showed fat multi-day acceptance across the 2026-07-31
 * tail and laundered the bad "composite HVN shelf" attribution.
 */

export type FakeoutTailSide = 'low' | 'high'

export type FakeoutTailFact = {
  /** MGI JSON code of the flagged extreme, e.g. 'ibl'. */
  code: string
  /** Engine label of the flagged extreme, e.g. 'IBL'. */
  label: string
  /** The extreme's price — the far end of the tail. */
  price: number
  /** Whether the extreme is a Low (tail hangs below acceptance) or a High. */
  side: FakeoutTailSide
  /** The near-edge acceptance boundary: the detector LVN node terminating the tail. */
  acceptanceEdge: { price: number; type: LvnNodeType; volume: number }
  /** Price distance from the extreme to the acceptance edge. */
  tailSpanPts: number
  /** Loudest raw bin inside the tail as a fraction of the profile's raw peak — the evidence. */
  maxTailBinFrac: number
}

export type FakeoutTailParams = {
  /** Tails shorter than this don't exile an entry — anchoring at the extreme is fine. */
  minTailPts: number
  /** Beyond this span the thin region is a campaign leg or void, not a spike's tail. */
  maxTailPts: number
  /** Every raw bin inside the tail (and beyond the extreme) must stay under this × raw peak. */
  tailThinFrac: number
}

export const DEFAULT_FAKEOUT_TAIL_PARAMS: FakeoutTailParams = {
  minTailPts: 12,
  maxTailPts: 120,
  tailThinFrac: 0.35,
}

/**
 * MGI levels that are trading-formed High/Low prints, keyed `group:code`.
 * Projections (ATR, VRange), averages (VWAPs), opens, mids and value-area
 * edges are not prints of a move and can never be "fakeout-formed".
 */
const EXTREME_SIDES: Record<string, FakeoutTailSide> = {
  'daily:onh': 'high',
  'daily:onl': 'low',
  'daily:pdh': 'high',
  'daily:pdl': 'low',
  'daily:ibh': 'high',
  'daily:ibl': 'low',
  'daily:orHigh': 'high',
  'daily:orLow': 'low',
  'weekly:pwHigh': 'high',
  'weekly:pwLow': 'low',
  'monthly:pmHigh': 'high',
  'monthly:pmLow': 'low',
}

function toAscending(series: PriceVolume[]): PriceVolume[] {
  return [...series].sort((a, b) => a.price - b.price)
}

/** Median gap between adjacent bins — tolerance for "at the node's own bin". */
function binWidth(asc: PriceVolume[]): number {
  if (asc.length < 2) return 0
  const gaps = asc.slice(1).map((row, i) => row.price - asc[i].price)
  return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
}

/**
 * Run the formation test over one profile: for each High/Low-type MGI extreme,
 * flag it when the nearest interior LVN node sits a meaningful distance away
 * and everything between (and beyond the extreme) is thin — the geometry a
 * pre-reversal fakeout leaves behind. Returns flagged extremes price-descending.
 */
export function detectFakeoutTails(
  levels: readonly MgiLevel[],
  series: PriceVolume[],
  nodes: LvnDetectionResult,
  overrides: Partial<FakeoutTailParams> = {},
): FakeoutTailFact[] {
  const params = { ...DEFAULT_FAKEOUT_TAIL_PARAMS, ...overrides }
  if (series.length < 3 || nodes.lvn.length === 0) return []

  const asc = toAscending(series)
  const width = binWidth(asc)
  const rawPeak = Math.max(...asc.map((row) => row.volume))
  if (rawPeak <= 0) return []
  const thinCeiling = params.tailThinFrac * rawPeak
  const lo = asc[0].price
  const hi = asc[asc.length - 1].price

  const facts: FakeoutTailFact[] = []
  for (const level of levels) {
    const side = EXTREME_SIDES[`${level.group}:${level.code}`]
    if (!side) continue
    // The extreme must live inside the profile (one bin of slack for the
    // export's bin rounding) or the tail can't be measured.
    if (level.price < lo - width || level.price > hi + width) continue

    // Nearest interior LVN node: above a Low, below a High.
    const interior = nodes.lvn
      .map((node) => ({
        node,
        span: side === 'low' ? node.price - level.price : level.price - node.price,
      }))
      .filter(({ span }) => span > 0 && span <= params.maxTailPts)
      .sort((a, b) => a.span - b.span)[0]
    if (!interior || interior.span < params.minTailPts) continue

    // The tail — every bin strictly between the extreme and the node's own bin,
    // plus any bins beyond the extreme — must be thin. A loud bin inside means
    // real acceptance near the print: not a fakeout tail.
    const { node } = interior
    const tailBins = asc.filter((row) => {
      const beyondExtreme = side === 'low' ? row.price < level.price : row.price > level.price
      const insideTail =
        side === 'low'
          ? row.price >= level.price && row.price < node.price - width
          : row.price <= level.price && row.price > node.price + width
      return beyondExtreme || insideTail
    })
    if (tailBins.length === 0) continue
    const maxTailBin = Math.max(...tailBins.map((row) => row.volume))
    if (maxTailBin >= thinCeiling) continue

    facts.push({
      code: level.code,
      label: level.label,
      price: level.price,
      side,
      acceptanceEdge: { price: node.price, type: node.type, volume: node.volume },
      tailSpanPts: Math.round(interior.span * 100) / 100,
      maxTailBinFrac: Math.round((maxTailBin / rawPeak) * 100) / 100,
    })
  }
  return facts.sort((a, b) => b.price - a.price)
}
