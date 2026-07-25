import { describe, expect, it } from 'vitest'
import type { AbsorptionCandidate } from './absorption'
import type { ExecBar } from './parseExecBars'
import {
  MIN_STALL_BARS,
  STALL_MAX_PROGRESS_PTS,
  confirmStall,
  confirmStalls,
} from './stallConfirmation'

function candidate(overrides: Partial<AbsorptionCandidate> = {}): AbsorptionCandidate {
  return {
    source: 'full-rotation',
    side: 'sell',
    top: 29900,
    bottom: 29896,
    binCount: 3,
    qualifyingCount: 3,
    peakAbsDelta: 120,
    netDelta: -300,
    ...overrides,
  }
}

function bar(low: number, high: number, close: number): ExecBar {
  return {
    dateTime: new Date('2026-07-09T15:00:00Z'),
    open: close,
    high,
    low,
    close,
    legVWAP: 0,
    deltaIntensity: 0,
    volume: 750,
    bidVolume: 400,
    askVolume: 350,
    numberOfTrades: 300,
    delta: -50,
  }
}

describe('confirmStall', () => {
  it('confirms a stall: enough consecutive bars at the stack with no net progress', () => {
    const bars = [
      bar(29950, 29960, 29955), // away from the stack
      bar(29895, 29901, 29898),
      bar(29896, 29902, 29899),
      bar(29894, 29900, 29897),
      bar(29896, 29901, 29898),
    ]
    const stall = confirmStall(candidate(), bars)
    expect(stall.confirmed).toBe(true)
    expect(stall.barsAtStack).toBe(4)
    expect(stall.volumeAtStack).toBe(3000)
    expect(stall.tradesAtStack).toBe(1200)
    expect(stall.netProgressPts).toBe(0)
  })

  it('does not confirm when price traversed the stack with real progress', () => {
    // Three bars sweep through the 29896–29900 stack while price falls 12 pts.
    const bars = [
      bar(29901, 29908, 29903),
      bar(29896, 29903, 29898),
      bar(29889, 29897, 29891),
    ]
    const stall = confirmStall(candidate(), bars)
    expect(stall.barsAtStack).toBe(3)
    expect(Math.abs(stall.netProgressPts)).toBeGreaterThan(STALL_MAX_PROGRESS_PTS)
    expect(stall.confirmed).toBe(false)
  })

  it('does not confirm on fewer than the minimum bars', () => {
    const bars = [bar(29896, 29901, 29898), bar(29950, 29960, 29955)]
    const stall = confirmStall(candidate(), bars)
    expect(stall.barsAtStack).toBeLessThan(MIN_STALL_BARS)
    expect(stall.confirmed).toBe(false)
  })

  it('reports zero contact when the rolling window never visited the stack', () => {
    const bars = [bar(30100, 30110, 30105), bar(30105, 30115, 30110)]
    const stall = confirmStall(candidate(), bars)
    expect(stall).toEqual({
      barsAtStack: 0,
      volumeAtStack: 0,
      tradesAtStack: 0,
      netProgressPts: 0,
      confirmed: false,
    })
  })

  it('uses the longest consecutive run, not total touches', () => {
    const bars = [
      bar(29896, 29901, 29898), // run of 1
      bar(29950, 29960, 29955), // breaks the run
      bar(29895, 29901, 29898),
      bar(29896, 29902, 29899),
      bar(29894, 29900, 29897), // run of 3
    ]
    const stall = confirmStall(candidate(), bars)
    expect(stall.barsAtStack).toBe(3)
    expect(stall.confirmed).toBe(true)
  })

  it('tolerates a tall stack chopping within its own height', () => {
    const tall = candidate({ top: 29910, bottom: 29896 }) // 14-pt stack
    const bars = [
      bar(29896, 29906, 29897),
      bar(29898, 29908, 29906),
      bar(29900, 29910, 29905),
    ]
    const stall = confirmStall(tall, bars)
    expect(stall.netProgressPts).toBe(8) // > STALL_MAX_PROGRESS_PTS, < stack height
    expect(stall.confirmed).toBe(true)
  })
})

describe('confirmStalls', () => {
  it('annotates every candidate in the scan', () => {
    const scan = { candidates: [candidate(), candidate({ top: 30110, bottom: 30106, side: 'buy' as const })] }
    const bars = [bar(29895, 29901, 29898), bar(29896, 29902, 29899), bar(29894, 29900, 29897)]
    const result = confirmStalls(scan, bars)
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].stall.confirmed).toBe(true)
    expect(result.candidates[1].stall.barsAtStack).toBe(0)
  })
})
