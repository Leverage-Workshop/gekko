import {
  countDelta,
  EMPTY_METRICS,
  f1,
  greedyMatch,
  precision,
  recall,
  sumMetrics,
  type Metrics,
} from '@/lib/engine/nodeMatch'
import type { GoldenLabel } from './goldenSet'
import { R1_MERGE_TOLERANCE, type Instrument } from './instrument'
import type { NodeKind } from './schema'
import type { ConsensusNode } from './types'

/**
 * Scoring for the profile-vision bench (feat-124, docs/job-planning-task-plan.md
 * "Bench"). Pure: no LLM, no I/O. The bench script (scripts/profile-vision-bench.ts)
 * supplies the reads; these functions turn a set of predicted nodes and the
 * golden labels into the numbers the R15 exit criterion is judged on.
 *
 * A node and a label are represented by their band midpoint for matching (the
 * consensus already snapped bands to the grid); matching is greedy nearest
 * within a tolerance, restricted to the same kind FAMILY so a labeled lvn is
 * never satisfied by a fat node next to it (corpus B4).
 */

/** Coarse families for cross-scoring: the detector only knows lvn vs hvn. */
export type NodeFamily = 'lvn' | 'hvn' | 'extreme'

export const FAMILY_OF_KIND: Readonly<Record<NodeKind, NodeFamily>> = {
  lvn: 'lvn',
  'hvn-edge': 'hvn',
  'hvn-core': 'hvn',
  'exhaustive-node': 'extreme',
  'taper-tail': 'extreme',
}

export const FAMILIES: readonly NodeFamily[] = ['lvn', 'hvn', 'extreme']

/** A price + family, the unit of matching. */
export type ScoredNode = { readonly price: number; readonly family: NodeFamily }

export function mid(low: number, high: number): number {
  return (low + high) / 2
}

export function labelToScored(label: GoldenLabel): ScoredNode {
  return { price: mid(label.priceLow, label.priceHigh), family: FAMILY_OF_KIND[label.kind] }
}

export function consensusToScored(node: ConsensusNode): ScoredNode {
  return { price: mid(node.priceLow, node.priceHigh), family: FAMILY_OF_KIND[node.kind] }
}

/** Detector output is prices only, already split into lvn / hvn. */
export function detectorToScored(lvn: readonly number[], hvn: readonly number[]): ScoredNode[] {
  return [
    ...lvn.map((price) => ({ price, family: 'lvn' as const })),
    ...hvn.map((price) => ({ price, family: 'hvn' as const })),
  ]
}

/** The R1 merge tolerance (ES 5 / NQ 20) is the bench's primary matching tolerance. */
export function toleranceFor(instrument: Instrument): number {
  return R1_MERGE_TOLERANCE[instrument]
}

/** Metrics for one family: greedy-match the predicted prices to the labeled ones. */
export function scoreFamily(
  predicted: readonly ScoredNode[],
  labeled: readonly ScoredNode[],
  family: NodeFamily,
  tolerance: number
): Metrics {
  return greedyMatch(
    predicted.filter((n) => n.family === family).map((n) => n.price),
    labeled.filter((n) => n.family === family).map((n) => n.price),
    tolerance
  )
}

export type FamilyScores = Record<NodeFamily, Metrics>

/** Per-family metrics for one profile read against its labels. */
export function scoreRead(
  predicted: readonly ScoredNode[],
  labeled: readonly ScoredNode[],
  tolerance: number
): FamilyScores {
  return {
    lvn: scoreFamily(predicted, labeled, 'lvn', tolerance),
    hvn: scoreFamily(predicted, labeled, 'hvn', tolerance),
    extreme: scoreFamily(predicted, labeled, 'extreme', tolerance),
  }
}

/**
 * Case-level one-to-one matching (feat-124 bench). A prediction is claimed by at
 * most one label and a label claims at most one prediction, so a node is never
 * double-counted across the named + `any` passes. Named labels may only match a
 * prediction from THEIR profile; `any` labels may match a prediction from any
 * profile (a hit on either counts — the lenient golden semantics). Named labels
 * are matched first so they get priority on their own profile.
 */
export type ProfilePredictions = { readonly key: string; readonly nodes: readonly ScoredNode[] }
export type NamedLabels = { readonly key: string; readonly labels: readonly ScoredNode[] }

type Claimable = { readonly price: number; readonly key: string; used: boolean }

/** Greedy nearest claim over unused, eligible predictions; marks the winner used. */
function claim(
  labels: readonly number[],
  preds: Claimable[],
  eligible: (p: Claimable) => boolean,
  tolerance: number
): number {
  let tp = 0
  for (const label of labels) {
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < preds.length; i++) {
      const p = preds[i]
      if (p.used || !eligible(p)) continue
      const d = Math.abs(p.price - label)
      if (d <= tolerance && d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx !== -1) {
      preds[bestIdx].used = true
      tp += 1
    }
  }
  return tp
}

function scoreCaseFamily(
  predicted: readonly ProfilePredictions[],
  named: readonly NamedLabels[],
  anyLabels: readonly ScoredNode[],
  family: NodeFamily,
  tolerance: number
): Metrics {
  const preds: Claimable[] = predicted.flatMap((pp) =>
    pp.nodes
      .filter((n) => n.family === family)
      .map((n) => ({ price: n.price, key: pp.key, used: false }))
  )
  const anyF = anyLabels.filter((l) => l.family === family).map((l) => l.price)
  let labeled = anyF.length
  let tp = 0
  for (const group of named) {
    const labels = group.labels.filter((l) => l.family === family).map((l) => l.price)
    labeled += labels.length
    tp += claim(labels, preds, (p) => p.key === group.key, tolerance)
  }
  tp += claim(anyF, preds, () => true, tolerance)
  return { tp, fp: preds.length - tp, fn: labeled - tp, detected: preds.length, labeled }
}

/**
 * Score all of a case's predictions against its named + `any` labels, one-to-one
 * across the whole case, summed per family. This is the matcher the bench uses
 * for BOTH the vision read and the detector, so neither can double-count.
 */
export function scoreCaseNodes(
  predicted: readonly ProfilePredictions[],
  named: readonly NamedLabels[],
  anyLabels: readonly ScoredNode[],
  tolerance: number
): FamilyScores {
  return {
    lvn: scoreCaseFamily(predicted, named, anyLabels, 'lvn', tolerance),
    hvn: scoreCaseFamily(predicted, named, anyLabels, 'hvn', tolerance),
    extreme: scoreCaseFamily(predicted, named, anyLabels, 'extreme', tolerance),
  }
}

export function emptyFamilyScores(): FamilyScores {
  return { lvn: { ...EMPTY_METRICS }, hvn: { ...EMPTY_METRICS }, extreme: { ...EMPTY_METRICS } }
}

export function addFamilyScores(a: FamilyScores, b: FamilyScores): FamilyScores {
  return {
    lvn: sumMetrics(a.lvn, b.lvn),
    hvn: sumMetrics(a.hvn, b.hvn),
    extreme: sumMetrics(a.extreme, b.extreme),
  }
}

/** All families summed into one Metrics — the headline recall/precision. */
export function overall(scores: FamilyScores): Metrics {
  return FAMILIES.map((fam) => scores[fam]).reduce(sumMetrics, { ...EMPTY_METRICS })
}

/**
 * Primary agreement: does the predicted primary lvn land within tolerance of
 * the labeled primary? Only defined on reads where the labels name a primary.
 */
export type PrimaryOutcome = 'hit' | 'miss' | 'no_primary_predicted' | 'not_applicable'

/** The node in `nodes` closest to `price`, or null when `nodes` is empty. */
export function nearest(nodes: readonly ScoredNode[], price: number): ScoredNode | null {
  let best: ScoredNode | null = null
  let bestDist = Infinity
  for (const n of nodes) {
    const d = Math.abs(n.price - price)
    if (d < bestDist) {
      bestDist = d
      best = n
    }
  }
  return best
}

export function scorePrimary(
  predictedPrimary: ScoredNode | null,
  labeledPrimary: ScoredNode | null,
  tolerance: number
): PrimaryOutcome {
  if (!labeledPrimary) return 'not_applicable'
  if (!predictedPrimary) return 'no_primary_predicted'
  return Math.abs(predictedPrimary.price - labeledPrimary.price) <= tolerance ? 'hit' : 'miss'
}

/**
 * Self-agreement across S samples of the SAME image: the mean, over every
 * unordered sample pair, of the fraction of one sample's nodes the other
 * matched within tolerance (symmetric F1 of the greedy match). 1 = every
 * sample read the same nodes; low = the model is unstable on this image.
 * Returns null for fewer than two samples (undefined).
 */
export function selfAgreement(
  samples: readonly (readonly ScoredNode[])[],
  tolerance: number
): number | null {
  if (samples.length < 2) return null
  let total = 0
  let pairs = 0
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      total += pairAgreement(samples[i], samples[j], tolerance)
      pairs += 1
    }
  }
  return pairs === 0 ? null : total / pairs
}

function pairAgreement(
  a: readonly ScoredNode[],
  b: readonly ScoredNode[],
  tolerance: number
): number {
  if (a.length === 0 && b.length === 0) return 1
  const scores = FAMILIES.map((fam) => scoreFamily(a, b, fam, tolerance)).reduce(sumMetrics, {
    ...EMPTY_METRICS,
  })
  return f1(scores)
}

export { precision, recall, f1, countDelta, sumMetrics, type Metrics }
