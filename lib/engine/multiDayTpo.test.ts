import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import { MULTI_DAY_TPO_SESSIONS, computeMultiDayTpo } from './multiDayTpo'

/** 30-min bar at chart-local time with a flat volume block (volume fields unused here). */
function bar(dateTime: string, low: number, high: number): HtfBar {
  return {
    dateTime: new Date(dateTime),
    open: low,
    high,
    low,
    close: high,
    volume: 100,
    bidVolume: 50,
    askVolume: 50,
    delta: 0,
  }
}

/** A full RTH day of bars covering [low, high] every period — a rectangular profile. */
function rthDay(date: string, low: number, high: number, periods = 4): HtfBar[] {
  return Array.from({ length: periods }, (_, i) => {
    const hour = 9 + Math.floor(i / 2)
    const minute = i % 2 === 0 ? 0 : 30
    return bar(`${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`, low, high)
  })
}

describe('computeMultiDayTpo', () => {
  it('throws on an empty export', () => {
    expect(() => computeMultiDayTpo([], 100)).toThrow()
  })

  it('returns null when the export holds fewer than two RTH sessions', () => {
    expect(computeMultiDayTpo(rthDay('2026-07-30', 100, 110), 105)).toBeNull()
  })

  it('excludes overnight bars from the composite', () => {
    const bars = [
      // Overnight spike far above the RTH range must not shift the profile.
      bar('2026-07-28 18:00:00', 500, 520),
      ...rthDay('2026-07-29', 100, 110),
      bar('2026-07-29 20:00:00', 500, 520),
      ...rthDay('2026-07-30', 100, 110),
    ]
    const facts = computeMultiDayTpo(bars, 105)!
    expect(facts.composite.range).toEqual({ high: 110, low: 100 })
    expect(facts.sessionsMerged).toBe(2)
  })

  it('concentrates the composite POC where sessions overlap', () => {
    // Day 1 trades 100–120, day 2 trades 110–130: the 110–120 overlap doubles up.
    const bars = [...rthDay('2026-07-29', 100, 120), ...rthDay('2026-07-30', 110, 130)]
    const facts = computeMultiDayTpo(bars, 125)!
    expect(facts.composite.poc.price).toBeGreaterThanOrEqual(110)
    expect(facts.composite.poc.price).toBeLessThanOrEqual(120)
    expect(facts.composite.poc.tpoCount).toBe(8)
    expect(facts.composite.range).toEqual({ high: 130, low: 100 })
  })

  it('keeps the value area inside the overlap for a two-day overlapping profile', () => {
    const bars = [...rthDay('2026-07-29', 100, 120), ...rthDay('2026-07-30', 110, 130)]
    const facts = computeMultiDayTpo(bars, 125)!
    // 21 doubled bins of the 31-bin ladder hold 68% of TPOs; the 70% area
    // barely spills past the overlap.
    expect(facts.composite.valueArea.low).toBeGreaterThanOrEqual(105)
    expect(facts.composite.valueArea.high).toBeLessThanOrEqual(125)
  })

  it('merges at most MULTI_DAY_TPO_SESSIONS newest sessions, newest-first', () => {
    const days = ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-27', '2026-07-28']
    const bars = days.flatMap((d) => rthDay(d, 100, 110))
    const facts = computeMultiDayTpo(bars, 105)!
    expect(facts.sessionsMerged).toBe(MULTI_DAY_TPO_SESSIONS)
    expect(facts.sessionDates).toEqual(['2026-07-28', '2026-07-27', '2026-07-24', '2026-07-23', '2026-07-22'])
    expect(facts.perSession.map((s) => s.date)).toEqual(facts.sessionDates)
  })

  it('flags the developing session when the last bar belongs to the newest day', () => {
    const bars = [...rthDay('2026-07-29', 100, 110), ...rthDay('2026-07-30', 100, 110, 2)]
    const facts = computeMultiDayTpo(bars, 105)!
    expect(facts.includesDevelopingSession).toBe(true)
    expect(facts.perSession[0]).toMatchObject({ date: '2026-07-30', barCount: 2 })
  })

  it('does not flag a developing session when overnight bars already roll to the next day', () => {
    const bars = [
      ...rthDay('2026-07-29', 100, 110),
      ...rthDay('2026-07-30', 100, 110),
      // 17:30 bar belongs to the 07-31 trading day, which has no RTH bars yet.
      bar('2026-07-30 17:30:00', 100, 105),
    ]
    const facts = computeMultiDayTpo(bars, 105)!
    expect(facts.includesDevelopingSession).toBe(false)
  })

  it('classifies current price against the composite value area', () => {
    const bars = [...rthDay('2026-07-29', 100, 120), ...rthDay('2026-07-30', 100, 120)]
    const above = computeMultiDayTpo(bars, 150)!
    expect(above.currentVsComposite?.location).toBe('above_value')
    const below = computeMultiDayTpo(bars, 50)!
    expect(below.currentVsComposite?.location).toBe('below_value')
    const inside = computeMultiDayTpo(bars, 110)!
    expect(inside.currentVsComposite?.location).toBe('in_value')
    expect(inside.currentVsComposite?.fromPocPts).toBeCloseTo(110 - above.composite.poc.price)
    expect(computeMultiDayTpo(bars, null)!.currentVsComposite).toBeNull()
  })

  it('surfaces an interior LVN valley between two acceptance blocks', () => {
    // Two fat blocks (100–140 and 200–240, traded every period both days)
    // joined by a single traversal bar leaves 141–199 thin.
    const traverse = [bar('2026-07-29 12:00:00', 140, 200), bar('2026-07-30 12:00:00', 140, 200)]
    const bars = [
      ...rthDay('2026-07-29', 100, 140, 6),
      ...rthDay('2026-07-30', 200, 240, 6),
      ...traverse,
    ]
    const facts = computeMultiDayTpo(bars, 220)!
    expect(facts.composite.lvns.length).toBeGreaterThan(0)
    for (const lvn of facts.composite.lvns) {
      expect(lvn.price).toBeGreaterThan(140)
      expect(lvn.price).toBeLessThan(200)
      expect(lvn.tpoCount).toBeLessThanOrEqual(2)
    }
  })

  it('surfaces a secondary HVN shelf away from the POC', () => {
    // POC block at 100–120 (both days), secondary shelf 200–210 (both days),
    // connected by single-day traversals.
    const shelf = (date: string) =>
      ['13:00', '13:30', '14:00', '14:30'].map((t) => bar(`${date} ${t}:00`, 200, 210))
    const bars = [
      ...rthDay('2026-07-29', 100, 120, 6),
      ...rthDay('2026-07-30', 100, 120, 4),
      ...shelf('2026-07-29'),
      ...shelf('2026-07-30'),
      bar('2026-07-29 12:30:00', 120, 200),
      bar('2026-07-30 12:30:00', 120, 200),
    ]
    const facts = computeMultiDayTpo(bars, 205)!
    expect(
      facts.composite.hvns.some((hvn) => hvn.price >= 200 && hvn.price <= 210),
    ).toBe(true)
  })
})
