import type {
  ConfirmedAbsorptionCandidate,
  ConfirmedAbsorptionScanResult,
} from '@/lib/engine/stallConfirmation'

/**
 * Code-owned selection of THE absorption stack an eval displays (feat-072):
 * the stall-confirmed candidate nearest the evaluated level (falling back to
 * the current price on level-less verdicts). Confirmed-only by design — an
 * unconfirmed stack is "no stall visible in the current bars", and the
 * operator's stat row is about the stack price demonstrably stalled at.
 * Pure + immutable; persisted verbatim as `eval_results.absorption_stack`.
 */

/** Distance from a price to the stack's [bottom, top] band; 0 inside it. */
function distanceToStack(candidate: ConfirmedAbsorptionCandidate, price: number): number {
  if (price > candidate.top) return price - candidate.top
  if (price < candidate.bottom) return candidate.bottom - price
  return 0
}

/**
 * The stall-confirmed candidate nearest `referencePrice`, or null when the
 * scan is absent or nothing confirmed. Scan order (price-descending,
 * full-rotation first) breaks exact-distance ties.
 */
export function selectAbsorptionStack(
  scan: ConfirmedAbsorptionScanResult | null,
  referencePrice: number,
): ConfirmedAbsorptionCandidate | null {
  if (!scan) return null
  return scan.candidates.reduce<ConfirmedAbsorptionCandidate | null>(
    (best, candidate) =>
      candidate.stall.confirmed &&
      (best === null ||
        distanceToStack(candidate, referencePrice) < distanceToStack(best, referencePrice))
        ? candidate
        : best,
    null,
  )
}
