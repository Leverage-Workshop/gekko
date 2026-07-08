/**
 * The Vanguard Protocol (Rip / Rolling Pivot) status engine.
 *
 * Resolves the doctrine's Green/Yellow/Red condition from price-vs-Rip and the prevailing
 * red/blue Delta Intensity. The Rip is the primary intraday directional filter — it overrides
 * standard mean-reversion impulses during trending environments, so it must be consulted
 * before engaging.
 *
 * Conditions (verbatim from `tactical-companion-playbook.md` "The Vanguard Protocol"):
 *   - GREEN  (Trend Intact):  Price is above the Rip. Pullbacks into the Rip are defensive
 *                             lines. Expect blue defense; look for rebids for continuation
 *                             longs. DO NOT FADE.
 *   - YELLOW (Breach / Stress Test): Price closes below the Rip, but extreme red initiative
 *                             hasn't confirmed a full trend change. Stand down on immediate
 *                             continuation trades; the trend is bending, not broken.
 *   - RED    (Control Flipped): Price is below the Rip AND red initiative volume is building
 *                             beneath it (Delta Intensity -3/-4). The battlefield has flipped;
 *                             look for red reoffers on pullbacks up to the Rip from below.
 *
 * Inputs are scalars by design — this module depends only on feat-001 scaffold, not on the
 * deltaTelemetry (feat-011) or mgiPriority (feat-012) outputs. The caller supplies the current
 * price, the Rip price (from `mgi.daily.rip`), a representative recent Delta Intensity reading
 * for display (e.g. `deltaTelemetry.recentMeanDelta`), and the count of red-extreme prints in
 * the recent window (`deltaTelemetry.recentRedExtremeCount`) that decides the Red flip. Keeping
 * it decoupled lets either upstream module evolve without touching this one.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a Briefing output —
 * no Zod).
 */

export type RipCondition = 'green' | 'yellow' | 'red'
export type RipPosition = 'above' | 'below' | 'at'

export type RipStatus = {
  condition: RipCondition
  currentPrice: number
  rip: number
  distance: number // currentPrice - rip, signed, rounded (>0 above, <0 below)
  position: RipPosition // price vs Rip within one tick of tolerance
  deltaIntensity: number // representative recent Delta Intensity (display/context only)
  redExtremeCount: number // red-extreme prints (<= RED_EXTREME) in the recent window
  redInitiative: boolean // true when extreme red has confirmed (redExtremeCount >= RED_BUILDING_MIN_BARS)
  headline: string // short doctrine label for the condition
  action: string // doctrine action line for the condition
}

// Smallest meaningful move: one NQ tick (0.25). A price within this of the Rip is treated as
// sitting on it — the defensive line is held, not breached, so it reads as Green.
const EPSILON = 0.25

// Extreme red initiative per doctrine: a Delta Intensity print of -3 or -4. Defines what counts
// as a single red-extreme bar (deltaTelemetry counts these over its recent window).
// Exported so the doctrine drift guard (feat-032) can tie prose checks to the live constant.
export const RED_EXTREME = -3

// How many red-extreme prints within the recent window confirm "red initiative volume BUILDING"
// (the Red flip). The exec bars are 750-volume bars, so a single rogue -3/-4 print is possible
// and carries little weight on its own; genuine control flips print extremes in clusters
// (operator doctrine: at least three). Below the Rip with fewer than this the condition stays
// Yellow. Exported for the doctrine drift guard (feat-032).
export const RED_BUILDING_MIN_BARS = 3

const ACTIONS: Record<RipCondition, { headline: string; action: string }> = {
  green: {
    headline: 'Condition Green — Trend Intact',
    action:
      'Price above the Rip. Pullbacks into the Rip are defensive lines. Expect blue defense; ' +
      'look for rebids to enter continuation longs. DO NOT FADE.',
  },
  yellow: {
    headline: 'Condition Yellow — Breach / Stress Test',
    action:
      'Price below the Rip but extreme red has not confirmed a full trend change. Stand down ' +
      'on immediate continuation trades; engage only on a flush into a major HTF border with a ' +
      'trap/exhaustion pattern. The trend is bending, not broken.',
  },
  red: {
    headline: 'Condition Red — Control Flipped',
    action:
      'Price below the Rip with red initiative building beneath it (Delta Intensity -3/-4). The ' +
      'battlefield has flipped. Look for red reoffers on pullbacks up to the Rip from below; ' +
      'target the next structural support.',
  },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function classifyPosition(distance: number): RipPosition {
  if (distance > EPSILON) return 'above'
  if (distance < -EPSILON) return 'below'
  return 'at'
}

/**
 * Resolve the Vanguard Protocol condition from price-vs-Rip and Delta Intensity.
 *
 * @param input.currentPrice     Live price (e.g. `mgi.current.price`).
 * @param input.rip              The Rip / Rolling Pivot price (`mgi.daily.rip`).
 * @param input.deltaIntensity   Representative recent Delta Intensity in [-4, 4], carried for
 *                               display/context (e.g. `deltaTelemetry.recentMeanDelta`).
 * @param input.redExtremeCount  Count of red-extreme prints (<= RED_EXTREME) within the recent
 *                               window (`deltaTelemetry.recentRedExtremeCount`); reaching
 *                               RED_BUILDING_MIN_BARS beneath the Rip confirms a control flip.
 */
export function computeRipStatus(input: {
  currentPrice: number
  rip: number
  deltaIntensity: number
  redExtremeCount: number
}): RipStatus {
  const { currentPrice, rip, deltaIntensity, redExtremeCount } = input

  if (!isFiniteNumber(currentPrice)) {
    throw new Error('computeRipStatus: no finite current price')
  }
  if (!isFiniteNumber(rip)) {
    throw new Error('computeRipStatus: no finite Rip')
  }
  if (!isFiniteNumber(deltaIntensity)) {
    throw new Error('computeRipStatus: no finite deltaIntensity')
  }
  if (!isFiniteNumber(redExtremeCount) || redExtremeCount < 0) {
    throw new Error('computeRipStatus: redExtremeCount must be a non-negative finite number')
  }

  const distance = round2(currentPrice - rip)
  const position = classifyPosition(distance)
  const redInitiative = redExtremeCount >= RED_BUILDING_MIN_BARS

  // At-or-above the Rip → trend intact (the defensive line holds). Below the Rip → Red when
  // extreme red has confirmed the flip, otherwise Yellow (breach without confirmation).
  const condition: RipCondition =
    position !== 'below' ? 'green' : redInitiative ? 'red' : 'yellow'

  return {
    condition,
    currentPrice,
    rip,
    distance,
    position,
    deltaIntensity,
    redExtremeCount,
    redInitiative,
    ...ACTIONS[condition],
  }
}
