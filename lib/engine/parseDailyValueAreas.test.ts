import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDailyValueAreas, partitionDailyValueAreas } from './parseDailyValueAreas'

const fixture = readFileSync(
  join(__dirname, '..', '..', 'chart-data', 'daily-value-areas.csv'),
  'utf8',
)

const HEADER = 'Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume'

const csv = (rows: string[], header = HEADER) => [header, ...rows].join('\n')

describe('parseDailyValueAreas', () => {
  it('parses the chart-data fixture end to end', () => {
    const sessions = parseDailyValueAreas(fixture)
    expect(sessions).toHaveLength(9)
    // Row 1 is the LIVE in-progress session, exactly as the shipped study writes
    // it (bundle review 2026-08-07 D1) — parsed, never dropped.
    expect(sessions[0].date).toBe('2026-06-16')
    expect(sessions[1]).toEqual({
      date: '2026-06-15',
      poc: 29890,
      vah: 29962,
      val: 29800,
      sessionHigh: 29993.5,
      sessionLow: 29614.5,
      sessionVolume: 412345,
    })
    expect(sessions[8].date).toBe('2026-06-04')
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
  it('accepts the optional IsComplete column and reads the flag', () => {
    const sessions = parseDailyValueAreas(
      csv(
        [
          '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345,0',
          '2026-07-22,29812.00,29901.00,29744.00,29933.00,29701.00,398211,1',
        ],
        `${HEADER},IsComplete`,
      ),
    )
    expect(sessions.map((s) => s.isComplete)).toEqual([false, true])
    // Without the column the field is simply absent — the engine never reads it.
    expect(parseDailyValueAreas(csv(['2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,1']))[0]
      .isComplete).toBeUndefined()
  })

  it('rejects a flag column the header did not declare (and vice versa)', () => {
    expect(() =>
      parseDailyValueAreas(csv(['2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,1,1'])),
    ).toThrow(/row 1 is malformed/)
    expect(() =>
      parseDailyValueAreas(
        csv(['2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,1'], `${HEADER},IsComplete`),
      ),
    ).toThrow(/row 1 is malformed/)
  })
})

describe('partitionDailyValueAreas (feat-089)', () => {
  const rows = parseDailyValueAreas(fixture)

  it('splits the live session out of the fixture history by date', () => {
    const { developing, completed, flagDisagreement } = partitionDailyValueAreas(rows, '2026-06-16')
    expect(developing?.date).toBe('2026-06-16')
    expect(completed).toHaveLength(8)
    expect(completed[0].date).toBe('2026-06-15')
    expect(completed.some((s) => s.date === '2026-06-16')).toBe(false)
    expect(flagDisagreement).toBeNull()
  })

  it('degrades cleanly when no row matches the live session (pre-open / overnight)', () => {
    const { developing, completed } = partitionDailyValueAreas(rows, '2026-06-17')
    expect(developing).toBeNull()
    // Nothing is dropped — the whole history is completed.
    expect(completed).toHaveLength(rows.length)
  })

  it('detects by date, never by position', () => {
    // A history whose newest row is NOT the live session must not lose it.
    const { developing, completed } = partitionDailyValueAreas(rows, '2026-06-11')
    expect(developing?.date).toBe('2026-06-11')
    expect(completed[0].date).toBe('2026-06-16')
    expect(completed).toHaveLength(rows.length - 1)
  })

  it('treats every row as completed without a live session date', () => {
    const { developing, completed } = partitionDailyValueAreas(rows, null)
    expect(developing).toBeNull()
    expect(completed).toHaveLength(rows.length)
  })

  it('reports an IsComplete disagreement but still partitions on the date', () => {
    const flagged = parseDailyValueAreas(
      csv(
        [
          '2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345,1',
          '2026-07-22,29812.00,29901.00,29744.00,29933.00,29701.00,398211,1',
        ],
        `${HEADER},IsComplete`,
      ),
    )
    const partition = partitionDailyValueAreas(flagged, '2026-07-23')
    expect(partition.developing?.date).toBe('2026-07-23')
    expect(partition.flagDisagreement).toMatch(/IsComplete=true but is the live session/)

    const stale = partitionDailyValueAreas(flagged, '2026-07-24')
    expect(stale.developing).toBeNull()
    expect(stale.flagDisagreement).toBeNull()
  })
})
