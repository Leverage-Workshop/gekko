import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  ABSORPTION_DELTA_THRESHOLD,
  MAX_STACK_BINS,
  MIN_QUALIFYING_FRAC,
  MIN_STACK_BINS,
  detectAbsorptionStacks,
  scanAbsorption,
} from './absorption'
import type { DeltaProfileRow } from './absorption'
import { parseDeltaProfile } from './parseProfile'

const STEP = 2.25

/** Price-descending rows from a top price and a delta per bin. */
function mkRows(deltas: number[], top = 30000): DeltaProfileRow[] {
  return deltas.map((delta, i) => ({ price: top - i * STEP, delta }))
}

const T = ABSORPTION_DELTA_THRESHOLD

describe('detectAbsorptionStacks', () => {
  it('characterizes the real exports at doctrine thresholds: one full-rotation buy stack', () => {
    const load = (name: string) =>
      parseDeltaProfile(readFileSync(join(process.cwd(), 'chart-data', name), 'utf-8')).rows
    expect(detectAbsorptionStacks(load('half-rotation-delta.vbp.md'), 'half-rotation')).toEqual([])
    // 3 strong buy bins over a 4-bin span (0.75 ≥ 0.7) — visible only since the
    // qualifying fraction was loosened to let one weak interior bin through.
    expect(detectAbsorptionStacks(load('full-rotation-delta.vbp.md'), 'full-rotation')).toEqual([
      {
        source: 'full-rotation',
        side: 'buy',
        top: 29830.5,
        bottom: 29823.75,
        binCount: 4,
        qualifyingCount: 3,
        peakAbsDelta: 125,
        netDelta: 231,
      },
    ])
  })

  it('emits a buy stack of exactly MIN_STACK_BINS bins at exactly the threshold', () => {
    const rows = mkRows([0, ...Array(MIN_STACK_BINS).fill(T), 0])
    expect(detectAbsorptionStacks(rows, 'half-rotation')).toEqual([
      {
        source: 'half-rotation',
        side: 'buy',
        top: 30000 - STEP,
        bottom: 30000 - MIN_STACK_BINS * STEP,
        binCount: MIN_STACK_BINS,
        qualifyingCount: MIN_STACK_BINS,
        peakAbsDelta: T,
        netDelta: T * MIN_STACK_BINS,
      },
    ])
  })

  it('emits a sell stack for negative deltas', () => {
    const rows = mkRows([-T - 10, -T, -T - 30])
    const [stack] = detectAbsorptionStacks(rows, 'full-rotation')
    expect(stack.side).toBe('sell')
    expect(stack.peakAbsDelta).toBe(T + 30)
    expect(stack.netDelta).toBe(-(3 * T + 40))
  })

  it('rejects one bin fewer than MIN_STACK_BINS and one unit under the threshold', () => {
    expect(
      detectAbsorptionStacks(mkRows(Array(MIN_STACK_BINS - 1).fill(T)), 'half-rotation'),
    ).toEqual([])
    expect(
      detectAbsorptionStacks(mkRows(Array(MIN_STACK_BINS).fill(T - 1)), 'half-rotation'),
    ).toEqual([])
  })

  it('tolerates an interior gap bin at the qualifying ratio (4 of 5)', () => {
    const rows = mkRows([T + 20, T, 5, T + 5, T])
    expect(detectAbsorptionStacks(rows, 'half-rotation')).toEqual([
      {
        source: 'half-rotation',
        side: 'buy',
        top: 30000,
        bottom: 30000 - 4 * STEP,
        binCount: 5,
        qualifyingCount: 4,
        peakAbsDelta: T + 20,
        netDelta: 4 * T + 30,
      },
    ])
  })

  it('tolerates an interior gap bin at 3 of 4 (operator doctrine, 2026-07-18)', () => {
    expect(3 / 4).toBeGreaterThanOrEqual(MIN_QUALIFYING_FRAC)
    const rows = mkRows([T, T, 10, T])
    expect(detectAbsorptionStacks(rows, 'half-rotation')).toEqual([
      {
        source: 'half-rotation',
        side: 'buy',
        top: 30000,
        bottom: 30000 - 3 * STEP,
        binCount: 4,
        qualifyingCount: 3,
        peakAbsDelta: T,
        netDelta: 3 * T + 10,
      },
    ])
  })

  it('rejects a window whose qualifying ratio falls below MIN_QUALIFYING_FRAC', () => {
    // 3 qualifying over a 5-bin span = 0.6 < 0.7; the leading pair alone is
    // under MIN_STACK_BINS, so nothing is emitted.
    expect(3 / 5).toBeLessThan(MIN_QUALIFYING_FRAC)
    const rows = mkRows([T, T, 10, 10, T])
    expect(detectAbsorptionStacks(rows, 'half-rotation')).toEqual([])
  })

  it('ends stacks on qualifying bins — trailing gap bins are trimmed', () => {
    const rows = mkRows([T, T, T, 10, 5])
    const [stack] = detectAbsorptionStacks(rows, 'half-rotation')
    expect(stack.binCount).toBe(3)
    expect(stack.bottom).toBe(30000 - 2 * STEP)
  })

  it('hard-breaks on a strong opposite-sign bin, splitting two stacks around it', () => {
    const rows = mkRows([T, T, T, -T - 10, T, T, T])
    const stacks = detectAbsorptionStacks(rows, 'half-rotation')
    expect(stacks).toHaveLength(2)
    expect(stacks.map(s => s.side)).toEqual(['buy', 'buy'])
    expect(stacks[0].bottom).toBe(30000 - 2 * STEP)
    expect(stacks[1].top).toBe(30000 - 4 * STEP)
  })

  it('emits adjacent buy and sell stacks independently', () => {
    const rows = mkRows([T, T, T, -T, -T, -T])
    const stacks = detectAbsorptionStacks(rows, 'half-rotation')
    expect(stacks.map(s => s.side)).toEqual(['buy', 'sell'])
  })

  it('caps a long region at MAX_STACK_BINS and resumes after it', () => {
    const rows = mkRows(Array(MAX_STACK_BINS + MIN_STACK_BINS).fill(T))
    const stacks = detectAbsorptionStacks(rows, 'half-rotation')
    expect(stacks).toHaveLength(2)
    expect(stacks[0].binCount).toBe(MAX_STACK_BINS)
    expect(stacks[1].binCount).toBe(MIN_STACK_BINS)
    expect(stacks[1].top).toBe(30000 - MAX_STACK_BINS * STEP)
  })

  it('honors param overrides', () => {
    const rows = mkRows([30, 30, 30, 30])
    expect(detectAbsorptionStacks(rows, 'half-rotation')).toEqual([])
    const loose = detectAbsorptionStacks(rows, 'half-rotation', {
      deltaThreshold: 30,
      maxStackBins: 4,
    })
    expect(loose).toHaveLength(1)
    expect(loose[0].binCount).toBe(4)
  })
})

describe('scanAbsorption', () => {
  it('merges both sources price-descending by stack top, labeled by source', () => {
    const result = scanAbsorption({
      halfRotation: mkRows([T, T, T], 30100),
      fullRotation: mkRows([-T, -T, -T], 30000),
    })
    expect(result.candidates.map(c => [c.source, c.top, c.side])).toEqual([
      ['half-rotation', 30100, 'buy'],
      ['full-rotation', 30000, 'sell'],
    ])
  })

  it('surfaces the full-rotation buy stack from the real exports at doctrine thresholds', () => {
    const load = (name: string) =>
      parseDeltaProfile(readFileSync(join(process.cwd(), 'chart-data', name), 'utf-8')).rows
    const result = scanAbsorption({
      halfRotation: load('half-rotation-delta.vbp.md'),
      fullRotation: load('full-rotation-delta.vbp.md'),
    })
    expect(result.candidates.map(c => [c.source, c.top, c.side])).toEqual([
      ['full-rotation', 29830.5, 'buy'],
    ])
  })
})
