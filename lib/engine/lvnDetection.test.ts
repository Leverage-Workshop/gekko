import { describe, it, expect } from 'vitest'
import { detectLvnHvn, DEFAULT_LVN_PARAMS } from './lvnDetection'
import type { PriceVolume } from './lvnDetection'

/**
 * Mechanics tests over SYNTHETIC profiles. Real-fixture precision/recall lives in the
 * eval harness (`npm run lvn:eval`); here we prove each detection mechanism fires (and
 * doesn't fire) on hand-built shapes. Most tests pass `smoothWindow: 1` to keep the
 * synthetic knees/troughs sharp — smoothing is exercised implicitly by the fixtures.
 */

// Build an ascending-price series from a volume array (price step = 1).
function series(vols: number[], startPrice = 30000): PriceVolume[] {
  return vols.map((v, i) => ({ price: startPrice + i, volume: v }))
}

const RAW = { smoothWindow: 1 } // no smoothing — preserve exact synthetic shape

describe('detectLvnHvn — HVN peaks', () => {
  it('finds a single peak in a triangular hill and no valley', () => {
    const s = series([1, 4, 10, 20, 35, 50, 35, 20, 10, 4, 1])
    const r = detectLvnHvn(s, RAW)
    expect(r.hvn).toHaveLength(1)
    expect(r.hvn[0].price).toBe(30005) // apex
    expect(r.lvn).toHaveLength(0)
  })

  it('finds two peaks and one valley in a double distribution', () => {
    const s = series([2, 10, 30, 50, 30, 10, 5, 4, 5, 10, 30, 50, 30, 10, 3])
    const r = detectLvnHvn(s, RAW)
    expect(r.hvn).toHaveLength(2)
    expect(r.hvn.map(n => n.price).sort()).toEqual([30003, 30011])
    expect(r.lvn).toHaveLength(1)
    expect(r.lvn[0].type).toBe('valley')
    expect(r.lvn[0].price).toBe(30007) // trough
  })
})

describe('detectLvnHvn — degenerate / robustness', () => {
  it('returns empty for a flat profile (no prominence anywhere)', () => {
    const r = detectLvnHvn(series(new Array(20).fill(50)))
    expect(r.hvn).toHaveLength(0)
    expect(r.lvn).toHaveLength(0)
  })

  it('returns empty for a series shorter than 3 bins', () => {
    const r = detectLvnHvn([
      { price: 30000, volume: 5 },
      { price: 30001, volume: 9 },
    ])
    expect(r.hvn).toHaveLength(0)
    expect(r.lvn).toHaveLength(0)
    expect(r.peakVolume).toBe(0)
  })

  it('ignores low-prominence noise wiggles on the shoulders of a hump', () => {
    const s = series([1, 3, 3, 2, 4, 10, 30, 60, 30, 10, 4, 2, 3, 3, 1])
    const r = detectLvnHvn(s, RAW)
    expect(r.hvn).toHaveLength(1)
    expect(r.hvn[0].price).toBe(30007)
    // The little idx3 dip (2 between 3 and 4) is below the depth threshold — no valley node.
    expect(r.lvn.filter(n => n.type === 'valley')).toHaveLength(0)
  })

  it('does not mutate the input series', () => {
    const s = series([2, 10, 30, 50, 30, 10, 3])
    const snapshot = JSON.stringify(s)
    detectLvnHvn(s, RAW)
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('detectLvnHvn — taper-edge LVNs', () => {
  it('detects the knee where a distribution tapers into a low plateau', () => {
    // Sharp distribution (peak 60) dropping off a cliff into a sustained low plateau of 3s.
    const s = series([2, 5, 12, 30, 50, 60, 50, 35, 3, 3, 3, 3, 3, 3, 3, 3])
    const r = detectLvnHvn(s, RAW)
    const taper = r.lvn.filter(n => n.type === 'taper-edge')
    expect(taper.length).toBeGreaterThanOrEqual(1)
    // The knee sits at the plateau boundary next to the distribution shoulder (price 30008).
    expect(taper.some(n => Math.abs(n.price - 30008) <= 1)).toBe(true)
  })

  it('does not flag a taper edge when there is no sustained plateau', () => {
    // Symmetric hill — volume never settles into a flat low run.
    const s = series([2, 8, 20, 40, 60, 40, 20, 8, 2])
    const r = detectLvnHvn(s, RAW)
    expect(r.lvn.filter(n => n.type === 'taper-edge')).toHaveLength(0)
  })
})

describe('detectLvnHvn — output shape', () => {
  it('returns nodes in descending price order and reports peak volume', () => {
    const s = series([2, 10, 30, 50, 30, 10, 5, 4, 5, 10, 30, 50, 30, 10, 3])
    const r = detectLvnHvn(s, RAW)
    const hvnPrices = r.hvn.map(n => n.price)
    const lvnPrices = r.lvn.map(n => n.price)
    expect(hvnPrices).toEqual([...hvnPrices].sort((a, b) => b - a))
    expect(lvnPrices).toEqual([...lvnPrices].sort((a, b) => b - a))
    expect(r.peakVolume).toBe(50)
  })

  it('ships tuned default params (feat-034)', () => {
    expect(DEFAULT_LVN_PARAMS.smoothWindow).toBe(11)
    expect(DEFAULT_LVN_PARAMS.peakProminenceFrac).toBeGreaterThan(0)
    expect(DEFAULT_LVN_PARAMS.valleyDepthFrac).toBeGreaterThan(0)
  })
})
