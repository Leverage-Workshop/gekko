/**
 * Node build quality (feat-050).
 *
 * The structural volume profiles (400-pt rotation, balance area) now export a
 * per-bin delta split (`Price,Volume,Delta`, delta = ask − bid volume). This
 * module turns that split into a per-node BUILD annotation: who built the
 * acceptance at an HVN/LVN/magnet price — one-sided initiative (buyer- or
 * seller-built) or balanced two-way trade. Doctrine use: an HVN built on heavy
 * one-sided delta is weaker acceptance (a magnet more likely to be traded
 * through on the return trip) than one built on a balanced fight.
 *
 * The annotation sums RAW volume/delta bins within a window around the node
 * price (detection runs on smoothed volume, but build quality is about the
 * actual trade that occurred there). It is best-effort by design: when the
 * export predates the Delta column, every `build` is null and nothing else
 * changes — the two sides of the deploy window stay compatible.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a
 * Briefing output — no Zod), mirroring the other lib/engine modules.
 */

import type { HvnNode, LvnNode } from './lvnDetection'
import type { VbpRow } from './parseProfile'

export type BuildClassification = 'buyer-built' | 'seller-built' | 'balanced'

export type NodeBuild = {
  /** Raw volume summed over the window around the node price. */
  volume: number
  /** Raw delta (ask − bid) summed over the same window. */
  delta: number
  /** delta / volume, in [-1, 1] — the one-sidedness of the build. */
  ratio: number
  classification: BuildClassification
}

export type Built<T> = T & {
  /** Null when the profile export carries no Delta column (pre-feat-050 bundle). */
  build: NodeBuild | null
}

export type BuiltLvnDetectionResult = {
  hvn: Built<HvnNode>[]
  lvn: Built<LvnNode>[]
  peakVolume: number
}

/**
 * Half-width (NQ points) of the price window a node's build is summed over —
 * half the detector's merge tolerance, so one node's build never overlaps the
 * next node's neighborhood.
 */
export const DEFAULT_BUILD_WINDOW_PTS = 7

/** |ratio| at or above this is a one-sided build; below is balanced. */
export const ONE_SIDED_RATIO = 0.2

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Build quality at `price`: raw volume/delta summed over bins within
 * ±`windowPts`. Returns null when no bin in the window carries a delta (the
 * export predates the Delta column) or the windowed volume is zero.
 */
export function buildAt(
  rows: readonly VbpRow[],
  price: number,
  windowPts: number = DEFAULT_BUILD_WINDOW_PTS,
): NodeBuild | null {
  let volume = 0
  let delta = 0
  let sawDelta = false
  for (const row of rows) {
    if (Math.abs(row.price - price) > windowPts) continue
    volume += row.volume
    if (row.delta !== undefined) {
      sawDelta = true
      delta += row.delta
    }
  }
  if (!sawDelta || volume <= 0) return null

  const ratio = round4(delta / volume)
  const classification: BuildClassification =
    ratio >= ONE_SIDED_RATIO ? 'buyer-built' : ratio <= -ONE_SIDED_RATIO ? 'seller-built' : 'balanced'
  return { volume, delta, ratio, classification }
}

/** Annotate any price-carrying items (HVN/LVN nodes, magnets) with their build quality. */
export function withBuild<T extends { price: number }>(
  items: readonly T[],
  rows: readonly VbpRow[],
  windowPts: number = DEFAULT_BUILD_WINDOW_PTS,
): Built<T>[] {
  return items.map(item => ({ ...item, build: buildAt(rows, item.price, windowPts) }))
}

/** Annotate a full LVN/HVN detection result against its source profile rows. */
export function annotateNodeBuilds(
  result: { hvn: HvnNode[]; lvn: LvnNode[]; peakVolume: number },
  rows: readonly VbpRow[],
  windowPts: number = DEFAULT_BUILD_WINDOW_PTS,
): BuiltLvnDetectionResult {
  return {
    hvn: withBuild(result.hvn, rows, windowPts),
    lvn: withBuild(result.lvn, rows, windowPts),
    peakVolume: result.peakVolume,
  }
}
