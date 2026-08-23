/**
 * Instrument vocabulary for the Job planner (docs/job-planning-task-plan.md, rule R1).
 *
 * The planner is single-instrument per run and keys its point tolerances off the
 * futures root: NQ distances are ~4x ES distances, so every "within N points" number
 * ships as a per-instrument pair. The renderer uses the same ratio for its axis
 * label density (major labels every 20 pts NQ / 5 pts ES).
 */
export type Instrument = 'NQ' | 'ES'

/** R1 merge tolerance (points): reads closer than this are the same reference. */
export const R1_MERGE_TOLERANCE: Readonly<Record<Instrument, number>> = { NQ: 20, ES: 5 }

/** Major price-axis label interval (points) — the R1 ratio, so labels read at the same density. */
export const MAJOR_LABEL_INTERVAL: Readonly<Record<Instrument, number>> = { NQ: 20, ES: 5 }

/** Tick size (points) shared by both instruments. */
export const TICK_SIZE = 0.25

/**
 * Derives the instrument from a price's magnitude. NQ has traded above 10,000 since
 * 2020 and ES below it — there is no overlap in the corpus window (2026). The explicit
 * `symbol` the MGI export carries (feat-121) is preferred when present; this is the
 * fallback for profiles and golden-set labels that carry only prices.
 */
export function inferInstrumentFromPrice(price: number): Instrument {
  return price >= 10_000 ? 'NQ' : 'ES'
}

/** Parses a Sierra chart symbol (`NQU26`, `ESZ26`, `MNQU26`) to its instrument root, or null. */
export function instrumentFromSymbol(symbol: string): Instrument | null {
  const root = symbol.trim().toUpperCase().replace(/^M/, '')
  if (root.startsWith('NQ')) return 'NQ'
  if (root.startsWith('ES')) return 'ES'
  return null
}
