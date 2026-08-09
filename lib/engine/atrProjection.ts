import type { HtfStructureFacts } from './htfStructure'
import { describeGate, type ResolvedGate } from './scaledGates'

/**
 * ATR-projected price levels (feat-108) — ATR in its PRICE-LEVEL role.
 *
 * The operator uses ATR as a level, not only as a normalizer: "current price
 * plus one ATR" is a target, "swing low minus one ATR" is where a reversal is
 * expected. Before this module the engine exposed ATR only as a normalizer —
 * `htfStructure.atrPoints` as a raw scalar plus the ATR-normalized distances in
 * `rotation.extentAtr` / `currentVsSwings.*Atr` (feat-049) — so no ATR-derived
 * PRICE existed anywhere and `engineAnchorPrices()` could not host an entry,
 * stop or target on one. The model could only produce such a price as freehand
 * arithmetic in prose: exactly the off-anchor advisory feat-090 (value levels)
 * and feat-097 (session-VWAP rungs) eliminated for their own structure.
 *
 * This module ADDS the price-level role; it changes none of the normalizer
 * fields, which stay where feat-049 put them.
 *
 * ## The scale relationship that shapes the multiples
 *
 * One 30-min ATR is almost exactly feat-096's significant-move floor. Measured
 * on the repo's own HTF export (`chart-data/htf_bar_data.rolling.csv`):
 *
 * ```
 * 30-min Wilder ATR            116.23 pts
 * session sigma (feat-095)     295.12 pts
 * significant-move floor 0.4σ  118.05 pts   → 1× ATR = 0.394σ
 * median RTH session range     446.25 pts
 * ```
 *
 * A 1× ATR projection therefore sits AT the minimum reversal room the engine
 * already demands before a level may host an objective — on this export it
 * lands 1.8 pts UNDER it. Anything below 1× is comfortably under. That is not a
 * reason to suppress the near rungs (they are legitimate entry and stop
 * structure), but it IS a reason never to emit them as if they could carry a
 * target: {@link AtrProjectionRung.clearsSignificantMove} is computed per rung
 * against the gate as it RESOLVES THIS RUN (measured sigma, or feat-096's
 * fixed 50-pt fallback when the scale is unmeasured — under which a 0.5× rung
 * would clear), and {@link AtrProjectionFacts.significantMoveNote} states the
 * relationship in words the briefing can quote. A static filter could not have
 * expressed this: which multiples clear depends on the regime.
 */

/**
 * The ATR multiples projected from every reference, argued against the measured
 * scale above rather than chosen as round numbers:
 *
 * - **0.5× (58 pts, 0.20σ)** — under the significant-move floor AND inside
 *   feat-095's `SIGMA_NOISE_MAX` noise band (0.25σ), so it can never host a
 *   target. Kept because it is still 2.3× the fixed 25-pt operational stop, and
 *   half an ATR beyond a swing is the operator's stop placement, not a target.
 *   Flagged, never silently emitted.
 * - **1.0× (116 pts, 0.39σ)** — one full 30-min bar of travel and ~1.1 of the
 *   operator's ~102-pt average rotation. The first multiple that even reaches
 *   the floor; whether it clears is a per-run question, which is the point.
 * - **1.5× (174 pts, 0.59σ)** — the first multiple that clears the floor with
 *   room in every regime the 20-session range history covers; 39% of a median
 *   session range, i.e. a normal continuation objective.
 * - **2.0× (232 pts, 0.79σ)** — 52% of a median session range. The ceiling of
 *   what one session's directional leg normally delivers.
 *
 * The set STOPS at 2×: 3× is 349 pts — 1.18σ and 78% of a median session range,
 * larger than the whole rotation the engine measures — so a rung there is
 * extrapolation past the measured distribution, not structure. It also stops at
 * 0.5×: a 0.25× rung (29 pts) sits inside the 25-pt operational stop itself and
 * could not be traded to or away from.
 */
export const ATR_PROJECTION_MULTIPLES = [0.5, 1, 1.5, 2] as const

/** Which price a rung was projected from. */
export type AtrProjectionReference = 'current-price' | 'last-swing-high' | 'last-swing-low'

/**
 * One ATR-projected price usable as entry / stop / target-rung structure,
 * shaped after feat-097's `SessionVwapRung`: the price, what it was projected
 * from, and the attribution label a briefing must quote when it anchors there.
 */
export type AtrProjectionRung = {
  price: number
  reference: AtrProjectionReference
  /** The price the projection was measured from. */
  referencePrice: number
  /** Signed ATR multiple — positive projects ABOVE the reference. */
  multiple: number
  /** |multiple| x ATR: the travel this rung offers from its own reference. */
  projectionPts: number
  /**
   * False when `projectionPts` is under the significant-move floor as it
   * resolved THIS RUN — the rung is legitimate entry or stop structure, but an
   * objective entered at its reference and targeting it would not clear the
   * gate. Never anchor a target here without saying so.
   */
  clearsSignificantMove: boolean
  /** e.g. `"current price (29945.75) +1× ATR"`. */
  label: string
}

export type AtrProjectionFacts = {
  /** The 30-min Wilder ATR every rung is projected from (`htfStructure.atrPoints`). */
  atrPoints: number
  /** One ATR in session sigma (2 dp); null when the scale is unmeasured. */
  atrSigma: number | null
  /** The significant-move floor, in points, each rung was tested against. */
  significantMovePts: number
  /** The scale relationship in quotable words — see the module doc. */
  significantMoveNote: string
  /** Every projected rung, price-descending. */
  rungs: AtrProjectionRung[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** `+1.5× ATR` / `−0.5× ATR`, using the same minus glyph as feat-097's bands. */
function multipleLabel(multiple: number): string {
  return `${multiple > 0 ? '+' : '−'}${Math.abs(multiple)}× ATR`
}

const REFERENCE_LABEL: Record<AtrProjectionReference, string> = {
  'current-price': 'current price',
  'last-swing-high': 'last swing high',
  'last-swing-low': 'last swing low',
}

/**
 * Project ATR from current price and the last confirmed swings into concrete
 * price rungs.
 *
 * Reference set, covering the two uses the operator named:
 * - **current price, BOTH directions** — the target rungs ("current price plus
 *   one ATR");
 * - **last confirmed swing high, upward** and **last confirmed swing low,
 *   downward** — the reversal rungs ("swing low minus one ATR is where a
 *   reversal is expected"). Swing projections run OUTWARD only: the operator's
 *   use is where an extension beyond the swing exhausts. The interior of the
 *   rotation is already partitioned by terrain and reachable from the
 *   current-price projections, so projecting inward would mint duplicate
 *   structure with a weaker claim on it.
 *
 * Degrades to null when `htfStructure` is null (no HTF bar export) or its ATR
 * is 0 (too few bars to measure) — there is no scale to project. A swing rung
 * is emitted only when that side has a CONFIRMED swing; a missing swing yields
 * no rung rather than a fabricated one.
 *
 * @param htfStructure    feat-049's HTF read, or null.
 * @param currentPrice    live price — the target-rung reference.
 * @param significantMove the floor as it resolved this run (feat-096).
 */
export function computeAtrProjections(
  htfStructure: HtfStructureFacts | null,
  currentPrice: number,
  significantMove: ResolvedGate,
): AtrProjectionFacts | null {
  if (htfStructure === null) return null
  const atr = htfStructure.atrPoints
  if (!(atr > 0) || !Number.isFinite(currentPrice)) return null

  const lastSwingHigh = htfStructure.recentSwingHighs[0]?.price ?? null
  const lastSwingLow = htfStructure.recentSwingLows[0]?.price ?? null

  // [reference, price, directions] — a null price emits nothing at all.
  const references: Array<[AtrProjectionReference, number | null, readonly number[]]> = [
    ['current-price', currentPrice, [1, -1]],
    ['last-swing-high', lastSwingHigh, [1]],
    ['last-swing-low', lastSwingLow, [-1]],
  ]

  const floorPts = significantMove.pts
  const rungs: AtrProjectionRung[] = []
  for (const [reference, referencePrice, directions] of references) {
    if (referencePrice === null) continue
    for (const magnitude of ATR_PROJECTION_MULTIPLES) {
      for (const direction of directions) {
        const multiple = magnitude * direction
        const projectionPts = round2(magnitude * atr)
        rungs.push({
          price: round2(referencePrice + multiple * atr),
          reference,
          referencePrice: round2(referencePrice),
          multiple,
          projectionPts,
          clearsSignificantMove: projectionPts >= floorPts,
          label: `${REFERENCE_LABEL[reference]} (${round2(referencePrice)}) ${multipleLabel(multiple)}`,
        })
      }
    }
  }
  rungs.sort((a, b) => b.price - a.price)

  const sigma = significantMove.sessionSigmaPts
  const atrSigma = sigma !== null && sigma > 0 ? round2(atr / sigma) : null
  const shortfall = rungs.filter((r) => !r.clearsSignificantMove).length

  return {
    atrPoints: atr,
    atrSigma,
    significantMovePts: floorPts,
    significantMoveNote: buildNote({ atr, atrSigma, floor: significantMove, shortfall }),
    rungs,
  }
}

function buildNote(input: {
  atr: number
  atrSigma: number | null
  floor: ResolvedGate
  shortfall: number
}): string {
  const { atr, atrSigma, floor, shortfall } = input
  const scale =
    atrSigma === null
      ? `one 30-min ATR is ${atr} pts`
      : `one 30-min ATR is ${atr} pts (${atrSigma}σ)`
  const relation =
    atr >= floor.pts
      ? `at — just above — the ${describeGate(floor)} significant-move floor`
      : `at — just under — the ${describeGate(floor)} significant-move floor`
  const consequence =
    shortfall === 0
      ? 'every rung here clears the floor.'
      : `so a 1× projection buys barely the minimum reversal room the engine demands, and ${shortfall} of these rungs are flagged as not reaching it at all: they are entry or stop structure only — anchoring a target on one means the objective cannot clear the floor from its own reference.`
  return `${scale}, ${relation}, ${consequence}`
}
