import { describe, expect, it } from 'vitest'
import type { EntryLevelRow } from '@/lib/eval'
import {
  DEFAULT_NEAR_ENTRY_POINTS,
  assessProximity,
  computeRecentBarRange,
} from '@/lib/eval'
import type { ExecBar } from '@/lib/engine/parseExecBars'

function level(id: string, price: number | null): EntryLevelRow {
  return {
    id,
    briefing_id: 'brief-1',
    objective: 'primary',
    label: `Entry ${id}`,
    price,
    direction: 'long',
    stop: price !== null ? price - 10 : null,
    targets: price !== null ? [price + 30] : null,
  }
}

function bar(iso: string, low: number, high: number): ExecBar {
  return {
    dateTime: new Date(iso),
    open: low,
    high,
    low,
    close: high,
    legVWAP: 0,
    deltaIntensity: 1,
  }
}

describe('assessProximity', () => {
  it('picks the nearest level by absolute distance', () => {
    const result = assessProximity(
      [level('a', 30100), level('b', 30245), level('c', 30400)],
      30250,
    )
    expect(result.nearest?.level.id).toBe('b')
    expect(result.nearest?.distancePoints).toBe(5)
    expect(result.nearest?.effectiveDistancePoints).toBe(5)
    expect(result.nearEntry).toBe(true)
    expect(result.thresholdPoints).toBe(DEFAULT_NEAR_ENTRY_POINTS)
    expect(result.barRange).toBeNull()
  })

  it('is near exactly at the threshold, not-near one tick beyond', () => {
    const at = assessProximity([level('a', 30250 + DEFAULT_NEAR_ENTRY_POINTS)], 30250)
    expect(at.nearEntry).toBe(true)

    const beyond = assessProximity(
      [level('a', 30250 + DEFAULT_NEAR_ENTRY_POINTS + 0.25)],
      30250,
    )
    expect(beyond.nearEntry).toBe(false)
    expect(beyond.nearest?.level.id).toBe('a')
  })

  it('ignores levels without a finite price', () => {
    const result = assessProximity([level('a', null), level('b', 30260)], 30250)
    expect(result.nearest?.level.id).toBe('b')
  })

  it('returns no nearest for an empty or unusable level set', () => {
    expect(assessProximity([], 30250)).toEqual({
      nearEntry: false,
      nearest: null,
      thresholdPoints: DEFAULT_NEAR_ENTRY_POINTS,
      barRange: null,
    })
    expect(assessProximity([level('a', null)], 30250).nearest).toBeNull()
  })

  it('honors a custom threshold and rejects a nonsensical one', () => {
    expect(
      assessProximity([level('a', 30300)], 30250, { thresholdPoints: 60 }).nearEntry,
    ).toBe(true)
    expect(() =>
      assessProximity([level('a', 30300)], 30250, { thresholdPoints: 0 }),
    ).toThrow(/thresholdPoints/)
  })

  it('passes the gate when a recent bar wicked to the level but the snapshot pulled away', () => {
    // Wick down to 30240 (within 20 of the 30245 level), snapshot back at 30300.
    const result = assessProximity([level('a', 30245)], 30300, {
      barRange: { low: 30240, high: 30302, barCount: 2 },
    })
    expect(result.nearEntry).toBe(true)
    expect(result.nearest?.distancePoints).toBe(55)
    expect(result.nearest?.effectiveDistancePoints).toBe(0)
  })

  it('measures effective distance to the nearer range edge when outside it', () => {
    const result = assessProximity([level('a', 30230)], 30300, {
      barRange: { low: 30240, high: 30302, barCount: 2 },
    })
    expect(result.nearest?.effectiveDistancePoints).toBe(10)
    expect(result.nearEntry).toBe(true)
  })

  it('does NOT treat the corridor between a far snapshot and the bar range as near', () => {
    // Bars topped at 29949, snapshot gapped to 31000: a level at 30400 sits
    // between them but is near neither (min of distances, not a convex hull).
    const result = assessProximity([level('a', 30400)], 31000, {
      barRange: { low: 29920, high: 29949, barCount: 1 },
    })
    expect(result.nearest?.effectiveDistancePoints).toBe(451)
    expect(result.nearEntry).toBe(false)
  })

  it('selects the nearest level by effective distance, tie-broken by snapshot distance', () => {
    // Level a: wicked to distance 0; level b: 5 snapshot points away.
    const wicked = assessProximity([level('a', 30200), level('b', 30255)], 30250, {
      barRange: { low: 30195, high: 30252, barCount: 3 },
    })
    expect(wicked.nearest?.level.id).toBe('a')

    // Both inside the range (effective 0): the snapshot-closer level wins.
    const tie = assessProximity([level('a', 30200), level('b', 30240)], 30250, {
      barRange: { low: 30195, high: 30252, barCount: 3 },
    })
    expect(tie.nearest?.level.id).toBe('b')
  })
})

describe('computeRecentBarRange', () => {
  const bars = [
    bar('2026-07-09T21:41:16Z', 29892, 29928.5),
    bar('2026-07-09T21:47:34Z', 29905, 29947.25),
    bar('2026-07-09T21:52:00Z', 29920, 29949),
  ]

  it('spans only the bars inside the window, anchored to the last bar', () => {
    // 60s window from 21:52:00 reaches back to 21:51:00 — last bar only.
    expect(computeRecentBarRange(bars, 60_000)).toEqual({
      low: 29920,
      high: 29949,
      barCount: 1,
    })
    // 5-minute window also picks up the 21:47:34 bar.
    expect(computeRecentBarRange(bars, 300_000)).toEqual({
      low: 29905,
      high: 29949,
      barCount: 2,
    })
  })

  it('always includes the last bar, even with a zero window', () => {
    expect(computeRecentBarRange(bars, 0)).toEqual({
      low: 29920,
      high: 29949,
      barCount: 1,
    })
  })

  it('returns null for no bars or a nonsensical window', () => {
    expect(computeRecentBarRange([], 60_000)).toBeNull()
    expect(computeRecentBarRange(bars, -1)).toBeNull()
    expect(computeRecentBarRange(bars, NaN)).toBeNull()
  })
})
