/**
 * Absorption-candidate detection over the execution Delta profile exports
 * (half-rotation ~35-pt and full-rotation ~75-pt anchors).
 *
 * Operator doctrine: absorption shows up on the delta profile as a stack of
 * same-colored bins beyond +/-50 — passive buyers absorbing sell initiative
 * (positive stack) or passive sellers absorbing buy initiative (negative
 * stack). A stack tolerates the odd weak bin in its interior (3 strong bins
 * out of 4 still reads as one stack), but a strong opposite-sign bin breaks it.
 *
 * IMPORTANT — candidates only. A stack of bins on its own means nothing: real
 * absorption requires price to be STALLED at the stack. The engine cannot see
 * that; the model confirms each candidate against price behavior on the
 * execution chart before calling absorption in a briefing.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a
 * Briefing output — no Zod).
 */

export type DeltaProfileRow = { price: number; delta: number }

/** Which execution delta export a candidate came from. */
export type DeltaProfileSource = 'half-rotation' | 'full-rotation'

export type AbsorptionSide = 'buy' | 'sell'

export type AbsorptionCandidate = {
  source: DeltaProfileSource
  /** Sign of the stack's qualifying deltas: buy = positive, sell = negative. */
  side: AbsorptionSide
  /** Highest bin price in the stack. */
  top: number
  /** Lowest bin price in the stack. */
  bottom: number
  /** Total bins spanned, gap bins included. */
  binCount: number
  /** Bins meeting the sign + threshold criteria. */
  qualifyingCount: number
  /** Largest |delta| among the stack's bins. */
  peakAbsDelta: number
  /** Signed delta sum over the stack (gap bins included). */
  netDelta: number
}

export type AbsorptionScanResult = {
  /** Candidates from all sources, price-descending by stack top. */
  candidates: AbsorptionCandidate[]
}

// A bin participates in a stack when its delta clears this magnitude on the
// stack's side (operator doctrine: same-colored bins beyond +/-50). Exported
// for the doctrine drift guard (feat-032 pattern).
export const ABSORPTION_DELTA_THRESHOLD = 50

// Minimum qualifying bins for a stack to be worth reporting — smaller runs are
// noise (operator doctrine: at least three). Exported for the drift guard.
export const MIN_STACK_BINS = 3

// Total-span cap per stack, gap bins included; a longer region is emitted as
// one capped stack and scanning resumes after it. Exported for the drift guard.
export const MAX_STACK_BINS = 10

// Gap tolerance: qualifying bins must make up at least this fraction of the
// stack's span (operator doctrine: the odd weak interior bin is fine — 3
// strong bins out of 4, or 4 of 5, still read as one stack). Exported for the
// drift guard.
export const MIN_QUALIFYING_FRAC = 0.7

export type AbsorptionParams = {
  deltaThreshold?: number
  minStackBins?: number
  maxStackBins?: number
  minQualifyingFrac?: number
}

type ResolvedParams = Required<AbsorptionParams>

function resolveParams(params?: AbsorptionParams): ResolvedParams {
  return {
    deltaThreshold: params?.deltaThreshold ?? ABSORPTION_DELTA_THRESHOLD,
    minStackBins: params?.minStackBins ?? MIN_STACK_BINS,
    maxStackBins: params?.maxStackBins ?? MAX_STACK_BINS,
    minQualifyingFrac: params?.minQualifyingFrac ?? MIN_QUALIFYING_FRAC,
  }
}

function sideOf(delta: number, threshold: number): AbsorptionSide | null {
  if (delta >= threshold) return 'buy'
  if (delta <= -threshold) return 'sell'
  return null
}

/**
 * Longest stack starting at `start` (a qualifying bin for `side`), or null.
 *
 * Extends over gap bins (|delta| below threshold) until a strong opposite-sign
 * bin or the span cap, then trims back to the furthest qualifying end bin that
 * keeps the qualifying ratio and minimum-count invariants.
 */
function stackAt(
  rows: readonly DeltaProfileRow[],
  start: number,
  side: AbsorptionSide,
  source: DeltaProfileSource,
  p: ResolvedParams,
): { candidate: AbsorptionCandidate; end: number } | null {
  // Qualifying end positions with the qualifying count up to each, in scan order.
  const ends: { index: number; qualifying: number }[] = []
  let qualifying = 0
  for (let i = start; i < rows.length && i - start < p.maxStackBins; i++) {
    const binSide = sideOf(rows[i].delta, p.deltaThreshold)
    if (binSide !== null && binSide !== side) break
    if (binSide === side) {
      qualifying += 1
      ends.push({ index: i, qualifying })
    }
  }

  for (let e = ends.length - 1; e >= 0; e--) {
    const { index, qualifying: q } = ends[e]
    const span = index - start + 1
    if (q < p.minStackBins) return null
    if (q >= p.minQualifyingFrac * span - 1e-9) {
      const bins = rows.slice(start, index + 1)
      return {
        candidate: {
          source,
          side,
          top: rows[start].price,
          bottom: rows[index].price,
          binCount: span,
          qualifyingCount: q,
          peakAbsDelta: Math.max(...bins.map(b => Math.abs(b.delta))),
          netDelta: bins.reduce((sum, b) => sum + b.delta, 0),
        },
        end: index,
      }
    }
  }
  return null
}

/**
 * Scan one delta profile (price-descending rows) for absorption-candidate
 * stacks. Stacks start and end on qualifying bins, never overlap, and are
 * returned in price-descending order.
 */
export function detectAbsorptionStacks(
  rows: readonly DeltaProfileRow[],
  source: DeltaProfileSource,
  params?: AbsorptionParams,
): AbsorptionCandidate[] {
  const p = resolveParams(params)
  const candidates: AbsorptionCandidate[] = []
  let i = 0
  while (i < rows.length) {
    const side = sideOf(rows[i].delta, p.deltaThreshold)
    if (side === null) {
      i += 1
      continue
    }
    const stack = stackAt(rows, i, side, source, p)
    if (stack === null) {
      i += 1
      continue
    }
    candidates.push(stack.candidate)
    i = stack.end + 1
  }
  return candidates
}

/**
 * Scan both execution delta exports and merge the candidates, price-descending
 * by stack top (full-rotation before half-rotation on exact ties).
 */
export function scanAbsorption(
  profiles: {
    halfRotation: readonly DeltaProfileRow[]
    fullRotation: readonly DeltaProfileRow[]
  },
  params?: AbsorptionParams,
): AbsorptionScanResult {
  const candidates = [
    ...detectAbsorptionStacks(profiles.fullRotation, 'full-rotation', params),
    ...detectAbsorptionStacks(profiles.halfRotation, 'half-rotation', params),
  ].sort((a, b) => b.top - a.top)
  return { candidates }
}
