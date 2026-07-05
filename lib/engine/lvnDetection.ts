/**
 * LVN / HVN detector (feat-014, Phase B).
 *
 * Runs over an HTF Volume-by-Price (VbP) series — a `{ price, volume }[]` with no paired
 * delta — and returns the volume-profile nodes the doctrine trades around:
 *
 *   - HVN (High Volume Node): a prominent volume PEAK. High-acceptance price, acts as a
 *     magnet / wall. Also consumed by feat-015 magnetCheck.
 *   - LVN (Low Volume Node): a low-acceptance price the market moves through quickly. Detected
 *     via TWO physically-distinct mechanisms, because a single local-minima pass misses half:
 *       (a) VALLEY  — a prominent volume trough between two distributions (a dip with rising
 *           volume on both sides).
 *       (b) TAPER-EDGE — the shoulder/knee where a distribution tapers off into a flat,
 *           sustained low-volume plateau (e.g. the thin edge of a trend-elongated profile).
 *           There is no trough here — volume falls off a cliff and stays low — so prominence
 *           detection alone never fires. A relative-threshold-crossing-into-plateau test does.
 *
 * Node prices are authoritative and code-owned: the LLM is never asked to confirm or adjust
 * them (per docs/agent-architecture-plan.md — the model reads screenshots only for perception
 * the data can't give).
 *
 * Design notes:
 *   - Thresholds are RELATIVE (fractions of the profile's peak/POC volume), not absolute, so
 *     one parameter set generalises across fixtures whose raw volume magnitudes differ 10x.
 *   - The raw series is fine-grained (1-point bins) and noisy, so volume is smoothed with a
 *     moving average before extrema/plateau detection. Detected prices snap back to real bins.
 *   - Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a Briefing
 *     output — no Zod), mirroring the other lib/engine modules.
 */

export type PriceVolume = { price: number; volume: number }

export type LvnNodeType = 'valley' | 'taper-edge'

export type HvnNode = {
  price: number
  volume: number // smoothed volume at the node
  prominence: number // topographic prominence as a fraction of peak volume [0,1]
}

export type LvnNode = {
  price: number
  volume: number // smoothed volume at the node
  type: LvnNodeType
  strength: number // valley depth (fraction of peak) or plateau contrast [0,1]
}

export type LvnDetectionResult = {
  hvn: HvnNode[] // descending price, like the source series
  lvn: LvnNode[] // descending price
  peakVolume: number // max smoothed volume — the reference the relative thresholds use
}

export type LvnDetectionParams = {
  /** Moving-average window (odd count of price bins) used to de-noise before detection. */
  smoothWindow: number
  /** Min topographic prominence for an HVN peak, as a fraction of peak volume. */
  peakProminenceFrac: number
  /** Min depth for a VALLEY LVN, as a fraction of peak volume. */
  valleyDepthFrac: number
  /** A bin is "low" (plateau candidate) when smoothed volume <= this fraction of peak. */
  plateauLevelFrac: number
  /** Min sustained run (price bins) of low volume to qualify as a taper plateau. */
  plateauRun: number
  /** A plateau edge is a TAPER-EDGE only if the distribution shoulder just outside it rises
   *  to at least this fraction of peak volume (i.e. it borders a real distribution). */
  shoulderFrac: number
  /** Detected nodes of the same type closer than this (price points) are merged (keep strongest). */
  mergeTolerance: number
}

// Tuned against the 5 TRAIN fixtures via `npm run lvn:eval` (feat-034, folded in). Selection
// favored generalization over train-max: aggressive params (high prominence, big smoothing) beat
// this on train but collapsed on the holdout set (overfit), so moderate settings were kept.
// Real-world estimate (holdout, ±10pt): HVN F1 ~0.61, LVN F1 ~0.36 — HVN detection is solid; LVN
// localization is the known-hard part (the architecture's #1 engine risk) and this is a first
// cut. Detection is code-owned and authoritative (no LLM validation of node prices), so these
// numbers are what ships downstream. See progress.md for the full rationale.
export const DEFAULT_LVN_PARAMS: LvnDetectionParams = {
  smoothWindow: 13,
  peakProminenceFrac: 0.1,
  valleyDepthFrac: 0.1,
  plateauLevelFrac: 0.18,
  plateauRun: 6,
  shoulderFrac: 0.45,
  mergeTolerance: 12,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Ascending-by-price copy of the series (detection is orientation-agnostic; callers pass descending). */
function toAscending(series: PriceVolume[]): PriceVolume[] {
  return [...series].sort((a, b) => a.price - b.price)
}

/** Centered moving average over `window` bins (clamped to array edges). window<=1 is a no-op. */
function smooth(vols: number[], window: number): number[] {
  if (window <= 1) return [...vols]
  const half = Math.floor(window / 2)
  return vols.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(vols.length - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += vols[j]
    return sum / (hi - lo + 1)
  })
}

/**
 * Topographic prominence of the peak at `idx`: peak height minus the highest saddle you must
 * descend to before reaching higher ground on either side. Walk out both ways until a taller
 * bar (or the array edge), tracking the lowest valley crossed; prominence = value - max(bases).
 */
function peakProminence(vols: number[], idx: number): number {
  const v = vols[idx]
  let leftBase = v
  for (let i = idx - 1; i >= 0; i--) {
    if (vols[i] > v) break
    if (vols[i] < leftBase) leftBase = vols[i]
  }
  let rightBase = v
  for (let i = idx + 1; i < vols.length; i++) {
    if (vols[i] > v) break
    if (vols[i] < rightBase) rightBase = vols[i]
  }
  return v - Math.max(leftBase, rightBase)
}

/** Depth of the valley at `idx` — the inverse of prominence: walk out until a lower bar, track
 *  the highest peak crossed; depth = min(peaks) - value. */
function valleyDepth(vols: number[], idx: number): number {
  const v = vols[idx]
  let leftPeak = v
  for (let i = idx - 1; i >= 0; i--) {
    if (vols[i] < v) break
    if (vols[i] > leftPeak) leftPeak = vols[i]
  }
  let rightPeak = v
  for (let i = idx + 1; i < vols.length; i++) {
    if (vols[i] < v) break
    if (vols[i] > rightPeak) rightPeak = vols[i]
  }
  return Math.min(leftPeak, rightPeak) - v
}

function isLocalMax(vols: number[], i: number): boolean {
  return i > 0 && i < vols.length - 1 && vols[i] >= vols[i - 1] && vols[i] >= vols[i + 1]
}

function isLocalMin(vols: number[], i: number): boolean {
  return i > 0 && i < vols.length - 1 && vols[i] <= vols[i - 1] && vols[i] <= vols[i + 1]
}

type Candidate = { index: number; score: number }

/** Collapse candidates whose prices are within `tolerance` points, keeping the highest score. */
function mergeByPrice(cands: Candidate[], prices: number[], tolerance: number): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.score - a.score) // strongest first wins its neighborhood
  const kept: Candidate[] = []
  for (const c of sorted) {
    if (kept.every(k => Math.abs(prices[k.index] - prices[c.index]) > tolerance)) {
      kept.push(c)
    }
  }
  return kept
}

/**
 * Detect taper-edge LVNs: the knee where a distribution falls into a sustained low plateau.
 * We scan maximal runs of "low" bins (<= plateauLevel), keep runs at least `plateauRun` long,
 * and emit a run boundary as a taper-edge only when the bin just outside it rises to a real
 * distribution shoulder (>= shoulderFrac of peak) — that asymmetry is what distinguishes a
 * taper edge from the two walls of an ordinary valley (which the valley pass already covers).
 */
function detectTaperEdges(
  vols: number[],
  peak: number,
  params: LvnDetectionParams,
): Candidate[] {
  const low = params.plateauLevelFrac * peak
  const shoulder = params.shoulderFrac * peak
  const out: Candidate[] = []
  let runStart = -1
  for (let i = 0; i <= vols.length; i++) {
    const isLow = i < vols.length && vols[i] <= low
    if (isLow && runStart === -1) runStart = i
    if (!isLow && runStart !== -1) {
      const runEnd = i - 1
      if (runEnd - runStart + 1 >= params.plateauRun) {
        // Lower boundary knee: distribution sits below the plateau (bar before the run is tall).
        if (runStart > 0 && vols[runStart - 1] >= shoulder) {
          out.push({ index: runStart, score: (vols[runStart - 1] - vols[runStart]) / peak })
        }
        // Upper boundary knee: distribution sits above the plateau (bar after the run is tall).
        if (runEnd < vols.length - 1 && vols[runEnd + 1] >= shoulder) {
          out.push({ index: runEnd, score: (vols[runEnd + 1] - vols[runEnd]) / peak })
        }
      }
      runStart = -1
    }
  }
  return out
}

/**
 * Detect HVN peaks and both LVN types over a VbP `{ price, volume }[]` series.
 * Returns nodes in descending-price order (matching the source export convention).
 */
export function detectLvnHvn(
  series: PriceVolume[],
  overrides: Partial<LvnDetectionParams> = {},
): LvnDetectionResult {
  const params = { ...DEFAULT_LVN_PARAMS, ...overrides }
  if (series.length < 3) {
    return { hvn: [], lvn: [], peakVolume: 0 }
  }

  const asc = toAscending(series)
  const prices = asc.map(r => r.price)
  const smoothed = smooth(
    asc.map(r => r.volume),
    params.smoothWindow,
  )
  const peak = Math.max(...smoothed)
  if (peak <= 0) {
    return { hvn: [], lvn: [], peakVolume: 0 }
  }

  // HVN peaks: prominent local maxima.
  const peakCands: Candidate[] = []
  for (let i = 0; i < smoothed.length; i++) {
    if (!isLocalMax(smoothed, i)) continue
    const prom = peakProminence(smoothed, i)
    if (prom / peak >= params.peakProminenceFrac) peakCands.push({ index: i, score: prom / peak })
  }

  // Valley LVNs: prominent local minima (troughs between distributions).
  const valleyCands: Candidate[] = []
  for (let i = 0; i < smoothed.length; i++) {
    if (!isLocalMin(smoothed, i)) continue
    const depth = valleyDepth(smoothed, i)
    if (depth / peak >= params.valleyDepthFrac) valleyCands.push({ index: i, score: depth / peak })
  }

  // Taper-edge LVNs: knees into low-volume plateaus.
  const taperCands = detectTaperEdges(smoothed, peak, params)

  const hvnKept = mergeByPrice(peakCands, prices, params.mergeTolerance)
  const valleyKept = mergeByPrice(valleyCands, prices, params.mergeTolerance)
  // Taper edges compete with valleys for the same LVN slots — merge across both so a valley and
  // a taper knee at the same price collapse to one LVN (valley wins ties on score).
  const lvnKept = mergeByPrice([...valleyCands, ...taperCands], prices, params.mergeTolerance)
  const valleyIndices = new Set(valleyKept.map(c => c.index))

  const hvn: HvnNode[] = hvnKept.map(c => ({
    price: prices[c.index],
    volume: round2(smoothed[c.index]),
    prominence: round2(c.score),
  }))

  const lvn: LvnNode[] = lvnKept.map(c => ({
    price: prices[c.index],
    volume: round2(smoothed[c.index]),
    type: valleyIndices.has(c.index) ? 'valley' : 'taper-edge',
    strength: round2(c.score),
  }))

  // Descending price to match the VbP export / other engine consumers.
  hvn.sort((a, b) => b.price - a.price)
  lvn.sort((a, b) => b.price - a.price)

  return { hvn, lvn, peakVolume: round2(peak) }
}
