import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { parseExecBarsFromFile, parseExecBars } from './parseExecBars'

const FIXTURE = join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv')

describe('parseExecBars', () => {
  it('parses all 250 data rows', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    expect(bars).toHaveLength(250)
  })

  it('first row matches expected values', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    const first = bars[0]
    expect(first.dateTime).toEqual(new Date('2026-07-09 10:58:48'))
    expect(first.open).toBe(29891.18)
    expect(first.high).toBe(29898.75)
    expect(first.low).toBe(29883.5)
    expect(first.close).toBe(29893.81)
    expect(first.legVWAP).toBe(0.0)
    expect(first.deltaIntensity).toBe(-1.0)
    expect(first.volume).toBe(750)
    expect(first.bidVolume).toBe(440)
    expect(first.askVolume).toBe(310)
    expect(first.numberOfTrades).toBe(319)
    expect(first.delta).toBe(-130)
  })

  it('last row matches expected values', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    const last = bars[bars.length - 1]
    expect(last.dateTime).toEqual(new Date('2026-07-09 21:52:00'))
    expect(last.open).toBe(29920.04)
    expect(last.high).toBe(29949.0)
    expect(last.low).toBe(29920.04)
    expect(last.close).toBe(29945.75)
    expect(last.legVWAP).toBe(29901.54)
    expect(last.deltaIntensity).toBe(3.0)
    // The in-progress volume bar: a partial fill under the 750/bar target.
    expect(last.volume).toBe(320)
    expect(last.delta).toBe(last.askVolume - last.bidVolume)
  })

  it('rows are in ascending time order', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].dateTime.getTime()).toBeGreaterThanOrEqual(bars[i - 1].dateTime.getTime())
    }
  })

  it('tolerates zero LegVWAP (pre-leg rows)', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    const preLeg = bars.filter(b => b.legVWAP === 0)
    expect(preLeg.length).toBeGreaterThan(0)
  })

  it('throws on header mismatch', () => {
    const bad = 'DateTime,Open,High,Low,Close,BadCol,DeltaIntensity\n2026-06-16 09:31:47,1,2,3,4,5,6'
    expect(() => parseExecBars(bad)).toThrow('Header mismatch')
  })

  it('rejects the pre-feat-047 header (study must be rebuilt in lockstep)', () => {
    const old =
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity\n2026-06-16 09:31:47,1,2,3,4,5,6'
    expect(() => parseExecBars(old)).toThrow('Header mismatch')
  })

  it('computes delta as AskVolume minus BidVolume', () => {
    const csv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity,Volume,BidVolume,AskVolume,NumberOfTrades',
      '2026-06-16 09:31:47,1,2,0.5,1.5,0,1,750,300,450,400',
    ].join('\n')
    const [bar] = parseExecBars(csv)
    expect(bar.delta).toBe(150)
    expect(bar.volume).toBe(750)
    expect(bar.numberOfTrades).toBe(400)
  })
})
