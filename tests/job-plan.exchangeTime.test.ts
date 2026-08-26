import { describe, expect, it } from 'vitest'
import {
  addDays,
  isCalendarDate,
  isValidTimeZone,
  resolveWallClock,
  tradingDayOfWallClock,
  weekdayOf,
} from '@/lib/job-plan/exchangeTime'

const CT = 'America/Chicago'

describe('resolveWallClock (DST-safe wall clock -> instant in the exchange TZ)', () => {
  it('resolves the real export timestamp: 22:22:20 CDT on 2026-08-23 is 03:22:20Z next day', () => {
    const ms = resolveWallClock('2026-08-23T22:22:20', CT)
    expect(ms).not.toBeNull()
    expect(new Date(ms!).toISOString()).toBe('2026-08-24T03:22:20.000Z')
  })

  it('applies CST in winter (UTC-6) and CDT in summer (UTC-5)', () => {
    expect(new Date(resolveWallClock('2026-01-15T09:00:00', CT)!).toISOString()).toBe(
      '2026-01-15T15:00:00.000Z'
    )
    expect(new Date(resolveWallClock('2026-07-15T09:00:00', CT)!).toISOString()).toBe(
      '2026-07-15T14:00:00.000Z'
    )
  })

  it('rejects a wall time that does not exist (spring-forward gap)', () => {
    // US DST 2026 starts 2026-03-08 at 02:00 CST -> 03:00 CDT; 02:30 never happens.
    expect(resolveWallClock('2026-03-08T02:30:00', CT)).toBeNull()
    expect(resolveWallClock('2026-03-08T03:00:00', CT)).not.toBeNull()
  })

  it('resolves an ambiguous fall-back wall time to a real instant that round-trips', () => {
    // US DST 2026 ends 2026-11-01 at 02:00 CDT -> 01:00 CST; 01:30 happens twice.
    const ms = resolveWallClock('2026-11-01T01:30:00', CT)
    expect(ms).not.toBeNull()
    const iso = new Date(ms!).toISOString()
    expect(['2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z']).toContain(iso)
  })

  it('rejects malformed or non-calendar strings', () => {
    expect(resolveWallClock('2026-08-23 22:22:20', CT)).toBeNull()
    expect(resolveWallClock('2026-08-23T22:22:20Z', CT)).toBeNull()
    expect(resolveWallClock('2026-13-01T00:00:00', CT)).toBeNull()
    expect(resolveWallClock('2026-02-30T00:00:00', CT)).toBeNull()
    expect(resolveWallClock('2026-08-23T24:00:00', CT)).toBeNull()
  })

  it('is a pure function of its inputs (same result on repeat)', () => {
    expect(resolveWallClock('2026-08-23T22:20:00', CT)).toBe(
      resolveWallClock('2026-08-23T22:20:00', CT)
    )
  })
})

describe('tradingDayOfWallClock (Globex 17:00 CT roll)', () => {
  it('folds Sunday-evening Globex bars into Monday (the real sample)', () => {
    expect(tradingDayOfWallClock('2026-08-23T22:20:00')).toBe('2026-08-24')
  })

  it('keeps a Friday RTH bar on Friday and rolls exactly at 17:00', () => {
    expect(tradingDayOfWallClock('2026-08-21T15:55:00')).toBe('2026-08-21')
    expect(tradingDayOfWallClock('2026-08-20T16:59:59')).toBe('2026-08-20')
    expect(tradingDayOfWallClock('2026-08-20T17:00:00')).toBe('2026-08-21')
  })

  it('rolls across a month boundary', () => {
    expect(tradingDayOfWallClock('2026-08-31T18:00:00')).toBe('2026-09-01')
  })

  it('returns null for a malformed timestamp', () => {
    expect(tradingDayOfWallClock('not a time')).toBeNull()
  })
})

describe('calendar helpers', () => {
  it('isCalendarDate accepts real dates and rejects shape-valid nonsense', () => {
    expect(isCalendarDate('2026-08-24')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-8-24')).toBe(false)
  })

  it('weekdayOf uses 0 = Sunday .. 6 = Saturday', () => {
    expect(weekdayOf('2026-08-23')).toBe(0)
    expect(weekdayOf('2026-08-24')).toBe(1)
    expect(weekdayOf('2026-08-29')).toBe(6)
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-08-24', 6)).toBe('2026-08-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('isValidTimeZone accepts IANA zones and rejects garbage', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})
