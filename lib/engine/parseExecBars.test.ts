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
    expect(first.dateTime).toEqual(new Date('2026-06-16 09:31:47'))
    expect(first.open).toBe(30637.55)
    expect(first.high).toBe(30637.55)
    expect(first.low).toBe(30607.0)
    expect(first.close).toBe(30617.19)
    expect(first.legVWAP).toBe(0.0)
    expect(first.deltaIntensity).toBe(-4.0)
  })

  it('last row matches expected values', () => {
    const bars = parseExecBarsFromFile(FIXTURE)
    const last = bars[bars.length - 1]
    expect(last.dateTime).toEqual(new Date('2026-06-16 13:36:08'))
    expect(last.open).toBe(30441.4)
    expect(last.high).toBe(30441.4)
    expect(last.low).toBe(30422.0)
    expect(last.close).toBe(30436.25)
    expect(last.legVWAP).toBe(30470.51)
    expect(last.deltaIntensity).toBe(-4.0)
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
})
