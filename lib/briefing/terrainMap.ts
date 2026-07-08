import type { LevelKind, Terrain } from '@/knowledge/schema/briefing.schema'

/**
 * Terrain zone-map geometry (feat-019).
 *
 * Turns a Briefing's `terrain` (contiguous Stratosphere→Abyss zones + level
 * overlay) plus the current price into a fully-computed SVG layout model:
 * price axis ticks, one rectangle per zone, one horizontal line per level, and
 * a current-price marker. The component that renders the SVG stays dumb — this
 * module is a pure function of the briefing JSON, so the geometry (including
 * the No-Gap invariant → touching rectangles) is unit-testable offline.
 */

export interface TerrainMapMargin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface TerrainMapOptions {
  width?: number
  height?: number
  /** left = price axis gutter, right = level-label gutter. */
  margin?: TerrainMapMargin
  /** Approximate number of price-axis ticks. */
  targetTicks?: number
}

export interface PlotArea {
  x: number
  y: number
  width: number
  height: number
}

export interface PriceDomain {
  /** Highest price on the map (plot top edge). */
  top: number
  /** Lowest price on the map (plot bottom edge). */
  bottom: number
}

export interface ZoneRect {
  x: number
  y: number
  width: number
  height: number
  fill: string
  fillOpacity: number
  label: string
  /** false when the zone is too thin to hold its label. */
  labelVisible: boolean
  labelX: number
  labelY: number
  topPrice: number
  bottomPrice: number
}

export interface LevelLine {
  price: number
  priceText: string
  label: string
  kind: LevelKind
  y: number
  x1: number
  x2: number
  color: string
  /** SVG stroke-dasharray ('' = solid). */
  dash: string
  labelX: number
  labelY: number
}

export interface AxisTick {
  price: number
  label: string
  y: number
}

export interface PriceMarker {
  price: number
  priceText: string
  y: number
  x1: number
  x2: number
  labelX: number
  labelY: number
}

export interface TerrainMapModel {
  width: number
  height: number
  plot: PlotArea
  domain: PriceDomain
  zones: ZoneRect[]
  levels: LevelLine[]
  ticks: AxisTick[]
  marker: PriceMarker | null
}

/**
 * Gem terrain colors (blue/red/green/pink/purple, Stratosphere→Abyss) mapped
 * onto the DESIGN.md-adjacent palette; rendered at low opacity over the black
 * canvas so the map reads as data, not brand voltage.
 */
export const ZONE_FILLS: Record<string, string> = {
  blue: '#1c69d4',
  red: '#e22718',
  green: '#0fa336',
  pink: '#e0529e',
  purple: '#8b5cf6',
}

export const DEFAULT_ZONE_FILL = '#7e7e7e'
export const ZONE_FILL_OPACITY = 0.16

/** Per-kind level-overlay styling (color + dash pattern). */
export const LEVEL_STYLES: Record<LevelKind, { color: string; dash: string }> = {
  trench: { color: '#1c69d4', dash: '6 4' },
  wall: { color: '#ffffff', dash: '' },
  magnet: { color: '#f4b400', dash: '2 4' },
  mgi: { color: '#7e7e7e', dash: '4 4' },
}

const DEFAULT_OPTIONS = {
  width: 960,
  height: 560,
  margin: { top: 20, right: 264, bottom: 20, left: 76 },
  targetTicks: 8,
} as const

/** Minimum zone height (px) that still shows its inline label. */
const MIN_LABEL_HEIGHT = 16

export function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Linear price→y mapping: domain.top ⇒ plot top edge, domain.bottom ⇒ plot bottom edge. */
export function priceToY(price: number, domain: PriceDomain, plot: PlotArea): number {
  const range = domain.top - domain.bottom
  return plot.y + ((domain.top - price) / range) * plot.height
}

/** Smallest "nice" step (1/2/2.5/5 × 10^n) giving at most `target` intervals. */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * magnitude
    if (step >= raw) return step
  }
  return 10 * magnitude
}

function buildTicks(domain: PriceDomain, plot: PlotArea, target: number): AxisTick[] {
  const range = domain.top - domain.bottom
  const step = niceStep(range, target)
  const first = Math.ceil(domain.bottom / step) * step
  const ticks: AxisTick[] = []
  for (let i = 0; ; i++) {
    // Multiply from the base each iteration (no += drift).
    const price = Math.round((first + i * step) * 100) / 100
    if (price > domain.top) break
    ticks.push({ price, label: formatPrice(price), y: priceToY(price, domain, plot) })
  }
  return ticks
}

/**
 * Build the zone-map layout model, or null when there is nothing to draw
 * (no zones, or a degenerate zero-height price range).
 */
export function buildTerrainMap(
  terrain: Terrain,
  currentPrice: number | null,
  options: TerrainMapOptions = {},
): TerrainMapModel | null {
  const width = options.width ?? DEFAULT_OPTIONS.width
  const height = options.height ?? DEFAULT_OPTIONS.height
  const margin = options.margin ?? DEFAULT_OPTIONS.margin
  const targetTicks = options.targetTicks ?? DEFAULT_OPTIONS.targetTicks

  const zones = [...terrain.zones].sort((a, b) => b.top - a.top)
  if (zones.length === 0) return null

  const prices: number[] = []
  for (const zone of zones) prices.push(zone.top, zone.bottom)
  for (const level of terrain.levels) prices.push(level.price)
  if (currentPrice !== null && Number.isFinite(currentPrice)) prices.push(currentPrice)

  const domain: PriceDomain = {
    top: Math.max(...prices),
    bottom: Math.min(...prices),
  }
  if (!(domain.top > domain.bottom)) return null

  const plot: PlotArea = {
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  }

  const zoneRects: ZoneRect[] = zones.map((zone) => {
    const yTop = priceToY(zone.top, domain, plot)
    const yBottom = priceToY(zone.bottom, domain, plot)
    const rectHeight = yBottom - yTop
    return {
      x: plot.x,
      y: yTop,
      width: plot.width,
      height: rectHeight,
      fill: ZONE_FILLS[zone.color] ?? DEFAULT_ZONE_FILL,
      fillOpacity: ZONE_FILL_OPACITY,
      label: zone.label,
      labelVisible: rectHeight >= MIN_LABEL_HEIGHT,
      labelX: plot.x + 12,
      labelY: yTop + rectHeight / 2 + 4,
      topPrice: zone.top,
      bottomPrice: zone.bottom,
    }
  })

  const levelLines: LevelLine[] = terrain.levels.map((level) => {
    const style = LEVEL_STYLES[level.kind]
    const y = priceToY(level.price, domain, plot)
    return {
      price: level.price,
      priceText: formatPrice(level.price),
      label: level.label,
      kind: level.kind,
      y,
      x1: plot.x,
      x2: plot.x + plot.width,
      color: style.color,
      dash: style.dash,
      labelX: plot.x + plot.width + 10,
      labelY: y + 4,
    }
  })

  const marker: PriceMarker | null =
    currentPrice !== null && Number.isFinite(currentPrice)
      ? {
          price: currentPrice,
          priceText: formatPrice(currentPrice),
          y: priceToY(currentPrice, domain, plot),
          x1: plot.x - 6,
          x2: plot.x + plot.width + 6,
          labelX: plot.x - 10,
          labelY: priceToY(currentPrice, domain, plot) + 4,
        }
      : null

  return {
    width,
    height,
    plot,
    domain,
    zones: zoneRects,
    levels: levelLines,
    ticks: buildTicks(domain, plot, targetTicks),
    marker,
  }
}
