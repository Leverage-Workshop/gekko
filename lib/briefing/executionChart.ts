import type { LevelKind, Terrain } from '@/knowledge/schema/briefing.schema'
import type { ExecBar } from '@/lib/engine/parseExecBars'

/**
 * Execution-chart model: turns the latest bundle's 750-volume execution bars
 * plus the briefing terrain into the plain-serializable model the client
 * lightweight-charts component paints — candles, level price-lines, and the
 * autoscale price range. Pure and unit-testable offline; no chart-library
 * imports here so the module stays node-safe.
 */

export interface ChartCandle {
  /** UTC-epoch seconds carrying the CSV wall-clock time (see wallClockUtcSeconds). */
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type PriceLineStyle = 'solid' | 'dashed' | 'dotted'

export interface ChartPriceLine {
  price: number
  title: string
  color: string
  lineStyle: PriceLineStyle
  kind: LevelKind | 'current'
}

export interface ExecutionChartModel {
  candles: ChartCandle[]
  priceLines: ChartPriceLine[]
  /** Autoscale bounds: candle extremes extended to cover every plotted line. */
  priceRange: { min: number; max: number }
  /** Valid levels too far from the traded range to plot without crushing the candles. */
  offMapLevels: { price: number; label: string; kind: LevelKind }[]
}

/**
 * Per-kind price-line styling. Trench uses electric-blue (the DESIGN.md
 * data-visualization reserve) so the bmw-blue current-price line stays unique.
 */
export const CHART_LEVEL_STYLES: Record<
  LevelKind,
  { color: string; lineStyle: PriceLineStyle }
> = {
  trench: { color: '#0653b6', lineStyle: 'dashed' },
  wall: { color: '#ffffff', lineStyle: 'solid' },
  magnet: { color: '#f4b400', lineStyle: 'dotted' },
  mgi: { color: '#7e7e7e', lineStyle: 'dashed' },
}

export const CURRENT_PRICE_STYLE = { color: '#1c69d4', lineStyle: 'solid' as const }

/** Gem terrain zone colors (Stratosphere→Abyss) for the zones strip. */
export const ZONE_FILLS: Record<string, string> = {
  blue: '#1c69d4',
  red: '#e22718',
  green: '#0fa336',
  pink: '#e0529e',
  purple: '#8b5cf6',
}

export const DEFAULT_ZONE_FILL = '#7e7e7e'

/**
 * Levels beyond this fraction of the bar range past the candle extremes are
 * listed off-map instead of plotted, so a far-away campaign border can't
 * flatten the candles.
 */
const LEVEL_WINDOW_FACTOR = 0.35

/**
 * Sierra exports bar DateTimes as timezone-less wall-clock strings that
 * parseExecBars reads as server-local Dates. lightweight-charts renders
 * timestamps in UTC, so re-anchor the wall-clock fields onto UTC to make the
 * axis show the same clock time as the CSV regardless of server timezone.
 */
export function wallClockUtcSeconds(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 1000)
}

export function buildExecutionChart(
  bars: ExecBar[],
  terrain: Terrain,
  currentPrice: number | null,
): ExecutionChartModel | null {
  if (bars.length === 0) return null

  // Ascending, time-deduped candles (later rows win): the chart library
  // requires strictly increasing unique times.
  const byTime = new Map<number, ChartCandle>()
  const sorted = [...bars].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
  for (const bar of sorted) {
    const time = wallClockUtcSeconds(bar.dateTime)
    byTime.set(time, {
      time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })
  }
  const candles = [...byTime.values()]

  const barLow = Math.min(...candles.map((c) => c.low))
  const barHigh = Math.max(...candles.map((c) => c.high))
  const pad = Math.max((barHigh - barLow) * LEVEL_WINDOW_FACTOR, 1)
  const windowMin = barLow - pad
  const windowMax = barHigh + pad

  // Placeholder levels (e.g. "overnight high unavailable" exported as 0) must
  // never reach the chart — they'd stretch the price scale to nonsense.
  const validLevels = terrain.levels.filter(
    (level) => Number.isFinite(level.price) && level.price > 0,
  )
  const onMap = validLevels.filter(
    (level) => level.price >= windowMin && level.price <= windowMax,
  )
  const offMapLevels = validLevels
    .filter((level) => level.price < windowMin || level.price > windowMax)
    .map(({ price, label, kind }) => ({ price, label, kind }))
    .sort((a, b) => b.price - a.price)

  const priceLines: ChartPriceLine[] = onMap.map((level) => ({
    price: level.price,
    title: level.label,
    kind: level.kind,
    ...CHART_LEVEL_STYLES[level.kind],
  }))

  if (
    currentPrice !== null &&
    Number.isFinite(currentPrice) &&
    currentPrice >= windowMin &&
    currentPrice <= windowMax
  ) {
    priceLines.push({
      price: currentPrice,
      title: 'CURRENT',
      kind: 'current',
      ...CURRENT_PRICE_STYLE,
    })
  }

  const linePrices = priceLines.map((line) => line.price)
  return {
    candles,
    priceLines,
    priceRange: {
      min: Math.min(barLow, ...linePrices),
      max: Math.max(barHigh, ...linePrices),
    },
    offMapLevels,
  }
}
