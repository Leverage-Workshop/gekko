/**
 * LVN/HVN detection eval harness (feat-014, Phase B; folds in feat-034 tuning).
 *
 *   npm run lvn:eval [-- --tolerance=10 --threshold=0.6]
 *
 * Loads every Phase-A fixture + its hand labels, runs the code-owned detector
 * (lib/engine/lvnDetection.ts), and greedily matches detected↔labeled levels of the SAME type
 * by nearest price within an ABSOLUTE tolerance (default ±10 points — these are trading levels
 * that align with MGI, not bin-relative). Reports precision / recall / count-delta per type per
 * fixture, then aggregates TRAIN and HOLDOUT separately.
 *
 * Exit code: nonzero only when the TRAIN aggregate F1 (LVN or HVN) is below `--threshold`.
 * HOLDOUT is reported for overfit-watch but NEVER gates and is NEVER tuned against.
 */

import { loadLvnFixtures } from '../lib/engine/loadLvnFixtures'
import type { LvnFixture, FixtureSplit } from '../lib/engine/loadLvnFixtures'
import { detectLvnHvn, DEFAULT_LVN_PARAMS } from '../lib/engine/lvnDetection'

const DEFAULT_TOLERANCE = 10
// TRAIN F1 gate — a REGRESSION FLOOR, not a quality claim. Detection is code-owned and
// authoritative (no LLM confirms node prices downstream), so accuracy matters, but LVN
// localization at a strict ±10pt tolerance on a small hand-labeled fixture set genuinely tops
// out around train LVN F1 ~0.46 / HVN ~0.69 with this detector (holdout lower — see progress.md).
// The gate is set below that so a future change that materially degrades detection fails CI;
// raising it is future work gated on a better detector and/or more fixtures.
const DEFAULT_THRESHOLD = 0.4

type Metrics = {
  tp: number
  fp: number
  fn: number
  detected: number
  labeled: number
}

function parseFlag(name: string, fallback: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`))
  if (!arg) return fallback
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) ? n : fallback
}

/** Greedy nearest matching: each label claims the closest unused detected price within tolerance. */
function score(detected: number[], labeled: number[], tolerance: number): Metrics {
  const used = new Set<number>()
  let tp = 0
  for (const label of labeled) {
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < detected.length; i++) {
      if (used.has(i)) continue
      const d = Math.abs(detected[i] - label)
      if (d <= tolerance && d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx)
      tp++
    }
  }
  return {
    tp,
    fp: detected.length - tp,
    fn: labeled.length - tp,
    detected: detected.length,
    labeled: labeled.length,
  }
}

function precision(m: Metrics): number {
  return m.tp + m.fp === 0 ? 1 : m.tp / (m.tp + m.fp)
}
function recall(m: Metrics): number {
  return m.tp + m.fn === 0 ? 1 : m.tp / (m.tp + m.fn)
}
function f1(m: Metrics): number {
  const p = precision(m)
  const r = recall(m)
  return p + r === 0 ? 0 : (2 * p * r) / (p + r)
}
function sum(a: Metrics, b: Metrics): Metrics {
  return {
    tp: a.tp + b.tp,
    fp: a.fp + b.fp,
    fn: a.fn + b.fn,
    detected: a.detected + b.detected,
    labeled: a.labeled + b.labeled,
  }
}
const EMPTY: Metrics = { tp: 0, fp: 0, fn: 0, detected: 0, labeled: 0 }

function pct(n: number): string {
  return (n * 100).toFixed(0).padStart(3) + '%'
}

function fmtRow(label: string, m: Metrics): string {
  const delta = m.detected - m.labeled
  const deltaStr = (delta > 0 ? '+' : '') + delta
  return (
    `  ${label.padEnd(22)} ` +
    `P ${pct(precision(m))}  R ${pct(recall(m))}  F1 ${pct(f1(m))}  ` +
    `det ${String(m.detected).padStart(2)}  lab ${String(m.labeled).padStart(2)}  Δ ${deltaStr.padStart(3)}`
  )
}

function evalFixture(
  fx: LvnFixture,
  tolerance: number,
): { lvn: Metrics; hvn: Metrics } {
  const result = detectLvnHvn(fx.rows)
  return {
    lvn: score(result.lvn.map(n => n.price), fx.labels.lvn, tolerance),
    hvn: score(result.hvn.map(n => n.price), fx.labels.hvn, tolerance),
  }
}

function main(): void {
  const tolerance = parseFlag('tolerance', DEFAULT_TOLERANCE)
  const threshold = parseFlag('threshold', DEFAULT_THRESHOLD)
  const { fixtures } = loadLvnFixtures({ strict: true })

  console.log(`\nLVN/HVN detection eval — tolerance ±${tolerance}pt, train F1 threshold ${threshold}`)
  console.log(`params: ${JSON.stringify(DEFAULT_LVN_PARAMS)}\n`)

  const agg: Record<FixtureSplit, { lvn: Metrics; hvn: Metrics }> = {
    train: { lvn: EMPTY, hvn: EMPTY },
    holdout: { lvn: EMPTY, hvn: EMPTY },
  }

  for (const split of ['train', 'holdout'] as FixtureSplit[]) {
    console.log(`── ${split.toUpperCase()} ──`)
    for (const fx of fixtures.filter(f => f.split === split)) {
      const m = evalFixture(fx, tolerance)
      console.log(`${fx.id}  (${fx.shape}, ${fx.primaryLvnType})`)
      console.log(fmtRow('LVN', m.lvn))
      console.log(fmtRow('HVN', m.hvn))
      agg[split].lvn = sum(agg[split].lvn, m.lvn)
      agg[split].hvn = sum(agg[split].hvn, m.hvn)
    }
    console.log(fmtRow(`${split} AGGREGATE LVN`, agg[split].lvn))
    console.log(fmtRow(`${split} AGGREGATE HVN`, agg[split].hvn))
    console.log('')
  }

  const trainLvnF1 = f1(agg.train.lvn)
  const trainHvnF1 = f1(agg.train.hvn)
  const pass = trainLvnF1 >= threshold && trainHvnF1 >= threshold
  console.log(
    `TRAIN gate: LVN F1 ${pct(trainLvnF1)}, HVN F1 ${pct(trainHvnF1)} vs ${pct(threshold)} → ${pass ? 'PASS' : 'FAIL'}\n`,
  )
  process.exit(pass ? 0 : 1)
}

main()
