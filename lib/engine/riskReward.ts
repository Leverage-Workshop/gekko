/**
 * Direction-aware risk/reward computation for trade Objectives.
 *
 * Two doctrine rules are computed here so the model never has to do the
 * arithmetic (and never gets it wrong):
 *
 *   1. R/R reference (INFORMATIONAL since feat-086) — the ratio is measured against the
 *      operator's FIXED operational stop ({@link FIXED_RISK_PTS} = 25 pts, 2026-07-27
 *      operator decision), NOT the structural stop distance: `rr = reward to T2 / 25`.
 *      The threshold (`config.rr_min`, default 3.0) survives as a display reference —
 *      `meetsGate` reports it — but it no longer binds objective selection: the
 *      entry-first contract (2026-08-03 operator directive) qualifies entry levels by
 *      the significant-move floor (`config.significant_move_sigma`, a multiple of the
 *      measured session sigma since feat-096, advisory-checked in
 *      validateBriefing), and a low rr never disqualifies or relocates an entry. The
 *      structural stop is still validated for geometry (protective side) and the
 *      no-widen rule.
 *
 *   2. Stops never widen — `tactical-companion-playbook.md` "Stop Management: Never Allow
 *      movement farther from entry; Only Tighten When …". Given the prior briefing's stop
 *      for the same objective, a new stop that sits farther from entry (lower for a long,
 *      higher for a short) is a discipline break and invalidates the setup.
 *
 * R/R is measured to the *conclusion* target (T2, the last listed — 2026-07-27 operator
 * decision): the campaign must be worth 3x the fixed stop by its realistic conclusion.
 * T1 is a mid-traverse rung with no gate of its own. Per-target ratios are returned for
 * the UI.
 *
 * Inputs are scalars/arrays by design (this module depends only on the feat-001 scaffold).
 * `objectiveRiskReward` adapts a schema `Objective` onto the scalar core via a *type-only*
 * import, so there is no runtime coupling to Zod — consistent with the other engine modules
 * (pure, immutable, no file I/O, plain TypeScript facts).
 */

import type { Objective } from '@/knowledge/schema/briefing.schema'

export type RrDirection = 'long' | 'short'

/** Doctrine default minimum risk/reward (mirrors the seeded `config.rr_min`). */
export const DEFAULT_RR_MIN = 3.0

/**
 * The operator's fixed operational stop, in points. All R/R ratios are measured against
 * this — not against the structural stop distance (2026-07-27 operator decision: "I use
 * a 25 point stop, not structure, so the reward just needs to be 3x that").
 */
export const FIXED_RISK_PTS = 25

// One NQ tick. A stop that moves within a tick of the prior stop is not "widening" — it is
// the same defensive line, so the no-widen rule tolerates sub-tick noise (cf. ripStatus).
const EPSILON = 0.25

export type TargetRr = {
  price: number
  /** Reward distance entry→target in the trade direction (>0 when on the correct side). */
  reward: number
  /** reward / {@link FIXED_RISK_PTS}, rounded; 0 when reward is non-positive. */
  rr: number
  /** rr >= rrMin. */
  meetsGate: boolean
}

export type RiskReward = {
  direction: RrDirection
  entry: number
  stop: number
  /**
   * STRUCTURAL protective distance entry↔stop (>0 when the stop is on the correct side);
   * 0 otherwise. Feeds geometry checks and stop advisories only — R/R uses `fixedRiskPts`.
   */
  risk: number
  /** The fixed operational stop the ratios are measured against ({@link FIXED_RISK_PTS}). */
  fixedRiskPts: number
  /** Per-target reward/ratio, in the order supplied (T1 first). */
  targets: TargetRr[]
  /** Headline ratio — R/R to the conclusion target (T2, the last listed); 0 when no valid target. */
  rr: number
  rrMin: number
  /** Headline rr >= rrMin. */
  meetsGate: boolean
  /** Prior-briefing stop this was checked against, or null when none supplied. */
  priorStop: number | null
  /** true when `priorStop` is given and the new stop sits farther from entry. */
  stopWidened: boolean
  /** Geometry sound AND meetsGate AND not widened. */
  valid: boolean
  /** Human-readable invalidation reasons; empty when `valid`. */
  reasons: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Compute the direction-aware risk/reward for a setup and apply the 3:1 gate and the
 * "stops never widen" rule.
 *
 * @param input.direction  'long' | 'short'.
 * @param input.entry      Entry price (the structural border being engaged).
 * @param input.stop       Hard stop / invalidation price.
 * @param input.targets    Target prices, nearest-first (T1, T2). May be empty.
 * @param input.rrMin      Minimum acceptable R/R (default {@link DEFAULT_RR_MIN}).
 * @param input.priorStop  The prior briefing's stop for this objective, for the no-widen
 *                         check; omit/null to skip it.
 */
export function evaluateRiskReward(input: {
  direction: RrDirection
  entry: number
  stop: number
  targets: number[]
  rrMin?: number
  priorStop?: number | null
}): RiskReward {
  const { direction, entry, stop, targets } = input
  const rrMin = input.rrMin ?? DEFAULT_RR_MIN
  const priorStop = input.priorStop ?? null

  if (direction !== 'long' && direction !== 'short') {
    throw new Error(`evaluateRiskReward: invalid direction "${String(direction)}"`)
  }
  if (!isFiniteNumber(entry)) throw new Error('evaluateRiskReward: no finite entry')
  if (!isFiniteNumber(stop)) throw new Error('evaluateRiskReward: no finite stop')
  if (!isFiniteNumber(rrMin)) throw new Error('evaluateRiskReward: no finite rrMin')
  if (priorStop !== null && !isFiniteNumber(priorStop)) {
    throw new Error('evaluateRiskReward: priorStop must be a finite number or null')
  }
  targets.forEach((t, i) => {
    if (!isFiniteNumber(t)) throw new Error(`evaluateRiskReward: non-finite target at index ${i}`)
  })

  // Long protects below (risk = entry - stop), profits above. Short is the mirror.
  const long = direction === 'long'
  const rawRisk = long ? entry - stop : stop - entry
  const risk = rawRisk > 0 ? round2(rawRisk) : 0

  const targetRr: TargetRr[] = targets.map((price) => {
    const rawReward = long ? price - entry : entry - price
    const reward = round2(rawReward)
    // Ratio against the fixed operational stop — the structural stop does not set R/R.
    const rr = reward > 0 ? round2(reward / FIXED_RISK_PTS) : 0
    // Same gate as the headline: rr > 0 keeps a wrong-side target failing even at rrMin 0.
    return { price, reward, rr, meetsGate: rr > 0 && rr >= rrMin }
  })

  // The gate measures to the conclusion target (T2 = last listed; T1 is only a rung).
  const conclusion = targetRr[targetRr.length - 1]
  const rr = conclusion?.rr ?? 0
  const meetsGate = rr >= rrMin && rr > 0

  // Widening = the stop moved farther from entry than the prior briefing's stop (beyond a
  // tick of tolerance): lower for a long, higher for a short.
  const stopWidened =
    priorStop !== null &&
    (long ? stop < priorStop - EPSILON : stop > priorStop + EPSILON)

  const reasons: string[] = []
  if (risk <= 0) {
    reasons.push(`stop ${stop} is on the wrong side of entry ${entry} for a ${direction}`)
  }
  if (targetRr.length === 0) {
    reasons.push('no targets supplied')
  } else if (conclusion && conclusion.reward <= 0) {
    reasons.push(
      `conclusion target ${conclusion.price} is on the wrong side of entry ${entry} for a ${direction}`
    )
  } else if (!meetsGate) {
    reasons.push(
      `R/R ${rr.toFixed(2)} is below the ${rrMin.toFixed(2)} minimum (conclusion target reward ${conclusion.reward} pts against the fixed ${FIXED_RISK_PTS}-pt stop)`
    )
  }
  if (stopWidened) {
    reasons.push(`stop ${stop} widens vs the prior briefing stop ${priorStop} (must never move farther from entry)`)
  }

  return {
    direction,
    entry,
    stop,
    risk,
    fixedRiskPts: FIXED_RISK_PTS,
    targets: targetRr,
    rr,
    rrMin,
    meetsGate,
    priorStop,
    stopWidened,
    valid: reasons.length === 0,
    reasons,
  }
}

/**
 * Adapt a schema {@link Objective} onto {@link evaluateRiskReward}, producing the `rr` the
 * Briefing carries for that objective.
 *
 * Representative inputs are chosen conservatively:
 *   - entry  = the first listed entry (Entry A — the primary structural border).
 *   - stop   = the stop farthest from entry on the protective side (the hard invalidation);
 *              used for geometry checks and the no-widen rule (R/R itself is measured
 *              against the fixed {@link FIXED_RISK_PTS}-pt operational stop).
 *   - targets= the objective's targets in listed order (expected T1→T2, nearest first).
 *
 * @throws if the objective has no entries or no stop on the protective side of entry.
 */
export function objectiveRiskReward(
  objective: Objective,
  opts: { rrMin?: number; priorStop?: number | null } = {}
): RiskReward {
  const entry = objective.entries[0]?.price
  if (!isFiniteNumber(entry)) {
    throw new Error('objectiveRiskReward: objective has no entry price')
  }

  const long = objective.direction === 'long'
  // Worst-case invalidation: the protective-side stop farthest from entry (largest risk).
  let worstStop: number | null = null
  for (const s of objective.stops) {
    const price = s.price
    if (!isFiniteNumber(price)) continue
    const onProtectiveSide = long ? price < entry : price > entry
    if (!onProtectiveSide) continue
    const dist = Math.abs(entry - price)
    if (worstStop === null || dist > Math.abs(entry - worstStop)) worstStop = price
  }
  if (worstStop === null) {
    throw new Error(
      `objectiveRiskReward: no stop on the protective side of entry ${entry} for a ${objective.direction}`
    )
  }

  return evaluateRiskReward({
    direction: objective.direction,
    entry,
    stop: worstStop,
    targets: objective.targets.map((t) => t.price),
    rrMin: opts.rrMin,
    priorStop: opts.priorStop,
  })
}
