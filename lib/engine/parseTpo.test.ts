import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTpoProfile } from './parseTpo'

const fixture = readFileSync(join(__dirname, '..', '..', 'chart-data', 'tpo.data.md'), 'utf8')

const minimal = (overrides: Partial<Record<'header' | 'rows', string>> = {}) => `## Metadata
- **Session Date**: 2026-06-16
- **Session**: RTH
- **TPO Period Minutes**: 30
- **Tick Size**: 0.25
- **Bin Size (Ticks)**: 8

## Summary
- **POC Price**: 29950.00
- **Value Area High**: 29978.00
- **Value Area Low**: 29870.00
- **IB High**: 30044.00
- **IB Low**: 29988.00
- **Session High**: 30044.00
- **Session Low**: 29862.00

## TPO Data

\`\`\`csv
${overrides.header ?? 'Price,TPOCount,Letters'}
${overrides.rows ?? '29950.00,3,"HIJ"\n29948.00,2,"HI"\n29946.00,1,"H"'}
\`\`\`
`

describe('parseTpoProfile', () => {
  it('parses the chart-data fixture end to end', () => {
    const tpo = parseTpoProfile(fixture)
    expect(tpo.meta).toEqual({
      sessionDate: '2026-06-16',
      session: 'RTH',
      tpoPeriodMinutes: 30,
      tickSize: 0.25,
      binSize: 8,
      step: 2,
    })
    expect(tpo.summary).toEqual({
      pocPrice: 29950,
      valueAreaHigh: 29978,
      valueAreaLow: 29870,
      ibHigh: 30044,
      ibLow: 29988,
      sessionHigh: 30044,
      sessionLow: 29862,
    })
    expect(tpo.rows.length).toBeGreaterThan(50)
    expect(tpo.rows[0]).toEqual({ price: 30044, tpoCount: 2, letters: 'BC' })
    expect(tpo.rows[tpo.rows.length - 1]).toEqual({ price: 29862, tpoCount: 1, letters: 'F' })
  })

  it('parses letters in period order and empty letters', () => {
    const tpo = parseTpoProfile(minimal({ rows: '29950.00,3,"HIJ"\n29948.00,0,""' }))
    expect(tpo.rows[0].letters).toBe('HIJ')
    expect(tpo.rows[1].letters).toBe('')
  })

  it('tolerates an untraded gap that stays on the bin grid', () => {
    // 29950 -> 29944 skips two bins: still a whole number of 2.0-pt steps.
    const tpo = parseTpoProfile(minimal({ rows: '29950.00,2,"HI"\n29944.00,1,"H"' }))
    expect(tpo.rows.map((r) => r.price)).toEqual([29950, 29944])
  })

  it.each([
    ['header mismatch', minimal({ header: 'Price,TPOCount' }), /csv header mismatch/],
    ['non-descending prices', minimal({ rows: '29946.00,1,"H"\n29950.00,2,"HI"' }), /not descending/],
    ['off-grid spacing', minimal({ rows: '29950.00,2,"HI"\n29949.00,1,"H"' }), /off-grid/],
    ['malformed row', minimal({ rows: '29950.00,2,HI' }), /malformed/],
    ['missing session date', minimal().replace(/- \*\*Session Date\*\*.*\n/, ''), /Session Date/],
    ['missing IB', minimal().replace(/- \*\*IB High\*\*.*\n/, ''), /IB High/],
    ['no csv block', minimal().replace(/```csv/, '```text'), /csv block/],
  ])('hard-rejects a drifted export: %s', (_name, content, message) => {
    expect(() => parseTpoProfile(content)).toThrow(message)
  })
})
