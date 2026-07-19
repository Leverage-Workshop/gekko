import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { parseExecBarsFromFile } from './parseExecBars'
import type { ExecBar } from './parseExecBars'
import { computeDeltaTelemetry } from './deltaTelemetry'

const FIXTURE = join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv')

// Minimal ExecBar factory for synthetic, branch-targeting tests.
function bar(deltaIntensity: number, legVWAP = 0, close = 100): ExecBar {
  return {
    dateTime: new Date('2026-06-16 09:31:47'),
    open: close,
    high: close,
    low: close,
    close,
    legVWAP,
    deltaIntensity,
  }
}

describe('computeDeltaTelemetry — fixture', () => {
  const bars = parseExecBarsFromFile(FIXTURE)

  it('analyzes all 250 bars with the default recent window', () => {
    const t = computeDeltaTelemetry(bars)
    expect(t.barCount).toBe(250)
    expect(t.recentWindow).toBe(20)
  })

  it('counts ±3 / ±4 extremes over the whole series', () => {
    const t = computeDeltaTelemetry(bars)
    expect(t.extremes.posStrong).toBe(17)
    expect(t.extremes.posExtreme).toBe(17)
    expect(t.extremes.negStrong).toBe(25)
    expect(t.extremes.negExtreme).toBe(3)
  })

  it('reports the most recent extreme reading', () => {
    const t = computeDeltaTelemetry(bars)
    expect(t.extremes.lastExtreme).toBe(3)
  })

  it('counts red-extreme prints within the recent window', () => {
    // The last 20 fixture deltas hold no <= -3 readings (blue tape into the
    // close); the counting behavior itself is covered synthetically below.
    const t = computeDeltaTelemetry(bars)
    expect(t.recentRedExtremeCount).toBe(0)
    expect(t.recentBlueExtremeCount).toBe(10)
  })

  it('positions the last close within the recent bar range', () => {
    // Blue tape into the close: the last close sits at the top of the window.
    const t = computeDeltaTelemetry(bars)
    expect(t.recentRange).toEqual({
      high: 29949,
      low: 29817.5,
      lastClose: 29945.75,
      position: 0.98,
    })
  })

  it('locates the latest Leg VWAP and prices the last close above it', () => {
    const t = computeDeltaTelemetry(bars)
    expect(t.legVwap.value).toBe(29901.54)
    expect(t.legVwap.close).toBe(29945.75)
    expect(t.legVwap.position).toBe('above')
    expect(t.legVwap.distance).toBeCloseTo(44.21, 2)
  })

  it('produces sign / trend values within their unions', () => {
    const t = computeDeltaTelemetry(bars)
    expect(['positive', 'negative', 'neutral']).toContain(t.sign)
    expect(['rising', 'falling', 'flat']).toContain(t.recentTrend)
  })
})

describe('computeDeltaTelemetry — synthetic', () => {
  it('throws on empty input', () => {
    expect(() => computeDeltaTelemetry([])).toThrow('no bars')
  })

  it('counts red extremes at exactly the boundary, scoped to the recent window', () => {
    // -3 counts, -2.99 does not; extremes older than the recent window are ignored.
    const inWindow = computeDeltaTelemetry([bar(-3), bar(-2.99), bar(-4), bar(0)])
    expect(inWindow.recentRedExtremeCount).toBe(2)

    const oldExtremes = [bar(-4), bar(-4), bar(-4), bar(0), bar(0)]
    const t = computeDeltaTelemetry(oldExtremes, { recentWindow: 2 })
    expect(t.recentRedExtremeCount).toBe(0)
  })

  it('treats all-zero legVWAP (pre-leg) as unknown position', () => {
    const t = computeDeltaTelemetry([bar(1), bar(2), bar(-1)])
    expect(t.legVwap.value).toBeNull()
    expect(t.legVwap.distance).toBeNull()
    expect(t.legVwap.position).toBe('unknown')
  })

  it('detects a rising delta trend', () => {
    const bars = [-4, -3, -2, -1, 1, 2, 3, 4].map(d => bar(d))
    const t = computeDeltaTelemetry(bars)
    expect(t.recentTrend).toBe('rising')
    expect(t.sign).toBe('neutral') // symmetric window means ~0
  })

  it('detects a falling delta trend with negative sign', () => {
    const bars = [4, 3, 2, -2, -3, -4].map(d => bar(d))
    const t = computeDeltaTelemetry(bars)
    expect(t.recentTrend).toBe('falling')
    expect(t.sign).toBe('neutral')
  })

  it('reports positive sign when recent delta is consistently positive', () => {
    const t = computeDeltaTelemetry([3, 4, 3, 4].map(d => bar(d)))
    expect(t.sign).toBe('positive')
  })

  it('clamps recentWindow to the number of bars', () => {
    const t = computeDeltaTelemetry([bar(1), bar(2)], { recentWindow: 50 })
    expect(t.recentWindow).toBe(2)
    expect(t.barCount).toBe(2)
  })

  it('prices the close above the leg when applicable', () => {
    const t = computeDeltaTelemetry([bar(1, 0, 100), bar(2, 95, 110)])
    expect(t.legVwap.value).toBe(95)
    expect(t.legVwap.position).toBe('above')
    expect(t.legVwap.distance).toBe(15)
  })

  it('counts blue extremes at exactly the boundary, scoped to the recent window', () => {
    const inWindow = computeDeltaTelemetry([bar(3), bar(2.99), bar(4), bar(0)])
    expect(inWindow.recentBlueExtremeCount).toBe(2)

    const t = computeDeltaTelemetry([bar(4), bar(4), bar(0), bar(0)], { recentWindow: 2 })
    expect(t.recentBlueExtremeCount).toBe(0)
  })

  it('reads an absorbed red flush as a high range position despite the red mean', () => {
    // Flush: red extremes drive lows to 90; recovery: closes claw back to 98.
    // The window MEAN stays negative — but position shows the flush failed.
    const flush = [
      { ...bar(-1, 0, 100), high: 101, low: 99 },
      { ...bar(-4, 0, 93), high: 100, low: 92 },
      { ...bar(-3, 0, 91), high: 94, low: 90 },
      { ...bar(-1, 0, 92), high: 93, low: 90.5 },
      { ...bar(2, 0, 95), high: 96, low: 91.5 },
      { ...bar(2, 0, 98), high: 99, low: 94.5 },
    ]
    const t = computeDeltaTelemetry(flush)
    expect(t.sign).toBe('negative')
    expect(t.recentRedExtremeCount).toBe(2)
    expect(t.recentRange.high).toBe(101)
    expect(t.recentRange.low).toBe(90)
    // (98 - 90) / (101 - 90) ≈ 0.73 — upper half: the selling was absorbed.
    expect(t.recentRange.position).toBe(0.73)
  })

  it('returns a null range position when the window never moved a tick', () => {
    const t = computeDeltaTelemetry([bar(1, 0, 100), bar(-1, 0, 100)])
    expect(t.recentRange.position).toBeNull()
  })
})
