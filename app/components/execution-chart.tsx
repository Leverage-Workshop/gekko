'use client'

import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type PrimitivePaneViewZOrder,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type {
  ChartEntryZone,
  ExecutionChartModel,
} from '@/lib/briefing/executionChart'

/**
 * Execution candlestick chart (lightweight-charts v5): paints the
 * plain-serializable model computed server-side by
 * lib/briefing/executionChart.ts — 750-volume candles in the theme voltage
 * (bmw-blue up / m-red down) plus one shaded band per objective entry zone.
 * All data decisions live in the lib module; this component only owns
 * chart-library lifecycle.
 */

const ZONE_COLORS = {
  long: { fill: 'rgba(28, 105, 212, 0.16)', edge: '#1c69d4' },
  short: { fill: 'rgba(226, 39, 24, 0.16)', edge: '#e22718' },
} as const

/** Draws the entry-zone bands behind the candles across the full pane width. */
class EntryZonesPrimitive implements ISeriesPrimitive<Time> {
  private readonly view: EntryZonesPaneView

  constructor(zones: ChartEntryZone[], series: ISeriesApi<'Candlestick'>) {
    this.view = new EntryZonesPaneView(zones, series)
  }

  paneViews(): IPrimitivePaneView[] {
    return [this.view]
  }
}

class EntryZonesPaneView implements IPrimitivePaneView {
  constructor(
    private readonly zones: ChartEntryZone[],
    private readonly series: ISeriesApi<'Candlestick'>,
  ) {}

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    const { zones, series } = this
    return {
      draw: (target) => {
        target.useBitmapCoordinateSpace((scope) => {
          for (const zone of zones) {
            const yTop = series.priceToCoordinate(zone.to)
            const yBottom = series.priceToCoordinate(zone.from)
            const yEntry = series.priceToCoordinate(zone.entry)
            if (yTop === null || yBottom === null || yEntry === null) continue

            const ratio = scope.verticalPixelRatio
            const colors = ZONE_COLORS[zone.direction]
            scope.context.fillStyle = colors.fill
            scope.context.fillRect(
              0,
              yTop * ratio,
              scope.bitmapSize.width,
              Math.max((yBottom - yTop) * ratio, 1),
            )
            // Solid edge on the entry level itself.
            scope.context.fillStyle = colors.edge
            scope.context.fillRect(
              0,
              yEntry * ratio - 1,
              scope.bitmapSize.width,
              Math.max(2 * ratio, 2),
            )
          }
        })
      },
    }
  }
}

export function ExecutionChart({ model }: { model: ExecutionChartModel }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#7e7e7e',
        fontFamily: 'var(--font-inter), sans-serif',
      },
      grid: {
        vertLines: { color: '#141414' },
        horzLines: { color: '#141414' },
      },
      rightPriceScale: { borderColor: '#3c3c3c' },
      timeScale: {
        borderColor: '#3c3c3c',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#1c69d4',
      downColor: '#e22718',
      wickUpColor: '#1c69d4',
      wickDownColor: '#e22718',
      borderVisible: false,
      // Stretch autoscale so every entry zone stays on screen even when it
      // sits outside the candles' own high/low range.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const base = original()
        if (!base?.priceRange) return base
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, model.priceRange.min),
            maxValue: Math.max(base.priceRange.maxValue, model.priceRange.max),
          },
        }
      },
    })

    series.setData(
      model.candles.map(
        (candle): CandlestickData => ({
          ...candle,
          time: candle.time as UTCTimestamp,
        }),
      ),
    )

    series.attachPrimitive(new EntryZonesPrimitive(model.zones, series))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [model])

  return <div ref={containerRef} className="h-[560px] w-full" />
}
