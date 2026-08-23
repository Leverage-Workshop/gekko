/**
 * Greedy nearest price matching + P/R/F1, shared by the LVN detector eval
 * (scripts/lvn-eval.ts) and the profile-vision bench (feat-124). Pure.
 *
 * Each labeled price claims the closest unused predicted price within an
 * ABSOLUTE tolerance (these are trading levels aligned to MGI, not bin-relative),
 * one-to-one. A labeled price with no predicted match inside the tolerance is a
 * false negative; a predicted price no label claimed is a false positive.
 */

export type Metrics = {
  readonly tp: number
  readonly fp: number
  readonly fn: number
  readonly detected: number
  readonly labeled: number
}

export const EMPTY_METRICS: Metrics = { tp: 0, fp: 0, fn: 0, detected: 0, labeled: 0 }

/** Greedy nearest matching: each label claims the closest unused predicted price within tolerance. */
export function greedyMatch(
  predicted: readonly number[],
  labeled: readonly number[],
  tolerance: number
): Metrics {
  const used = new Set<number>()
  let tp = 0
  for (const label of labeled) {
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < predicted.length; i++) {
      if (used.has(i)) continue
      const d = Math.abs(predicted[i] - label)
      if (d <= tolerance && d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx)
      tp += 1
    }
  }
  return {
    tp,
    fp: predicted.length - tp,
    fn: labeled.length - tp,
    detected: predicted.length,
    labeled: labeled.length,
  }
}

export function precision(m: Metrics): number {
  return m.tp + m.fp === 0 ? 1 : m.tp / (m.tp + m.fp)
}

export function recall(m: Metrics): number {
  return m.tp + m.fn === 0 ? 1 : m.tp / (m.tp + m.fn)
}

export function f1(m: Metrics): number {
  const p = precision(m)
  const r = recall(m)
  return p + r === 0 ? 0 : (2 * p * r) / (p + r)
}

/** predicted − labeled: positive = over-detection, negative = under-detection. */
export function countDelta(m: Metrics): number {
  return m.detected - m.labeled
}

export function sumMetrics(a: Metrics, b: Metrics): Metrics {
  return {
    tp: a.tp + b.tp,
    fp: a.fp + b.fp,
    fn: a.fn + b.fn,
    detected: a.detected + b.detected,
    labeled: a.labeled + b.labeled,
  }
}
