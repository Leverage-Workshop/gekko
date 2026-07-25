import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseHtfBars } from './parseHtfBars'

const HEADER = 'DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume'

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')

describe('parseHtfBars', () => {
  it('parses rows into typed bars with derived delta (ask − bid)', () => {
    const bars = parseHtfBars(
      csv(
        '2026-07-24 09:30:00,29891.18,29942.75,29883.50,29927.00,48231,23110,25121',
        '2026-07-24 10:00:00,29927.00,29955.25,29910.00,29940.50,39882,20990,18892',
      ),
    )

    expect(bars).toHaveLength(2)
    expect(bars[0].dateTime.getFullYear()).toBe(2026)
    expect(bars[0].open).toBe(29891.18)
    expect(bars[0].high).toBe(29942.75)
    expect(bars[0].low).toBe(29883.5)
    expect(bars[0].close).toBe(29927.0)
    expect(bars[0].volume).toBe(48231)
    expect(bars[0].bidVolume).toBe(23110)
    expect(bars[0].askVolume).toBe(25121)
    expect(bars[0].delta).toBe(25121 - 23110)
    expect(bars[1].delta).toBe(18892 - 20990)
  })

  it('hard-rejects a drifted header', () => {
    expect(() =>
      parseHtfBars('DateTime,Open,High,Low,Close\n2026-07-24 09:30:00,1,2,0,1'),
    ).toThrow(/Header mismatch/)
  })

  it('rejects an empty export', () => {
    expect(() => parseHtfBars('')).toThrow(/no data rows/)
    expect(() => parseHtfBars(HEADER)).toThrow(/no data rows/)
  })

  it('rejects a row with the wrong column count', () => {
    expect(() =>
      parseHtfBars(csv('2026-07-24 09:30:00,1,2,0,1,100,50')),
    ).toThrow(/Row 1 has 7 columns/)
  })

  it('rejects non-numeric fields and invalid datetimes', () => {
    expect(() =>
      parseHtfBars(csv('2026-07-24 09:30:00,1,2,0,1,abc,50,50')),
    ).toThrow(/Invalid number for row 1 Volume/)
    expect(() =>
      parseHtfBars(csv('not-a-date,1,2,0,1,100,50,50')),
    ).toThrow(/invalid DateTime/)
  })

  it('rejects an inverted bar (High < Low)', () => {
    expect(() =>
      parseHtfBars(csv('2026-07-24 09:30:00,1,2,5,1,100,50,50')),
    ).toThrow(/High < Low/)
  })

  it('rejects rows out of chronological order', () => {
    expect(() =>
      parseHtfBars(
        csv(
          '2026-07-24 10:00:00,1,2,0,1,100,50,50',
          '2026-07-24 09:30:00,1,2,0,1,100,50,50',
        ),
      ),
    ).toThrow(/not in chronological order/)
  })

  it('parses the real sample export (chart-data/)', () => {
    const content = readFileSync(
      join(process.cwd(), 'chart-data', 'htf_bar_data.rolling.csv'),
      'utf-8',
    )
    const bars = parseHtfBars(content)

    expect(bars.length).toBeGreaterThan(100)
    for (const bar of bars) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
      expect(bar.volume).toBe(bar.bidVolume + bar.askVolume)
    }
  })
})
