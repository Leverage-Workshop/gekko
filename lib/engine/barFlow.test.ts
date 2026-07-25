import { describe, expect, it } from 'vitest'
import { computeBarFlow, CLIMAX_DELTA_FRACTION, MIN_CLIMAX_VOLUME } from './barFlow'
import type { ExecBar } from './parseExecBars'

/** Enriched 750-volume bar; delta drives the bid/ask split. */
function bar(overrides: Partial<ExecBar> & { close: number; delta: number }): ExecBar {
  const volume = overrides.volume ?? 750
  const ask = Math.round((volume + overrides.delta) / 2)
  return {
    dateTime: new Date('2026-07-09T15:00:00Z'),
    open: overrides.close,
    high: overrides.close + 2,
    low: overrides.close - 2,
    legVWAP: 0,
    deltaIntensity: 0,
    volume,
    bidVolume: volume - ask,
    askVolume: ask,
    numberOfTrades: overrides.numberOfTrades ?? 300,
    ...overrides,
  }
}

describe('computeBarFlow', () => {
  it('throws on empty input', () => {
    expect(() => computeBarFlow([])).toThrow('no bars')
  })

  it('computes cumulative delta over the whole series and the recent window', () => {
    const bars = [
      bar({ close: 100, delta: 200 }),
      bar({ close: 101, delta: -50 }),
      bar({ close: 102, delta: 100 }),
    ]
    const flow = computeBarFlow(bars, { recentWindow: 2 })
    expect(flow.cumulativeDelta.total).toBe(250)
    expect(flow.recentNetDelta).toBe(50)
    expect(flow.cumulativeDelta.recentChange).toBe(50)
    expect(flow.cumulativeDelta.trend).toBe('flat') // within ±50 epsilon
    expect(flow.recentTotalVolume).toBe(1500)
  })

  it('classifies the cumulative-delta trend beyond the epsilon', () => {
    const rising = computeBarFlow([bar({ close: 100, delta: 200 }), bar({ close: 101, delta: 200 })])
    expect(rising.cumulativeDelta.trend).toBe('rising')
    const falling = computeBarFlow([bar({ close: 100, delta: -300 })])
    expect(falling.cumulativeDelta.trend).toBe('falling')
  })

  it('computes average trade size from volume and trade count', () => {
    const flow = computeBarFlow([bar({ close: 100, delta: 0, numberOfTrades: 250 })])
    expect(flow.recentAvgTradeSize).toBe(3)
    const none = computeBarFlow([bar({ close: 100, delta: 0, numberOfTrades: 0 })])
    expect(none.recentAvgTradeSize).toBeNull()
  })

  it('flags climax bars only at or above the volume floor', () => {
    const climaxDelta = Math.ceil(CLIMAX_DELTA_FRACTION * 750)
    const bars = [
      bar({ close: 100, delta: 0 }),
      bar({ close: 99, delta: -climaxDelta }), // sell climax
      bar({ close: 98, delta: -180, volume: MIN_CLIMAX_VOLUME - 100 }), // tiny partial: ignored
    ]
    const flow = computeBarFlow(bars)
    expect(flow.climax.count).toBe(1)
    expect(flow.climax.last).toEqual({ side: 'sell', price: 99 })
  })

  it('detects bearish divergence: fresh high the cumulative delta does not confirm', () => {
    // 9 prior bars build cum delta to +900 around 100; the fresh 3 print a new
    // high at 106 with cum delta collapsed well below the prior peak.
    const prior = Array.from({ length: 9 }, (_, i) => bar({ close: 100 + i * 0.1, delta: 100 }))
    const fresh = [
      bar({ close: 105, high: 106, low: 104, delta: -300 }),
      bar({ close: 105.5, high: 106.5, low: 104.5, delta: -300 }),
      bar({ close: 105, high: 107, low: 104, delta: -300 }),
    ]
    const flow = computeBarFlow([...prior, ...fresh], { recentWindow: 12 })
    expect(flow.divergence).toBe('bearish')
  })

  it('detects bullish divergence: fresh low with cumulative delta holding above its prior low', () => {
    const prior = Array.from({ length: 9 }, (_, i) => bar({ close: 100 - i * 0.1, delta: -100 }))
    const fresh = [
      bar({ close: 95, high: 96, low: 94, delta: 300 }),
      bar({ close: 94.5, high: 95.5, low: 93.5, delta: 300 }),
      bar({ close: 95, high: 96, low: 93, delta: 300 }),
    ]
    const flow = computeBarFlow([...prior, ...fresh], { recentWindow: 12 })
    expect(flow.divergence).toBe('bullish')
  })

  it('reports no divergence when the fresh extreme is delta-confirmed', () => {
    const prior = Array.from({ length: 9 }, (_, i) => bar({ close: 100 + i * 0.1, delta: 100 }))
    const fresh = [
      bar({ close: 105, high: 106, low: 104, delta: 200 }),
      bar({ close: 106, high: 107, low: 105, delta: 200 }),
      bar({ close: 107, high: 108, low: 106, delta: 200 }),
    ]
    const flow = computeBarFlow([...prior, ...fresh], { recentWindow: 12 })
    expect(flow.divergence).toBeNull()
  })
})
