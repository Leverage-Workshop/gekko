import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDailyValueAreas,
  partitionDailyValueAreas,
  type DailyValueArea,
} from './parseDailyValueAreas'
import {
  DRIFT_WINDOW_SESSIONS,
  POC_DRIFT_FLAT_MAX_PTS_PER_DAY,
  RECENT_SESSIONS_SURFACED,
  computeValueMigration,
} from './valueMigration'

// COMPLETED sessions only (feat-089) — the fixture history ships the live
// 2026-06-16 session as row 1, exactly as the study does.
const fixtureSessions = partitionDailyValueAreas(
  parseDailyValueAreas(
    readFileSync(join(__dirname, '..', '..', 'chart-data', 'daily-value-areas.csv'), 'utf8'),
  ),
  '2026-06-16',
).completed

/** Newest-first session builder: VA is `mid ±width/2`, POC at the midpoint. */
const session = (date: string, mid: number, width = 100): DailyValueArea => ({
  date,
  poc: mid,
  vah: mid + width / 2,
  val: mid - width / 2,
  sessionHigh: mid + width,
  sessionLow: mid - width,
  sessionVolume: 400000,
})

describe('computeValueMigration', () => {
  it('computes the fixture end to end', () => {
    const facts = computeValueMigration(fixtureSessions, 29945.75)
    expect(facts.sessionsAnalyzed).toBe(8)
    expect(facts.priorDay).toEqual({
      date: '2026-06-15',
      poc: 29890,
      vah: 29962,
      val: 29800,
      sessionHigh: 29993.5,
      sessionLow: 29614.5,
    })
    // Window of 5: (29890 - 29810) / 4 = 20 pts/day, rising.
    expect(facts.pocDrift).toEqual({ direction: 'up', pointsPerDay: 20, windowSessions: 5 })
    // 06-15 > 06-12 > 06-11 on both VA edges; 06-10 breaks the run.
    expect(facts.valueTrend).toEqual({
      consecutiveHigherValueDays: 3,
      consecutiveLowerValueDays: 0,
    })
    expect(facts.priorDayOverlap).toEqual({
      overlapPct: 0.71,
      relation: 'overlapping-higher',
      midpointShiftPts: 43.5,
    })
    expect(facts.currentPriceVsPriorValue).toEqual({ position: 'inside', pointsOutside: 0 })
  })

  it('throws on an empty session list', () => {
    expect(() => computeValueMigration([], 29900)).toThrow(/at least one/)
  })

  it('reads flat drift below the threshold and caps the window at the data', () => {
    const flat = [session('2026-07-23', 29902), session('2026-07-22', 29900)]
    const facts = computeValueMigration(flat, null)
    expect(facts.pocDrift).toEqual({ direction: 'flat', pointsPerDay: 2, windowSessions: 2 })
    expect(Math.abs(facts.pocDrift.pointsPerDay)).toBeLessThan(POC_DRIFT_FLAT_MAX_PTS_PER_DAY)
    expect(facts.currentPriceVsPriorValue).toBeNull()
  })

  it('reads downward drift over the full window', () => {
    const mids = [29700, 29750, 29800, 29850, 29900, 29950]
    const sessions = mids.map((mid, i) => session(`2026-07-${23 - i}`, mid))
    const facts = computeValueMigration(sessions, 29600)
    expect(facts.pocDrift.windowSessions).toBe(DRIFT_WINDOW_SESSIONS)
    // (29700 - 29900) / 4 = -50 pts/day
    expect(facts.pocDrift).toMatchObject({ direction: 'down', pointsPerDay: -50 })
    expect(facts.valueTrend).toEqual({
      consecutiveHigherValueDays: 0,
      consecutiveLowerValueDays: 5,
    })
    expect(facts.currentPriceVsPriorValue).toEqual({ position: 'below', pointsOutside: 50 })
  })

  it('a mixed (inside) day breaks both value streaks', () => {
    const sessions = [
      { ...session('2026-07-23', 29900), vah: 29930, val: 29880 }, // inside the day before
      session('2026-07-22', 29900),
      session('2026-07-21', 29800),
    ]
    const facts = computeValueMigration(sessions, null)
    expect(facts.valueTrend).toEqual({
      consecutiveHigherValueDays: 0,
      consecutiveLowerValueDays: 0,
    })
    expect(facts.priorDayOverlap?.relation).toBe('inside')
  })

  it('classifies gap relations and price above prior value', () => {
    const gapped = [session('2026-07-23', 30100), session('2026-07-22', 29900)]
    const facts = computeValueMigration(gapped, 30200)
    expect(facts.priorDayOverlap).toEqual({
      overlapPct: 0,
      relation: 'above',
      midpointShiftPts: 200,
    })
    expect(facts.currentPriceVsPriorValue).toEqual({ position: 'above', pointsOutside: 50 })

    const below = computeValueMigration([session('2026-07-23', 29700), session('2026-07-22', 29900)], null)
    expect(below.priorDayOverlap?.relation).toBe('below')

    const contains = computeValueMigration(
      [session('2026-07-23', 29900, 200), session('2026-07-22', 29900, 100)],
      null,
    )
    expect(contains.priorDayOverlap).toEqual({
      overlapPct: 0.5,
      relation: 'contains',
      midpointShiftPts: 0,
    })
  })

  it('surfaces the day-by-day recentSessions series, newest first, capped (feat-060)', () => {
    const many = Array.from({ length: RECENT_SESSIONS_SURFACED + 5 }, (_, i) =>
      session(`2026-07-${String(28 - i).padStart(2, '0')}`, 29900 - i * 10),
    )
    const facts = computeValueMigration(many, null)
    expect(facts.recentSessions).toHaveLength(RECENT_SESSIONS_SURFACED)
    expect(facts.recentSessions[0]).toEqual({
      date: '2026-07-28',
      poc: 29900,
      vah: 29950,
      val: 29850,
      sessionHigh: 30000,
      sessionLow: 29800,
    })
    expect(facts.recentSessions[1].date).toBe('2026-07-27')
    // Fewer sessions than the cap → all of them, in order.
    const few = computeValueMigration(many.slice(0, 2), null)
    expect(few.recentSessions.map((s) => s.date)).toEqual(['2026-07-28', '2026-07-27'])
  })

  it('single-session history has no overlap read and zero drift', () => {
    const facts = computeValueMigration([session('2026-07-23', 29900)], 29910)
    expect(facts.priorDayOverlap).toBeNull()
    expect(facts.pocDrift).toEqual({ direction: 'flat', pointsPerDay: 0, windowSessions: 1 })
    expect(facts.valueTrend).toEqual({
      consecutiveHigherValueDays: 0,
      consecutiveLowerValueDays: 0,
    })
  })

  it('resolves the prior day against the true prior session, not the developing one (feat-089)', () => {
    // Bundle review 2026-08-07 D1, reproduced with its own numbers: the export
    // ships the live session (08-06) as row 1, and price 29542.5 sits INSIDE the
    // value area being built around it — "inside / 0 pts outside" by
    // construction, on every bundle, every day.
    const rows = parseDailyValueAreas(
      [
        'Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume',
        '2026-08-06,29520.00,29620.00,29476.75,29686.25,29241.25,268000',
        '2026-08-05,29750.00,29810.00,29693.00,29844.00,29660.00,412345',
        '2026-08-04,29700.00,29780.00,29640.00,29820.00,29600.00,398211',
      ].join('\n'),
    )
    const price = 29542.5

    const unpartitioned = computeValueMigration(rows, price)
    expect(unpartitioned.priorDay.date).toBe('2026-08-06')
    expect(unpartitioned.currentPriceVsPriorValue).toEqual({
      position: 'inside',
      pointsOutside: 0,
    })

    const { completed } = partitionDailyValueAreas(rows, '2026-08-06')
    const partitioned = computeValueMigration(completed, price)
    // The true prior session (08-05, VAL 29693) puts price 150.5 pts BELOW
    // prior-day value — the opposite call, and the one the doctrine cares about.
    expect(partitioned.priorDay.date).toBe('2026-08-05')
    expect(partitioned.currentPriceVsPriorValue).toEqual({
      position: 'below',
      pointsOutside: 150.5,
    })
  })
})
