import { describe, expect, it } from 'vitest'
import type { DailyValueArea } from './parseDailyValueAreas'
import {
  RANGE_RECENT_SESSIONS,
  RANGE_SERIES_SESSIONS,
  computeDailyRanges,
} from './dailyRanges'

/** Newest-first session builder with an explicit high−low range. */
const session = (date: string, rangePts: number, mid = 30000): DailyValueArea => ({
  date,
  poc: mid,
  vah: mid + rangePts / 4,
  val: mid - rangePts / 4,
  sessionHigh: mid + rangePts / 2,
  sessionLow: mid - rangePts / 2,
  sessionVolume: 400000,
})

/** Newest-first: `ranges[0]` is the most recent session's range. */
const sessionsWithRanges = (ranges: readonly number[]): DailyValueArea[] =>
  ranges.map((r, i) => session(`2026-07-${String(28 - i).padStart(2, '0')}`, r))

describe('computeDailyRanges', () => {
  it('throws on empty input', () => {
    expect(() => computeDailyRanges([])).toThrow(/at least one/)
  })

  it('reports the per-session range series newest first, capped at the window', () => {
    const facts = computeDailyRanges(sessionsWithRanges(Array(15).fill(80)))
    expect(facts.days).toHaveLength(RANGE_SERIES_SESSIONS)
    expect(facts.days[0].date).toBe('2026-07-28')
    expect(facts.days.every((d) => d.rangePts === 80)).toBe(true)
  })

  it('reads contraction when the recent mean is ≤80% of the prior mean', () => {
    // Recent 3: 50/55/45 (mean 50); prior: 100 ×5 (mean 100) → ratio 0.5.
    const facts = computeDailyRanges(sessionsWithRanges([50, 55, 45, 100, 100, 100, 100, 100]))
    expect(facts.meanRecentPts).toBe(50)
    expect(facts.meanPriorPts).toBe(100)
    expect(facts.ratio).toBe(0.5)
    expect(facts.read).toBe('contracting')
  })

  it('reads expansion when the recent mean is ≥120% of the prior mean', () => {
    const facts = computeDailyRanges(sessionsWithRanges([130, 120, 110, 80, 80, 80, 80]))
    expect(facts.read).toBe('expanding')
    expect(facts.ratio).toBeGreaterThanOrEqual(1.2)
  })

  it('reads stable inside the ±20% band', () => {
    const facts = computeDailyRanges(sessionsWithRanges([85, 80, 75, 80, 80, 80]))
    expect(facts.read).toBe('stable')
  })

  it('degrades to stable with ratio 1 when every session fits in the recent window', () => {
    const facts = computeDailyRanges(sessionsWithRanges([90, 70, 50].slice(0, RANGE_RECENT_SESSIONS)))
    expect(facts.read).toBe('stable')
    expect(facts.ratio).toBe(1)
    expect(facts.meanPriorPts).toBe(facts.meanRecentPts)
  })

  it('rounds ranges and means to 2 dp', () => {
    const facts = computeDailyRanges(sessionsWithRanges([33.333, 33.333, 33.333, 50]))
    expect(facts.days[0].rangePts).toBe(33.33)
    expect(facts.meanRecentPts).toBe(33.33)
  })
})
