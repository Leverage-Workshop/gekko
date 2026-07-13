import { describe, expect, it } from 'vitest'
import type { Terrain } from '@/knowledge/schema/briefing.schema'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import {
  buildExecutionChart,
  CHART_LEVEL_STYLES,
  CURRENT_PRICE_STYLE,
  wallClockUtcSeconds,
} from '@/lib/briefing'

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

const TERRAIN: Terrain = {
  zones: [{ color: 'green', top: 30100, bottom: 30000, label: 'Kill Box' }],
  levels: [
    { price: 30050, label: 'Rip Wall', kind: 'wall' },
    { price: 30020, label: 'POC Magnet', kind: 'magnet' },
    // Just outside the traded range but within the 35% window (pad = 35).
    { price: 30120, label: 'PDH', kind: 'mgi' },
    // Far above the window — must be listed off-map, not plotted.
    { price: 31000, label: 'Campaign Ceiling', kind: 'mgi' },
    // Placeholder junk ("overnight high unavailable" exported as 0).
    { price: 0, label: 'Overnight High unavailable', kind: 'mgi' },
  ],
}

describe('buildExecutionChart', () => {
  it('returns null when there are no bars', () => {
    expect(buildExecutionChart([], TERRAIN, 30050)).toBeNull()
  })

  it('emits ascending, time-deduped candles', () => {
    const shuffled = [BARS[1], BARS[0], BARS[1]]
    const model = buildExecutionChart(shuffled, TERRAIN, null)!

    expect(model.candles).toHaveLength(2)
    expect(model.candles[0].time).toBeLessThan(model.candles[1].time)
    expect(model.candles[0].low).toBe(30000)
  })

  it('anchors candle times to the CSV wall clock regardless of server timezone', () => {
    const model = buildExecutionChart(BARS, TERRAIN, null)!
    const first = new Date(model.candles[0].time * 1000)

    expect(first.getUTCHours()).toBe(11)
    expect(first.getUTCMinutes()).toBe(58)
  })

  it('plots levels inside the window and styles them by kind', () => {
    const model = buildExecutionChart(BARS, TERRAIN, null)!
    const titles = model.priceLines.map((line) => line.title)

    expect(titles).toContain('Rip Wall')
    expect(titles).toContain('POC Magnet')
    expect(titles).toContain('PDH')

    const wall = model.priceLines.find((line) => line.title === 'Rip Wall')!
    expect(wall.color).toBe(CHART_LEVEL_STYLES.wall.color)
    expect(wall.lineStyle).toBe('solid')
  })

  it('drops placeholder levels (price <= 0) entirely', () => {
    const model = buildExecutionChart(BARS, TERRAIN, null)!
    const everywhere = [
      ...model.priceLines.map((line) => line.title),
      ...model.offMapLevels.map((level) => level.label),
    ]

    expect(everywhere.join(' ')).not.toContain('unavailable')
    expect(model.priceRange.min).toBeGreaterThan(0)
  })

  it('lists far-away levels off-map instead of crushing the candles', () => {
    const model = buildExecutionChart(BARS, TERRAIN, null)!

    expect(model.offMapLevels).toEqual([
      { price: 31000, label: 'Campaign Ceiling', kind: 'mgi' },
    ])
    expect(model.priceRange.max).toBeLessThan(31000)
  })

  it('extends the autoscale range to cover plotted lines beyond the candles', () => {
    const model = buildExecutionChart(BARS, TERRAIN, null)!

    // PDH at 30,120 is above the bar high of 30,100.
    expect(model.priceRange.max).toBe(30120)
    expect(model.priceRange.min).toBe(30000)
  })

  it('adds a current-price line when the price is near the traded range', () => {
    const model = buildExecutionChart(BARS, TERRAIN, 30060)!
    const current = model.priceLines.find((line) => line.kind === 'current')!

    expect(current.price).toBe(30060)
    expect(current.color).toBe(CURRENT_PRICE_STYLE.color)
  })

  it('omits the current-price line when null or outside the window', () => {
    expect(
      buildExecutionChart(BARS, TERRAIN, null)!.priceLines.some(
        (line) => line.kind === 'current',
      ),
    ).toBe(false)
    expect(
      buildExecutionChart(BARS, TERRAIN, 45000)!.priceLines.some(
        (line) => line.kind === 'current',
      ),
    ).toBe(false)
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
