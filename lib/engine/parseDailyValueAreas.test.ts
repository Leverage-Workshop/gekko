import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDailyValueAreas } from './parseDailyValueAreas'

const fixture = readFileSync(
  join(__dirname, '..', '..', 'chart-data', 'daily-value-areas.csv'),
  'utf8',
)

const HEADER = 'Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume'

const csv = (rows: string[], header = HEADER) => [header, ...rows].join('\n')

describe('parseDailyValueAreas', () => {
  it('parses the chart-data fixture end to end', () => {
    const sessions = parseDailyValueAreas(fixture)
    expect(sessions).toHaveLength(8)
    expect(sessions[0]).toEqual({
      date: '2026-06-15',
      poc: 29890,
      vah: 29962,
      val: 29800,
      sessionHigh: 29993.5,
      sessionLow: 29614.5,
      sessionVolume: 412345,
    })
    expect(sessions[7].date).toBe('2026-06-04')
  })

  it('parses a minimal two-row file', () => {
    const sessions = parseDailyValueAreas(
      csv([
        '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345',
        '2026-07-22,29812.00,29901.00,29744.00,29933.00,29701.00,398211',
      ]),
    )
    expect(sessions.map((s) => s.date)).toEqual(['2026-07-23', '2026-07-22'])
    expect(sessions[1].sessionVolume).toBe(398211)
  })

  it('rejects a drifted header', () => {
    expect(() =>
      parseDailyValueAreas(
        csv(['2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,1'], 'Date,POC,VAH,VAL'),
      ),
    ).toThrow(/header mismatch/)
  })

  it('rejects an empty file and a header-only file', () => {
    expect(() => parseDailyValueAreas('')).toThrow(/no data rows/)
    expect(() => parseDailyValueAreas(`${HEADER}\n`)).toThrow(/no data rows/)
  })

  it('rejects a malformed row', () => {
    expect(() => parseDailyValueAreas(csv(['2026-07-23,29950.00,oops,29890.00,30044.00,29862.00,1']))).toThrow(
      /row 1 is malformed/,
    )
    expect(() => parseDailyValueAreas(csv(['07/23/2026,29950.00,30010.00,29890.00,30044.00,29862.00,1']))).toThrow(
      /row 1 is malformed/,
    )
  })

  it('rejects dates that are not strictly descending', () => {
    expect(() =>
      parseDailyValueAreas(
        csv([
          '2026-07-22,29812.00,29901.00,29744.00,29933.00,29701.00,398211',
          '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345',
        ]),
      ),
    ).toThrow(/not strictly descending/)
    expect(() =>
      parseDailyValueAreas(
        csv([
          '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345',
          '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345',
        ]),
      ),
    ).toThrow(/not strictly descending/)
  })

  it('rejects an inverted value area or session range', () => {
    expect(() => parseDailyValueAreas(csv(['2026-07-23,29950.00,29890.00,30010.00,30044.00,29862.00,1']))).toThrow(
      /VAH 29890 < VAL 30010/,
    )
    expect(() => parseDailyValueAreas(csv(['2026-07-23,29950.00,30010.00,29890.00,29862.00,30044.00,1']))).toThrow(
      /SessionHigh 29862 < SessionLow 30044/,
    )
  })

  it('rejects a value area outside the session range and a POC outside the value area', () => {
    expect(() => parseDailyValueAreas(csv(['2026-07-23,29950.00,30050.00,29890.00,30044.00,29862.00,1']))).toThrow(
      /outside session range/,
    )
    expect(() => parseDailyValueAreas(csv(['2026-07-23,30020.00,30010.00,29890.00,30044.00,29862.00,1']))).toThrow(
      /POC 30020 outside value area/,
    )
  })
})
