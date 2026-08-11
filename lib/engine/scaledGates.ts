import { pointsForSigma, type VolatilityScaleFacts } from './volatilityScale'

/**
 * Volatility-scaled gates (feat-096) — the fixed-point thresholds that decide
 * whether a level is worth trading, re-expressed as multiples of the measured
 * session sigma from feat-095.
 *
 * Bundle review 2026-08-07 §D3: feat-086 made `significant_move_pts` the
 * binding gate for entry qualification and set it to 50 points. Measured over
 * the 61 RTH sessions in bundle 1c15934a's own HTF export:
 *
 * ```
 * median RTH day range           464 pts   → 50 pts = 11% of a day
 * median Parkinson session sigma 283 pts   → 50 pts = 0.18σ
 * median 30-min bar range        110 pts   → 50 pts = 0.45 of ONE bar
 * ```
 *
 * Fifty points is less than half of a single 30-minute bar, so every level on
 * the map cleared the floor and `validateBriefing`'s reversal-room warning
 * never fired. The number is also fixed while the regime is not — the
 * 20-session range history in the same bundle runs 445 to 748 points.
 *
 * The fix is a change of UNITS, not a re-tune: each gate is stored as a
 * multiple of {@link VolatilityScaleFacts.sessionSigmaPts} and resolved to its
 * live point value every run, so the floor tracks the regime instead of
 * chasing it. Points remain the quoting unit everywhere the operator and the
 * model read them — {@link ResolvedGate} carries BOTH, and every message that
 * quotes a gate states the resolved points first and the multiple as the
 * qualifier.
 *
 * Degradation: {@link pointsForSigma} returns null when the scale is
 * unmeasured (under 3 complete RTH sessions, or no HTF export at all). Each
 * gate therefore carries an explicit fixed-point fallback — the pre-feat-096
 * value — so an unmeasured regime degrades to the OLD behaviour rather than
 * dividing by zero or silently dropping the gate.
 */

/**
 * The session sigma the default multiples were chosen against: the review's
 * median Parkinson session sigma over 61 RTH sessions, in points. Used to
 * document what each multiple resolves to, and by the `significant_move_sigma`
 * migration to convert an operator's stored point value into a multiple. Never
 * used as a live scale — that always comes from the measured
 * {@link VolatilityScaleFacts.sessionSigmaPts}.
 */
export const REFERENCE_SESSION_SIGMA_PTS = 283

/**
 * Default significant-move floor, in session sigma (mirrors the
 * `significant_move_sigma` migration default; the operator edits it at
 * `/settings`).
 *
 * **0.3σ since feat-112** (was 0.4σ). The units change in feat-096 was right
 * and is untouched; the multiple was set too high, and the 2026-08-11 briefing
 * is what measured it. On that map the promoted terrain borders sat at 29900 /
 * 29718.75 / 29631.75 / 29450.5 — spans of 181.25, **87**, 181.25 — with price
 * at 29654, inside the 87-pt span. The floor resolved to 145.56 pts, so the
 * only border pairs that cleared it were the outer two, and both objectives
 * were exiled to entries 246 pts above and 203 pts below a market whose prior
 * session had a 181-pt range. The model followed the contract exactly; the
 * contract was wrong.
 *
 * 0.3σ ≈ **77 pts** at the 257-pt sigma that bundle measures under feat-112's
 * recency-weighted estimator, and ≈85 pts at the review's 283-pt reference.
 * Re-argued against the same yardsticks feat-096 used, all of which the 0.4
 * multiple had quietly outgrown once the regime widened:
 *
 * - it is ~0.75 of the operator's average rotation (~102 pts, the 2026-07-27
 *   expectancy note), so the floor still rejects scalps but no longer rejects
 *   a trade of exactly the size the operator normally takes — which is what
 *   0.4σ did at a 364-pt sigma, where it demanded 1.43 rotations;
 * - it is 3.1x the fixed 25-pt operational stop, so a qualifying level still
 *   carries a sane stop-to-target relationship;
 * - it is ~0.8 of a median 30-min bar range (96 pts on that export), against
 *   the ~1.5 bars 0.4σ had drifted to — feat-096 chose 0.4 precisely BECAUSE
 *   it was one bar range at the time, an equivalence that only held at the
 *   283-pt sigma it was calibrated on;
 * - it still sits ABOVE `SIGMA_NOISE_MAX` (0.25σ) — the band the engine calls
 *   "not a meaningful gap" — which is the one property of the old default
 *   worth keeping, and the reason this is 0.3 and not lower.
 *
 * The retired 50-pt fixed floor was 0.18σ: below the noise band, which is why
 * it rejected nothing.
 */
export const DEFAULT_SIGNIFICANT_MOVE_SIGMA = 0.3

/** Pre-feat-096 fixed floor (feat-086), kept as the unmeasured-sigma fallback. */
export const SIGNIFICANT_MOVE_FALLBACK_PTS = 50

/**
 * Minimum standoff between a fresh briefing's Entry A and current price, in
 * session sigma. 0.005σ ≈ **1.4 pts** at the reference sigma — the sigma
 * expression of the 1-pt gate the 2026-07-20 operator decision set (entries
 * near price are allowed; only an entry pinned exactly where price already
 * trades is rejected). Scaled so "pinned at price" means the same thing in a
 * 748-pt regime as in a 445-pt one.
 */
export const MIN_ENTRY_STANDOFF_SIGMA = 0.005

/** Pre-feat-096 fixed standoff (2026-07-20), kept as the fallback. */
export const MIN_ENTRY_STANDOFF_FALLBACK_PTS = 1

/**
 * Maximum distance an entry may sit on the CHASE side of current price, in
 * session sigma. 0.02σ ≈ **5.7 pts** at the reference sigma — the sigma
 * expression of the 5-pt contested-border allowance (2026-07-23), which exists
 * so an anchor may sit marginally beyond price while the fight straddles the
 * level. A contested border is a volatility-sized neighbourhood, so the
 * allowance widens with the regime rather than reading as a hard 5 points on a
 * day whose bars are 200 points tall.
 */
export const MAX_ENTRY_CHASE_SIGMA = 0.02

/** Pre-feat-096 fixed chase allowance (2026-07-23), kept as the fallback. */
export const MAX_ENTRY_CHASE_FALLBACK_PTS = 5

/** The measured scale a gate resolves against — {@link VolatilityScaleFacts} or null. */
export type GateScale = Pick<VolatilityScaleFacts, 'sessionSigmaPts'> | null

/** One gate, in both units: the stored multiple and its live point value. */
export type ResolvedGate = {
  /** The stored/configured multiple of the session sigma. */
  sigmaMultiple: number
  /** The live point value the gate is enforced and quoted at. */
  pts: number
  /** The session sigma `pts` was resolved against; null when unmeasured. */
  sessionSigmaPts: number | null
  /** False when the scale was unmeasured and `pts` is the fixed fallback. */
  measured: boolean
  /** The fallback point value, for message text. */
  fallbackPts: number
}

/**
 * Resolve a sigma-expressed gate to the point value it is enforced at.
 *
 * @param sigmaMultiple  The gate in session sigma (config or a constant here).
 * @param fallbackPts    Point value used when the scale is unmeasured.
 * @param scale          The measured volatility scale, or null.
 */
export function resolveScaledGate(
  sigmaMultiple: number,
  fallbackPts: number,
  scale: GateScale,
): ResolvedGate {
  const pts = pointsForSigma(sigmaMultiple, scale ?? null)
  if (pts === null || !(pts > 0)) {
    return {
      sigmaMultiple,
      pts: fallbackPts,
      sessionSigmaPts: null,
      measured: false,
      fallbackPts,
    }
  }
  return {
    sigmaMultiple,
    pts,
    sessionSigmaPts: scale!.sessionSigmaPts,
    measured: true,
    fallbackPts,
  }
}

/** The three gates this feature scales, resolved together against one scale. */
export type ResolvedGates = {
  significantMove: ResolvedGate
  entryStandoff: ResolvedGate
  entryChase: ResolvedGate
}

/**
 * Resolve all three gates against one measured scale.
 *
 * @param significantMoveSigma  `config.significant_move_sigma`; defaults to
 *   {@link DEFAULT_SIGNIFICANT_MOVE_SIGMA} when config is unseeded.
 */
export function resolveGates(
  scale: GateScale,
  significantMoveSigma: number = DEFAULT_SIGNIFICANT_MOVE_SIGMA,
): ResolvedGates {
  return {
    significantMove: resolveScaledGate(
      significantMoveSigma,
      SIGNIFICANT_MOVE_FALLBACK_PTS,
      scale,
    ),
    entryStandoff: resolveScaledGate(
      MIN_ENTRY_STANDOFF_SIGMA,
      MIN_ENTRY_STANDOFF_FALLBACK_PTS,
      scale,
    ),
    entryChase: resolveScaledGate(MAX_ENTRY_CHASE_SIGMA, MAX_ENTRY_CHASE_FALLBACK_PTS, scale),
  }
}

/**
 * Points first, multiple as the qualifier — the phrasing every gate message
 * and prompt injection uses, so the model reasons in the units it quotes.
 *
 * Measured:   `113.2 pts (0.4σ of the measured 283-pt session sigma)`
 * Unmeasured: `50 pts (0.4σ requested, but the session sigma is unmeasured
 *              this run — fixed fallback)`
 */
export function describeGate(gate: ResolvedGate): string {
  if (!gate.measured) {
    return `${gate.pts} pts (${gate.sigmaMultiple}σ requested, but the session sigma is unmeasured this run — fixed fallback)`
  }
  return `${gate.pts} pts (${gate.sigmaMultiple}σ of the measured ${gate.sessionSigmaPts}-pt session sigma)`
}
