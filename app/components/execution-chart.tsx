'use client'

import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts'
import type {
  ExecutionChartModel,
  PriceLineStyle,
} from '@/lib/briefing/executionChart'

/**
 * Execution candlestick chart (lightweight-charts v5): paints the
 * plain-serializable model computed server-side by
 * lib/briefing/executionChart.ts — 750-volume candles plus terrain-level
 * price lines. All data decisions live in the lib module; this component
 * only owns chart-library lifecycle.
 */

const LINE_STYLES: Record<PriceLineStyle, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.SparseDotted,
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
      upColor: '#0fa336',
      downColor: '#e22718',
      wickUpColor: '#0fa336',
      wickDownColor: '#e22718',
      borderVisible: false,
      // Stretch autoscale so every plotted level line stays on screen even
      // when it sits outside the candles' own high/low range.
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

    for (const line of model.priceLines) {
      series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: LINE_STYLES[line.lineStyle],
        axisLabelVisible: true,
        title: line.title,
      })
    }

    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [model])

  return <div ref={containerRef} className="h-[480px] w-full" />
}
