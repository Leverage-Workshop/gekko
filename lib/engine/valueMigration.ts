import type { DailyValueArea } from './parseDailyValueAreas'

/**
 * Code-owned value-migration read (feat-048) — how value (the per-session
 * volume value area) is moving across completed RTH sessions, and where the
 * current price sits relative to the most recent completed session's value.
 * Answers the analyze narrative's question "is the balance area building in
 * place, or is value leading price out of it?" numerically, replacing a
 * screenshot inference off the HTF chart. The balance-area VbP's anchoring is
 * owned by its third-party study — nothing here re-derives or validates it.
 */

/** Sessions (newest-first) the POC drift pace is measured across. */
export const DRIFT_WINDOW_SESSIONS = 5

/** Completed sessions (newest-first) surfaced day-by-day in `recentSessions` (feat-060). */
export const RECENT_SESSIONS_SURFACED = 10

/**
 * Mean POC drift below this (NQ points per session, over the drift window)
 * reads as "flat" — value building in place rather than migrating.
 */
export const POC_DRIFT_FLAT_MAX_PTS_PER_DAY = 5

export type ValueRelation =
  /** Entire value area above the prior day's (zero overlap) — a gap higher in value. */
  | 'above'
  /** Entire value area below the prior day's (zero overlap) — a gap lower in value. */
  | 'below'
  /** Value area contained inside the prior day's — value compressing in place. */
  | 'inside'
  /** Value area contains the prior day's — value expanding around it. */
  | 'contains'
  /** Partial overlap, midpoint shifted up. */
  | 'overlapping-higher'
  /** Partial overlap, midpoint shifted down. */
  | 'overlapping-lower'

export type PricePosition = 'above' | 'inside' | 'below'

export type ValueMigrationFacts = {
  /** Completed sessions in the export (newest first), max ~20. */
  sessionsAnalyzed: number
  /**
   * The most recent COMPLETED session — the "prior day" relative to the live
   * session the analyze/eval runs inside.
   */
  priorDay: {
    date: string
    poc: number
    vah: number
    val: number
    sessionHigh: number
    sessionLow: number
  }
  /**
   * The last ≤{@link RECENT_SESSIONS_SURFACED} completed sessions, newest
   * first — the day-by-day value series (feat-060) behind the overview's
   * HTF/MTF narrative (where value built each day, how the POCs stack), which
   * the drift/streak scalars alone cannot convey.
   */
  recentSessions: {
    date: string
    poc: number
    vah: number
    val: number
    sessionHigh: number
    sessionLow: number
  }[]
  /** Mean signed POC change per session over the drift window. */
  pocDrift: {
    direction: 'up' | 'down' | 'flat'
    /** Signed points per session (rounded 2 dp); positive = value rising. */
    pointsPerDay: number
    /** Sessions the pace was measured across (window size, data permitting). */
    windowSessions: number
  }
  /**
   * Consecutive higher/lower-value days ending at the most recent completed
   * session. "Higher value" = both VAH and VAL above the previous session's
   * (classic value-migration read); a mixed/overlapping day breaks both runs.
   */
  valueTrend: {
    consecutiveHigherValueDays: number
    consecutiveLowerValueDays: number
  }
  /** Most recent completed session's value area vs the session before it. */
  priorDayOverlap: {
    /** Fraction of the newer value area overlapping the older one (0..1, 2 dp). */
    overlapPct: number
    relation: ValueRelation
    /** Signed VA-midpoint shift in points (newer minus older, 2 dp). */
    midpointShiftPts: number
  } | null
  /**
   * Where the CURRENT price sits relative to the prior day's value area — the
   * acceptance-outside-value question is the model's to judge over time; this
   * is the instantaneous, code-owned position.
   */
  currentPriceVsPriorValue: {
    position: PricePosition
    /** Points beyond the nearer VA edge (0 when inside). */
    pointsOutside: number
  } | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function relate(newer: DailyValueArea, older: DailyValueArea): ValueMigrationFacts['priorDayOverlap'] {
  const overlapHigh = Math.min(newer.vah, older.vah)
  const overlapLow = Math.max(newer.val, older.val)
  const newerWidth = newer.vah - newer.val
  const overlap = Math.max(0, overlapHigh - overlapLow)
  const overlapPct = newerWidth > 0 ? round2(overlap / newerWidth) : overlap > 0 ? 1 : 0
  const midpointShiftPts = round2((newer.vah + newer.val) / 2 - (older.vah + older.val) / 2)

  let relation: ValueRelation
  if (newer.val >= older.vah) relation = 'above'
  else if (newer.vah <= older.val) relation = 'below'
  else if (newer.vah <= older.vah && newer.val >= older.val) relation = 'inside'
  else if (newer.vah >= older.vah && newer.val <= older.val) relation = 'contains'
  else relation = midpointShiftPts >= 0 ? 'overlapping-higher' : 'overlapping-lower'

  return { overlapPct, relation, midpointShiftPts }
}

/**
 * @param sessions completed sessions, most recent first (as parsed).
 * @param currentPrice live price for the prior-day-value position read; null
 *   when unavailable (the position fact is then null).
 * @throws when `sessions` is empty — callers gate on a non-empty parse.
 */
export function computeValueMigration(
  sessions: readonly DailyValueArea[],
  currentPrice: number | null,
): ValueMigrationFacts {
  if (sessions.length === 0) {
    throw new Error('value migration needs at least one completed session')
  }

  const latest = sessions[0]

  const windowSessions = Math.min(DRIFT_WINDOW_SESSIONS, sessions.length)
  const oldestInWindow = sessions[windowSessions - 1]
  const pointsPerDay =
    windowSessions > 1
      ? round2((latest.poc - oldestInWindow.poc) / (windowSessions - 1))
      : 0
  const direction =
    Math.abs(pointsPerDay) < POC_DRIFT_FLAT_MAX_PTS_PER_DAY
      ? 'flat'
      : pointsPerDay > 0
        ? 'up'
        : 'down'

  let consecutiveHigherValueDays = 0
  let consecutiveLowerValueDays = 0
  for (let i = 0; i + 1 < sessions.length; i++) {
    const newer = sessions[i]
    const older = sessions[i + 1]
    const higher = newer.vah > older.vah && newer.val > older.val
    const lower = newer.vah < older.vah && newer.val < older.val
    if (higher && consecutiveLowerValueDays === 0) consecutiveHigherValueDays++
    else if (lower && consecutiveHigherValueDays === 0) consecutiveLowerValueDays++
    else break
  }

  let currentPriceVsPriorValue: ValueMigrationFacts['currentPriceVsPriorValue'] = null
  if (currentPrice !== null && Number.isFinite(currentPrice)) {
    const position: PricePosition =
      currentPrice > latest.vah ? 'above' : currentPrice < latest.val ? 'below' : 'inside'
    const pointsOutside =
      position === 'above'
        ? round2(currentPrice - latest.vah)
        : position === 'below'
          ? round2(latest.val - currentPrice)
          : 0
    currentPriceVsPriorValue = { position, pointsOutside }
  }

  return {
    sessionsAnalyzed: sessions.length,
    priorDay: {
      date: latest.date,
      poc: latest.poc,
      vah: latest.vah,
      val: latest.val,
      sessionHigh: latest.sessionHigh,
      sessionLow: latest.sessionLow,
    },
    recentSessions: sessions.slice(0, RECENT_SESSIONS_SURFACED).map((s) => ({
      date: s.date,
      poc: s.poc,
      vah: s.vah,
      val: s.val,
      sessionHigh: s.sessionHigh,
      sessionLow: s.sessionLow,
    })),
    pocDrift: { direction, pointsPerDay, windowSessions },
    valueTrend: { consecutiveHigherValueDays, consecutiveLowerValueDays },
    priorDayOverlap: sessions.length > 1 ? relate(sessions[0], sessions[1]) : null,
    currentPriceVsPriorValue,
  }
}
