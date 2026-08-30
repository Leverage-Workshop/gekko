import type {
  ProfileNodesRead,
  ProfileNodesReadNormalized,
  ProfileNodeNormalized,
  ThinZoneNormalized,
} from './schema'

/**
 * Normalized-position <-> price conversion for the AXIS-FREE render (feat-135).
 *
 * The axis-free image carries no digits, so the model never reads a price off
 * the chart: it reports a node's normalized vertical position and CODE turns
 * that into price from the span the image is already known to cover.
 *
 *     price = priceLow + y * (priceHigh - priceLow)      y in [0, 1]
 *
 * `y = 0` is the BOTTOM edge of the plot area and `y = 1` the TOP, matching the
 * renderer: `priceToY` puts `priceHigh` at `plotTop`.
 *
 * A FRACTION, deliberately, not a pixel row. Pixels would tie every few-shot
 * example and every cached bench response to one render size; a fraction
 * survives a size change untouched.
 *
 * The tolerance this has to clear is generous. On the 900x1400 render the
 * matching tolerance (R1: ES 5 pts, NQ 20 pts) is tens of pixels, i.e. the
 * model needs 2-4 % vertical accuracy, not pixel accuracy:
 *
 *     2026-02-13 NQ   845 pts   0.60 pts/px   33 px   (31 px of the 1320 px plot)
 *     2026-02-20 ES   135 pts   0.10 pts/px   52 px   (49 px)
 *     2026-03-06 NQ   898 pts   0.64 pts/px   31 px   (29 px)
 *
 * Conversion happens at the CALL BOUNDARY (`identifyProfileNodes`), so nothing
 * downstream — consensus, the bench scorer, the planner, the persisted
 * `job_plans.profile_nodes` — ever sees a fraction.
 */

/** The price span one image (a tile, or the whole profile) covers, at bin edges. */
export type PriceSpan = { readonly priceLow: number; readonly priceHigh: number }

/**
 * Decimals kept on a stored fraction. 6 puts the round-trip error at
 * `span * 5e-7` — under a thousandth of a point on the widest golden profile,
 * i.e. four orders of magnitude inside the tick, let alone the tolerance.
 */
export const NORMALIZED_PRECISION = 6

function assertSpan(span: PriceSpan): number {
  const height = span.priceHigh - span.priceLow
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(
      `normalized: span must have priceHigh > priceLow (got ${span.priceLow}..${span.priceHigh})`
    )
  }
  return height
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** Normalized position (0 = bottom, 1 = top) -> price. Prices keep 4 decimals, as the renderer does. */
export function fractionToPrice(span: PriceSpan, y: number): number {
  const height = assertSpan(span)
  if (!Number.isFinite(y)) throw new Error(`normalized: y must be finite (got ${y})`)
  return roundTo(span.priceLow + y * height, 4)
}

/**
 * Price -> normalized position, clamped to [0, 1]. A price outside the span
 * cannot be drawn on the image, so it clamps to the edge rather than producing
 * a fraction the schema would reject.
 */
export function priceToFraction(span: PriceSpan, price: number): number {
  const height = assertSpan(span)
  if (!Number.isFinite(price)) throw new Error(`normalized: price must be finite (got ${price})`)
  const raw = (price - span.priceLow) / height
  return Math.min(1, Math.max(0, roundTo(raw, NORMALIZED_PRECISION)))
}

/**
 * An axis-free read -> the price read every downstream consumer expects.
 * `yLow`/`yHigh` are already ordered by the schema, so the band stays ordered.
 */
export function toPriceRead(read: ProfileNodesReadNormalized, span: PriceSpan): ProfileNodesRead {
  return {
    // Field order mirrors `profileNodeSchema` so a serialized read of either
    // form reads the same way (the few-shot JSON is quoted verbatim in the
    // prompt, and the model imitates what it sees).
    nodes: read.nodes.map((node) => ({
      kind: node.kind,
      priceLow: fractionToPrice(span, node.yLow),
      priceHigh: fractionToPrice(span, node.yHigh),
      prominence: node.prominence,
      primary: node.primary,
      position: node.position,
      shape: node.shape,
      rationale: node.rationale,
    })),
    thinZones: read.thinZones.map((zone) => ({
      low: fractionToPrice(span, zone.yLow),
      high: fractionToPrice(span, zone.yHigh),
    })),
    profileShape: read.profileShape,
    unfinished: read.unfinished,
  }
}

/**
 * A price read -> its axis-free equivalent. Used to derive the axis-free
 * few-shot expectations MECHANICALLY from the price ones, so the two example
 * sets can never disagree about what the answer is.
 */
export function toNormalizedRead(
  read: ProfileNodesRead,
  span: PriceSpan
): ProfileNodesReadNormalized {
  return {
    nodes: read.nodes.map(
      (node): ProfileNodeNormalized => ({
        kind: node.kind,
        yLow: priceToFraction(span, node.priceLow),
        yHigh: priceToFraction(span, node.priceHigh),
        prominence: node.prominence,
        primary: node.primary,
        position: node.position,
        shape: node.shape,
        rationale: node.rationale,
      })
    ),
    thinZones: read.thinZones.map(
      (zone): ThinZoneNormalized => ({
        yLow: priceToFraction(span, zone.low),
        yHigh: priceToFraction(span, zone.high),
      })
    ),
    profileShape: read.profileShape,
    unfinished: read.unfinished,
  }
}
