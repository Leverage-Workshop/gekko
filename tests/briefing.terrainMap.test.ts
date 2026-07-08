import { describe, expect, it } from 'vitest'
import type { Terrain } from '@/knowledge/schema/briefing.schema'
import {
  buildTerrainMap,
  formatPrice,
  priceToY,
  DEFAULT_ZONE_FILL,
  LEVEL_STYLES,
  ZONE_FILLS,
} from '@/lib/briefing/terrainMap'

// Contiguous Stratosphere→Abyss stack satisfying the No-Gap invariant
// (zone[N].bottom === zone[N+1].top), in the Gem's blue→purple color order.
const terrain: Terrain = {
  zones: [
    { color: 'blue', top: 30500, bottom: 30400, label: 'Stratosphere' },
    { color: 'red', top: 30400, bottom: 30300, label: 'Attic' },
    { color: 'green', top: 30300, bottom: 30200, label: 'Killbox' },
    { color: 'pink', top: 30200, bottom: 30100, label: 'Foundation' },
    { color: 'purple', top: 30100, bottom: 30000, label: 'Abyss' },
  ],
  levels: [
    { price: 30400, label: 'ONH', kind: 'wall' },
    { price: 30250, label: 'POC', kind: 'magnet' },
    { price: 30100, label: 'Rip', kind: 'trench' },
    { price: 30050, label: 'PDL', kind: 'mgi' },
  ],
}

const currentPrice = 30436.25

describe('buildTerrainMap', () => {
  it('returns null when there are no zones', () => {
    const model = buildTerrainMap({ zones: [], levels: [] }, currentPrice)
    expect(model).toBeNull()
  })

  it('returns null for a degenerate zero-height price range', () => {
    const model = buildTerrainMap(
      { zones: [{ color: 'blue', top: 30300, bottom: 30300, label: 'Flat' }], levels: [] },
      null,
    )
    expect(model).toBeNull()
  })

  it('maps the domain extremes onto the plot edges', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    expect(model.domain).toEqual({ top: 30500, bottom: 30000 })
    expect(model.zones[0].y).toBeCloseTo(model.plot.y, 6)
    const last = model.zones[model.zones.length - 1]
    expect(last.y + last.height).toBeCloseTo(model.plot.y + model.plot.height, 6)
  })

  it('renders No-Gap zones as touching rectangles that tile the plot', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    for (let i = 0; i < model.zones.length - 1; i++) {
      expect(model.zones[i].y + model.zones[i].height).toBeCloseTo(model.zones[i + 1].y, 6)
    }
    const total = model.zones.reduce((sum, zone) => sum + zone.height, 0)
    expect(total).toBeCloseTo(model.plot.height, 6)
  })

  it('sorts zones top-down regardless of input order', () => {
    const shuffled: Terrain = { zones: [...terrain.zones].reverse(), levels: [] }
    const model = buildTerrainMap(shuffled, null)!
    expect(model.zones.map((zone) => zone.label)).toEqual([
      'Stratosphere',
      'Attic',
      'Killbox',
      'Foundation',
      'Abyss',
    ])
  })

  it('maps the Gem zone colors and falls back for unknown colors', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    expect(model.zones.map((zone) => zone.fill)).toEqual([
      ZONE_FILLS.blue,
      ZONE_FILLS.red,
      ZONE_FILLS.green,
      ZONE_FILLS.pink,
      ZONE_FILLS.purple,
    ])

    const unknown = buildTerrainMap(
      { zones: [{ color: 'chartreuse', top: 2, bottom: 1, label: 'X' }], levels: [] },
      null,
    )!
    expect(unknown.zones[0].fill).toBe(DEFAULT_ZONE_FILL)
  })

  it('styles level lines by kind and places them inside the plot', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    expect(model.levels).toHaveLength(4)
    for (const level of model.levels) {
      const style = LEVEL_STYLES[level.kind]
      expect(level.color).toBe(style.color)
      expect(level.dash).toBe(style.dash)
      expect(level.y).toBeGreaterThanOrEqual(model.plot.y)
      expect(level.y).toBeLessThanOrEqual(model.plot.y + model.plot.height)
      expect(level.x1).toBe(model.plot.x)
      expect(level.x2).toBe(model.plot.x + model.plot.width)
    }
    expect(model.levels[0].priceText).toBe('30,400.00')
  })

  it('extends the price domain to cover levels outside the zone stack', () => {
    const withOutlier: Terrain = {
      zones: terrain.zones,
      levels: [{ price: 30600, label: 'wkHigh', kind: 'mgi' }],
    }
    const model = buildTerrainMap(withOutlier, null)!
    expect(model.domain.top).toBe(30600)
    // The zone stack no longer starts at the plot top edge.
    expect(model.zones[0].y).toBeGreaterThan(model.plot.y)
    expect(model.levels[0].y).toBeCloseTo(model.plot.y, 6)
  })

  it('places the current-price marker, and omits it when price is null', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    expect(model.marker).not.toBeNull()
    expect(model.marker!.price).toBe(currentPrice)
    expect(model.marker!.y).toBeCloseTo(priceToY(currentPrice, model.domain, model.plot), 6)
    expect(model.marker!.priceText).toBe('30,436.25')

    const withoutPrice = buildTerrainMap(terrain, null)!
    expect(withoutPrice.marker).toBeNull()
  })

  it('emits nice ascending axis ticks aligned to the step', () => {
    const model = buildTerrainMap(terrain, currentPrice)!
    // 500-pt range at ~8 target ticks → nice step 100 → 30000..30500.
    expect(model.ticks.map((tick) => tick.price)).toEqual([
      30000, 30100, 30200, 30300, 30400, 30500,
    ])
    for (const tick of model.ticks) {
      expect(tick.y).toBeGreaterThanOrEqual(model.plot.y)
      expect(tick.y).toBeLessThanOrEqual(model.plot.y + model.plot.height)
    }
    expect(model.ticks[0].label).toBe('30,000.00')
  })

  it('hides labels on zones too thin to hold them', () => {
    const thin: Terrain = {
      zones: [
        { color: 'blue', top: 30500, bottom: 30499, label: 'Sliver' },
        { color: 'purple', top: 30499, bottom: 30000, label: 'Bulk' },
      ],
      levels: [],
    }
    const model = buildTerrainMap(thin, null)!
    expect(model.zones[0].labelVisible).toBe(false)
    expect(model.zones[1].labelVisible).toBe(true)
  })
})

describe('priceToY', () => {
  it('is linear across the domain', () => {
    const domain = { top: 200, bottom: 100 }
    const plot = { x: 50, y: 10, width: 500, height: 400 }
    expect(priceToY(200, domain, plot)).toBe(10)
    expect(priceToY(100, domain, plot)).toBe(410)
    expect(priceToY(150, domain, plot)).toBe(210)
  })
})

describe('formatPrice', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatPrice(30436.25)).toBe('30,436.25')
    expect(formatPrice(30000)).toBe('30,000.00')
  })
})
