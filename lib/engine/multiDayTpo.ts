import type { HtfBar } from './parseHtfBars'
import {
  GLOBEX_OPEN_MINUTES,
  RTH_OPEN_MINUTES,
  minutesOfDay,
  tradingDayOf,
} from './overnightSession'
import { POC_PROMINENCE_MIN } from './tpoFacts'

/**
 * Code-owned multi-day TPO composite (feat-071) — the numeric multi-day
 * Market Profile the mtfView previously had to squint at the chart image for,
 * reconstructed from the HTF 30-min bars: each 30-min bar is exactly one TPO
 * period, so counting the price bins a bar's [low, high] traverses rebuilds
 * the TPO ladder (the same reconstruction the Sierra TPO exporter itself
 * uses — there is no letters API). Validated against the live `tpo.data.md`
 * export 2026-07-30: the single-session rebuild reproduces the study's POC
 * exactly and VAH/VAL within one bin.
 *
 * Sessions are RTH-only (08:30–17:00 CT) to align with the daily value-area
 * history; the last `MULTI_DAY_TPO_SESSIONS` RTH sessions merge into one
 * composite profile — POC with prominence, 70% value area, HVN shelves and
 * interior LVN valleys — plus a per-session POC/range walk.
 */

/** RTH sessions merged into the composite (~one trading week including today). */
export const MULTI_DAY_TPO_SESSIONS = 5

/** Composite ladder bin, in points — matches the Sierra TPO export's 4-tick bin. */
export const MULTI_DAY_TPO_BIN_POINTS = 1

/** HVN shelf: smoothed local maximum holding at least this fraction of the POC count. */
const HVN_MIN_POC_FRAC = 0.6

/** LVN valley: smoothed local minimum at or under this fraction of the POC count. */
const LVN_MAX_POC_FRAC = 0.4

/** Reported nodes must sit at least this far apart (and off the POC) to be distinct. */
const NODE_MIN_SEPARATION_PTS = 20

/** Valleys hugging the profile's extremes are tapered tails, not interior LVNs. */
const INTERIOR_MARGIN_FRAC = 0.1

/** Max HVN shelves / LVN valleys surfaced (the headline facts stay compact). */
const MAX_NODES = 3

export type CompositeNode = {
  price: number
  tpoCount: number
}

export type MultiDayTpoFacts = {
  /** Trading days merged, newest-first (matches `valueMigration.recentSessions`). */
  sessionDates: string[]
  sessionsMerged: number
  /** True when the newest merged session is the export's in-progress trading day. */
  includesDevelopingSession: boolean
  tpoPeriodMinutes: number
  binPoints: number
  composite: {
    poc: {
      price: number
      tpoCount: number
      /** `tpoCount / median bin count`, rounded to 2 dp (mirrors `tpo.poc`). */
      prominence: number
      prominent: boolean
    }
    /** 70% TPO value area, expanded greedily from the POC. */
    valueArea: { high: number; low: number }
    /** Actual merged-session extremes (bar highs/lows, not bin floors). */
    range: { high: number; low: number }
    /** Secondary high-volume-time shelves, price-descending (POC excluded). */
    hvns: CompositeNode[]
    /** Interior thin zones — multi-day acceptance gaps, price-descending. */
    lvns: CompositeNode[]
  }
  /** Per-session TPO walk, newest-first. */
  perSession: {
    date: string
    poc: number
    high: number
    low: number
    barCount: number
  }[]
  /** Current price vs the composite value area; null when no current price is known. */
  currentVsComposite: {
    location: 'above_value' | 'in_value' | 'below_value'
    fromPocPts: number
    fromVahPts: number
    fromValPts: number
  } | null
}

type Row = { price: number; count: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isRthBar(bar: HtfBar): boolean {
  const mins = minutesOfDay(bar.dateTime)
  return mins >= RTH_OPEN_MINUTES && mins < GLOBEX_OPEN_MINUTES
}

function binOf(price: number): number {
  return Math.floor(price / MULTI_DAY_TPO_BIN_POINTS) * MULTI_DAY_TPO_BIN_POINTS
}

/** One TPO count per bin a bar's [low, high] traverses, accumulated into `counts`. */
function accumulate(counts: Map<number, number>, bars: readonly HtfBar[]): void {
  for (const bar of bars) {
    const top = binOf(bar.high)
    for (let price = binOf(bar.low); price <= top + 1e-9; price += MULTI_DAY_TPO_BIN_POINTS) {
      counts.set(price, (counts.get(price) ?? 0) + 1)
    }
  }
}

/** Price-ascending rows including untraded holes (count 0) so smoothing sees gaps. */
function ladderOf(counts: Map<number, number>): Row[] {
  const prices = [...counts.keys()].sort((a, b) => a - b)
  const rows: Row[] = []
  const top = prices[prices.length - 1]
  for (let price = prices[0]; price <= top + 1e-9; price += MULTI_DAY_TPO_BIN_POINTS) {
    rows.push({ price, count: counts.get(price) ?? 0 })
  }
  return rows
}

/** Max-count bin; ties break toward the middle of the range (standard TPO convention). */
function pocOf(rows: Row[]): Row {
  const mid = (rows[0].price + rows[rows.length - 1].price) / 2
  return rows.reduce((best, row) => {
    if (row.count > best.count) return row
    if (row.count === best.count && Math.abs(row.price - mid) < Math.abs(best.price - mid)) {
      return row
    }
    return best
  })
}

/**
 * 70% value area: greedy single-bin expansion from the POC, larger neighbor
 * first; a tie takes the side with fewer bins in the area so far, so flat
 * ladders expand symmetrically instead of walking one direction.
 */
function valueAreaOf(rows: Row[], pocIndex: number): { high: number; low: number } {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  let lowIndex = pocIndex
  let highIndex = pocIndex
  let inArea = rows[pocIndex].count
  while (inArea < 0.7 * total && (lowIndex > 0 || highIndex < rows.length - 1)) {
    const above = highIndex < rows.length - 1 ? rows[highIndex + 1].count : -1
    const below = lowIndex > 0 ? rows[lowIndex - 1].count : -1
    const goUp =
      above > below ||
      (above === below && highIndex - pocIndex <= pocIndex - lowIndex)
    if (goUp) {
      highIndex += 1
      inArea += above
    } else {
      lowIndex -= 1
      inArea += below
    }
  }
  return { high: rows[highIndex].price, low: rows[lowIndex].price }
}

/** ±2-bin mean smoothing — single-bin spikes/holes must not mint nodes. */
function smooth(rows: Row[]): number[] {
  return rows.map((_, i) => {
    const window = rows.slice(Math.max(0, i - 2), Math.min(rows.length, i + 3))
    return window.reduce((sum, row) => sum + row.count, 0) / window.length
  })
}

function isLocalExtreme(
  smoothed: number[],
  index: number,
  compare: (a: number, b: number) => boolean,
): boolean {
  const value = smoothed[index]
  for (let j = Math.max(0, index - 2); j <= Math.min(smoothed.length - 1, index + 2); j++) {
    if (j !== index && compare(smoothed[j], value)) return false
  }
  return true
}

/** Greedy pick of the strongest candidates, enforcing the mutual separation floor. */
function pickSeparated(candidates: Row[], anchors: number[]): CompositeNode[] {
  const picked: CompositeNode[] = []
  for (const candidate of candidates) {
    const tooClose = [...anchors, ...picked.map((n) => n.price)].some(
      (price) => Math.abs(price - candidate.price) < NODE_MIN_SEPARATION_PTS,
    )
    if (tooClose) continue
    picked.push({ price: candidate.price, tpoCount: candidate.count })
    if (picked.length >= MAX_NODES) break
  }
  return picked.sort((a, b) => b.price - a.price)
}

/**
 * @param bars chronological parsed HTF export (oldest first, partial bar last).
 * @param currentPrice live price for the vs-composite read; null when unavailable.
 * @returns null when the export holds fewer than two RTH sessions — one day is
 *   not a multi-day read; callers degrade with a warning.
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeMultiDayTpo(
  bars: readonly HtfBar[],
  currentPrice: number | null,
): MultiDayTpoFacts | null {
  if (bars.length === 0) {
    throw new Error('multi-day TPO needs at least one bar')
  }

  const sessions = new Map<string, HtfBar[]>()
  for (const bar of bars) {
    if (!isRthBar(bar)) continue
    const day = tradingDayOf(bar)
    const existing = sessions.get(day)
    if (existing) {
      existing.push(bar)
    } else {
      sessions.set(day, [bar])
    }
  }

  const dates = [...sessions.keys()].sort().slice(-MULTI_DAY_TPO_SESSIONS)
  if (dates.length < 2) return null

  const counts = new Map<number, number>()
  const perSession: MultiDayTpoFacts['perSession'] = []
  for (const date of dates) {
    const sessionBars = sessions.get(date)!
    accumulate(counts, sessionBars)
    const sessionCounts = new Map<number, number>()
    accumulate(sessionCounts, sessionBars)
    const sessionRows = ladderOf(sessionCounts)
    perSession.push({
      date,
      poc: pocOf(sessionRows).price,
      high: round2(Math.max(...sessionBars.map((b) => b.high))),
      low: round2(Math.min(...sessionBars.map((b) => b.low))),
      barCount: sessionBars.length,
    })
  }
  perSession.reverse()

  const rows = ladderOf(counts)
  const poc = pocOf(rows)
  const pocIndex = rows.findIndex((row) => row.price === poc.price)
  const valueArea = valueAreaOf(rows, pocIndex)
  const medianCount = median(rows.filter((row) => row.count > 0).map((row) => row.count))
  const prominence = medianCount > 0 ? round2(poc.count / medianCount) : 0

  const smoothed = smooth(rows)
  const interiorMarginBins = Math.floor(rows.length * INTERIOR_MARGIN_FRAC)
  const hvnCandidates = rows
    .filter(
      (row, i) =>
        row.count >= HVN_MIN_POC_FRAC * poc.count &&
        isLocalExtreme(smoothed, i, (neighbor, value) => neighbor > value),
    )
    .sort((a, b) => b.count - a.count)
  const lvnCandidates = rows
    .filter(
      (row, i) =>
        i >= interiorMarginBins &&
        i < rows.length - interiorMarginBins &&
        row.count > 0 &&
        row.count <= LVN_MAX_POC_FRAC * poc.count &&
        isLocalExtreme(smoothed, i, (neighbor, value) => neighbor < value),
    )
    .sort((a, b) => a.count - b.count)

  const currentVsComposite =
    currentPrice !== null && Number.isFinite(currentPrice)
      ? {
          location:
            currentPrice > valueArea.high
              ? ('above_value' as const)
              : currentPrice < valueArea.low
                ? ('below_value' as const)
                : ('in_value' as const),
          fromPocPts: round2(currentPrice - poc.price),
          fromVahPts: round2(currentPrice - valueArea.high),
          fromValPts: round2(currentPrice - valueArea.low),
        }
      : null

  return {
    sessionDates: [...dates].reverse(),
    sessionsMerged: dates.length,
    includesDevelopingSession: dates[dates.length - 1] === tradingDayOf(bars[bars.length - 1]),
    tpoPeriodMinutes: 30,
    binPoints: MULTI_DAY_TPO_BIN_POINTS,
    composite: {
      poc: {
        price: poc.price,
        tpoCount: poc.count,
        prominence,
        prominent: prominence >= POC_PROMINENCE_MIN,
      },
      valueArea,
      range: {
        high: round2(Math.max(...perSession.map((s) => s.high))),
        low: round2(Math.min(...perSession.map((s) => s.low))),
      },
      hvns: pickSeparated(hvnCandidates, [poc.price]),
      lvns: pickSeparated(lvnCandidates, [poc.price]),
    },
    perSession,
    currentVsComposite,
  }
}
