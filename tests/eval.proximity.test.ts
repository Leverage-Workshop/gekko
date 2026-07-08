import { describe, expect, it } from 'vitest'
import type { EntryLevelRow } from '@/lib/eval'
import { DEFAULT_NEAR_ENTRY_POINTS, assessProximity } from '@/lib/eval'

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

describe('assessProximity', () => {
  it('picks the nearest level by absolute distance', () => {
    const result = assessProximity(
      [level('a', 30100), level('b', 30245), level('c', 30400)],
      30250,
    )
    expect(result.nearest?.level.id).toBe('b')
    expect(result.nearest?.distancePoints).toBe(5)
    expect(result.nearEntry).toBe(true)
    expect(result.thresholdPoints).toBe(DEFAULT_NEAR_ENTRY_POINTS)
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
    })
    expect(assessProximity([level('a', null)], 30250).nearest).toBeNull()
  })

  it('honors a custom threshold and rejects a nonsensical one', () => {
    expect(assessProximity([level('a', 30300)], 30250, 60).nearEntry).toBe(true)
    expect(() => assessProximity([level('a', 30300)], 30250, 0)).toThrow(/thresholdPoints/)
  })
})
