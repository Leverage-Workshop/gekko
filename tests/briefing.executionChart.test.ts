import { describe, expect, it } from 'vitest'
import type { Objective } from '@/knowledge/schema/briefing.schema'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import { buildExecutionChart, wallClockUtcSeconds } from '@/lib/briefing'

function bar(dateTime: string, low: number, high: number): ExecBar {
  return {
    dateTime: new Date(dateTime),
    open: low + 1,
    high,
    low,
    close: high - 1,
    legVWAP: 0,
    deltaIntensity: 0,
  }
}

// Bars trade 30,000–30,100.
const BARS: ExecBar[] = [
  bar('2026-07-08 11:58:00', 30000, 30050),
  bar('2026-07-08 11:59:00', 30040, 30100),
]

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    macroGoal: 'Defend the wall',
    rationale: 'Absorption at the wall',
    direction: 'long',
    entries: [{ label: 'Entry A', price: 30030, trigger: 'blue rebid' }],
    stops: [{ label: 'Stop A', price: 30010, invalidation: 'lost the shelf' }],
    targets: [{ label: 'T1', price: 30090, description: 'trench' }],
    rr: 3,
    ...overrides,
  }
}

describe('buildExecutionChart', () => {
  it('returns null when there are no bars', () => {
    expect(buildExecutionChart([], [objective()])).toBeNull()
  })

  it('emits ascending, time-deduped candles', () => {
    const shuffled = [BARS[1], BARS[0], BARS[1]]
    const model = buildExecutionChart(shuffled, [])!

    expect(model.candles).toHaveLength(2)
    expect(model.candles[0].time).toBeLessThan(model.candles[1].time)
    expect(model.candles[0].low).toBe(30000)
  })

  it('anchors candle times to the CSV wall clock regardless of server timezone', () => {
    const model = buildExecutionChart(BARS, [])!
    const first = new Date(model.candles[0].time * 1000)

    expect(first.getUTCHours()).toBe(11)
    expect(first.getUTCMinutes()).toBe(58)
  })

  it('builds one entry→stop zone per objective entry, keyed by direction', () => {
    const long = objective()
    const short = objective({
      direction: 'short',
      entries: [{ label: 'Entry A', price: 30094, trigger: 'failed breakout' }],
      stops: [{ label: 'Stop A', price: 30114, invalidation: 'acceptance above' }],
    })
    const model = buildExecutionChart(BARS, [long, short])!

    expect(model.zones).toEqual([
      { from: 30010, to: 30030, entry: 30030, direction: 'long', label: 'Entry A' },
      { from: 30094, to: 30114, entry: 30094, direction: 'short', label: 'Entry A' },
    ])
  })

  it('falls back to a thin band when the objective has no valid stop', () => {
    const model = buildExecutionChart(BARS, [objective({ stops: [] })])!

    expect(model.zones).toHaveLength(1)
    const zone = model.zones[0]
    expect(zone.to).toBe(30030)
    expect(zone.from).toBeLessThan(30030)
    expect(zone.to - zone.from).toBeLessThanOrEqual(2)
  })

  it('skips junk entries and zones far outside the traded range', () => {
    const junk = objective({
      entries: [{ label: 'Entry A', price: 0, trigger: 'placeholder' }],
    })
    const farAway = objective({
      entries: [{ label: 'Entry A', price: 45000, trigger: 'moonshot' }],
      stops: [{ label: 'Stop A', price: 44980, invalidation: 'nope' }],
    })
    const model = buildExecutionChart(BARS, [junk, farAway])!

    expect(model.zones).toEqual([])
    expect(model.priceRange).toEqual({ min: 30000, max: 30100 })
  })

  it('extends the autoscale range to cover zones beyond the candles', () => {
    const short = objective({
      direction: 'short',
      entries: [{ label: 'Entry A', price: 30094, trigger: 'failed breakout' }],
      stops: [{ label: 'Stop A', price: 30114, invalidation: 'acceptance above' }],
    })
    const model = buildExecutionChart(BARS, [short])!

    // Stop at 30,114 is above the bar high of 30,100.
    expect(model.priceRange.max).toBe(30114)
    expect(model.priceRange.min).toBe(30000)
  })
})

describe('wallClockUtcSeconds', () => {
  it('re-anchors a local-parsed wall-clock Date onto UTC', () => {
    const seconds = wallClockUtcSeconds(new Date('2026-07-08 09:30:00'))
    const roundTrip = new Date(seconds * 1000)

    expect(roundTrip.getUTCHours()).toBe(9)
    expect(roundTrip.getUTCMinutes()).toBe(30)
  })
})
