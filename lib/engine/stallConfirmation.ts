import type { AbsorptionCandidate, AbsorptionScanResult } from './absorption'
import type { ExecBar } from './parseExecBars'

/**
 * Numeric stall confirmation for absorption candidates (feat-047).
 *
 * Doctrine: a stack of one-sided delta bins means absorption only where price
 * STALLED at the stack. Before the enriched bar columns that call was punted
 * to the model's read of the execution chart; with per-bar volume it is
 * code-owned: heavy participation at the stack (these are 750-volume bars, so
 * several bars overlapping the stack IS heavy volume) with no meaningful
 * price progress through it.
 *
 * The check scans the execution bars for the longest consecutive run of bars
 * whose range overlaps the stack (± a small tolerance) and confirms the stall
 * when the run is long enough and its net close-to-close movement stays within
 * the stack's own height. A candidate can be unconfirmed simply because the
 * rolling bar window no longer covers the stack — the stack may predate the
 * window — so unconfirmed means "no stall visible in the current bars", not
 * "refuted". Pure + immutable; no file I/O.
 */

export type StallConfirmation = {
  /** Bars in the longest consecutive run overlapping the stack (0 = price never visited it in-window). */
  barsAtStack: number
  /** Total contracts traded across that run. */
  volumeAtStack: number
  /** Total trades across that run. */
  tradesAtStack: number
  /** Net signed close-to-close movement over the run (last close − first close). */
  netProgressPts: number
  /** True when the run shows heavy participation with no meaningful progress. */
  confirmed: boolean
}

export type ConfirmedAbsorptionCandidate = AbsorptionCandidate & { stall: StallConfirmation }

export type ConfirmedAbsorptionScanResult = { candidates: ConfirmedAbsorptionCandidate[] }

// Minimum consecutive overlapping bars for a confirmed stall — at 750
// contracts per bar this is the "heavy volume" floor. Exported for the drift
// guard (feat-032 pattern).
export const MIN_STALL_BARS = 3

// Net progress floor (pts): a run moving no further than max(this, stack
// height) reads as stalled. Exported for the drift guard.
export const STALL_MAX_PROGRESS_PTS = 5

// Bars within this many points of the stack still count as trading "at" it.
export const STALL_PRICE_TOLERANCE_PTS = 1

/** Stall stats for one candidate over the execution bars (ascending time). */
export function confirmStall(
  candidate: AbsorptionCandidate,
  bars: readonly ExecBar[],
): StallConfirmation {
  const top = candidate.top + STALL_PRICE_TOLERANCE_PTS
  const bottom = candidate.bottom - STALL_PRICE_TOLERANCE_PTS

  // Longest consecutive run of bars overlapping [bottom, top]; latest run wins ties.
  let best: ExecBar[] = []
  let current: ExecBar[] = []
  for (const bar of bars) {
    if (bar.low <= top && bar.high >= bottom) {
      current = [...current, bar]
      if (current.length >= best.length) best = current
    } else {
      current = []
    }
  }

  if (best.length === 0) {
    return { barsAtStack: 0, volumeAtStack: 0, tradesAtStack: 0, netProgressPts: 0, confirmed: false }
  }

  const netProgressPts =
    Math.round((best[best.length - 1].close - best[0].close) * 100) / 100
  const stallSpan = Math.max(STALL_MAX_PROGRESS_PTS, candidate.top - candidate.bottom)
  return {
    barsAtStack: best.length,
    volumeAtStack: best.reduce((sum, b) => sum + b.volume, 0),
    tradesAtStack: best.reduce((sum, b) => sum + b.numberOfTrades, 0),
    netProgressPts,
    confirmed: best.length >= MIN_STALL_BARS && Math.abs(netProgressPts) <= stallSpan,
  }
}

/** Annotate every candidate in a scan with its code-owned stall confirmation. */
export function confirmStalls(
  scan: AbsorptionScanResult,
  bars: readonly ExecBar[],
): ConfirmedAbsorptionScanResult {
  return {
    candidates: scan.candidates.map(candidate => ({
      ...candidate,
      stall: confirmStall(candidate, bars),
    })),
  }
}
