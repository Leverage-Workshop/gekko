import type { Objective } from '@/knowledge/schema/briefing.schema'
import type { ExecBar } from '@/lib/engine/parseExecBars'

/**
 * Execution-chart model: turns the latest bundle's 750-volume execution bars
 * plus the briefing objectives into the plain-serializable model the client
 * lightweight-charts component paints — candles and one shaded entry zone per
 * objective entry (blue = long, red = short, spanning entry → stop). Pure and
 * unit-testable offline; no chart-library imports here so the module stays
 * node-safe.
 */

export interface ChartCandle {
  /** UTC-epoch seconds carrying the CSV wall-clock time (see wallClockUtcSeconds). */
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface ChartEntryZone {
  /** Lower price bound of the shaded band. */
  from: number
  /** Upper price bound of the shaded band. */
  to: number
  /** The entry level itself — drawn as the band's solid edge. */
  entry: number
  direction: 'long' | 'short'
  label: string
}

export interface ExecutionChartModel {
  candles: ChartCandle[]
  zones: ChartEntryZone[]
  /** Autoscale bounds: candle extremes extended to cover every zone. */
  priceRange: { min: number; max: number }
}

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
 * Entry zones beyond this fraction of the bar range past the candle extremes
 * are dropped, so a far-away objective can't flatten the candles.
 */
const ZONE_WINDOW_FACTOR = 0.35

/**
 * Sierra exports bar DateTimes as timezone-less Chicago wall-clock strings
 * that parseExecBars reads as server-local Dates. lightweight-charts renders
 * timestamps in UTC, so re-anchor the wall-clock fields onto UTC to make the
 * axis show the same (Chicago) clock time as the CSV regardless of server
 * timezone.
 */
export function wallClockUtcSeconds(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 1000)
}

function validPrice(price: number | undefined | null): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
}

export function buildExecutionChart(
  bars: ExecBar[],
  objectives: Objective[],
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
  const pad = Math.max((barHigh - barLow) * ZONE_WINDOW_FACTOR, 1)
  const windowMin = barLow - pad
  const windowMax = barHigh + pad

  const zones: ChartEntryZone[] = []
  for (const objective of objectives) {
    const stop = objective.stops.map((s) => s.price).find(validPrice)
    for (const entry of objective.entries) {
      if (!validPrice(entry.price)) continue
      // The zone spans entry → stop (the risk side of the trade); without a
      // stop, fall back to a thin band around the entry.
      const fallback = Math.max((barHigh - barLow) * 0.02, 1)
      const other = stop ?? entry.price + (objective.direction === 'long' ? -fallback : fallback)
      const from = Math.min(entry.price, other)
      const to = Math.max(entry.price, other)
      // Skip zones entirely outside the traded window.
      if (to < windowMin || from > windowMax) continue
      zones.push({
        from,
        to,
        entry: entry.price,
        direction: objective.direction,
        label: entry.label,
      })
    }
  }

  const zoneBounds = zones.flatMap((zone) => [zone.from, zone.to])
  return {
    candles,
    zones,
    priceRange: {
      min: Math.min(barLow, ...zoneBounds),
      max: Math.max(barHigh, ...zoneBounds),
    },
  }
}
