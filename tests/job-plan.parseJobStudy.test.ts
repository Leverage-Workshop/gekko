import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  JOB_STUDY_MAX_BALANCE_AREAS,
  JOB_STUDY_MAX_FILE_BYTES,
  JOB_STUDY_MAX_PIVOT_ROWS,
  JOB_STUDY_MAX_TARGETS,
  JOB_STUDY_SUPPORTED_SCHEMA_VERSIONS,
} from '@/lib/job-plan/parseJobStudy'
import {
  DAILY,
  REAL_DAILY,
  REAL_WEEKLY,
  WEEKLY,
  expectError,
  fixture,
  mutate,
  parseWith,
  warningCodes,
  type Json,
} from './helpers/jobStudy'

describe('fixtures', () => {
  it('the fixture pair is byte-identical to the checked-in real samples', () => {
    expect(DAILY).toBe(readFileSync(REAL_DAILY, 'utf8'))
    expect(WEEKLY).toBe(readFileSync(REAL_WEEKLY, 'utf8'))
  })
})

describe('parseJobStudy: the real export pair', () => {
  const study = parseWith()

  it('merges both files into one geometry keyed off the shared meta', () => {
    expect(study.schemaVersion).toBe(1)
    expect(study.symbol).toBe('NQU6.CME')
    expect(study.instrument).toBe('NQ')
    expect(study.contractKey).toBe('NQU6')
    expect(study.exchangeTz).toBe('America/Chicago')
    expect(study.tickSize).toBe(0.25)
    expect(study.sessionTemplate).toBe('Globex 17:00:00-16:59:59 CT')
    expect(study.tradingDay).toBe('2026-08-24')
    expect(study.weekOf).toBe('2026-08-24')
  })

  it('takes the current price and exportedAt from the LATER of the two exports', () => {
    expect(study.exportedAt.wall).toBe('2026-08-23T22:40:45')
    expect(study.exportedAt.iso).toBe('2026-08-24T03:40:45.000Z')
    expect(study.currentPrice).toBe(29298.5)
    expect(study.sources.daily.currentPrice).toBe(29298.75)
    expect(study.sources.weekly.currentPrice).toBe(29298.5)
    expect(study.sources.daily.exportedAt.iso).toBe('2026-08-24T03:22:20.000Z')
    expect(study.sources.daily.lastBarTime.wall).toBe('2026-08-23T22:20:00')
    expect(study.sources.weekly.lastBarTime.wall).toBe('2026-08-23T22:30:00')
  })

  it('folds the Sunday-evening Globex bars into Monday and keeps that trading day', () => {
    // lastBarTime is Sunday 22:20 CT on both charts; the trading day is Monday.
    expect(study.tradingDay).toBe('2026-08-24')
    expect(study.daily.current.sessionDate).toBe('2026-08-24')
  })

  it('distinguishes the CURRENT daily pivot from the historical ones (newest first)', () => {
    expect(study.daily.current.role).toBe('current')
    expect(study.daily.current.pivot).toBe(29393.5)
    expect(study.daily.current.valueLow).toBe(29379.5)
    expect(study.daily.current.valueHigh).toBe(29407.5)
    expect(study.daily.current.complete).toBe(false)
    expect(study.daily.history.map((r) => r.sessionDate)).toEqual([
      '2026-08-21',
      '2026-08-20',
      '2026-08-19',
      '2026-08-18',
    ])
    expect(study.daily.history.every((r) => r.role === 'historical')).toBe(true)
    expect(study.daily.history.every((r) => r.complete)).toBe(true)
    expect(study.daily.history[0].pivot).toBe(29488.25)
  })

  it('normalizes the +/-6 daily ladder into ordered above/below sides', () => {
    const { above, below } = study.daily.current.ladder
    expect(above.map((t) => t.label)).toEqual(['1A', '2A', '3A', '4A', '5A', '6A'])
    expect(below.map((t) => t.label)).toEqual(['1B', '2B', '3B', '4B', '5B', '6B'])
    expect(above.map((t) => t.price)).toEqual([
      29435.5, 29463.5, 29491.5, 29519.5, 29547.5, 29575.5,
    ])
    expect(below.map((t) => t.price)).toEqual([
      29351.5, 29323.5, 29295.5, 29267.5, 29239.5, 29211.5,
    ])
    expect(above[0]).toEqual({ label: '1A', rung: 1, side: 'above', price: 29435.5 })
    expect(below[5]).toEqual({ label: '6B', rung: 6, side: 'below', price: 29211.5 })
  })

  it('keeps only the current-week weekly row (+/-3 ladder) and reports nothing dropped', () => {
    expect(study.weekly.current.weekOf).toBe('2026-08-24')
    expect(study.weekly.current.pivot).toBe(29488)
    expect(study.weekly.current.valueLow).toBe(29292.25)
    expect(study.weekly.current.valueHigh).toBe(29683.5)
    expect(study.weekly.current.ladder.above.map((t) => t.label)).toEqual(['1A', '2A', '3A'])
    expect(study.weekly.current.ladder.below.map((t) => t.price)).toEqual([
      28901, 28509.75, 28118.5,
    ])
    expect(study.weekly.droppedHistoryRows).toBe(0)
  })

  it('carries the chart-drawn JBA boxes sorted by low, with resolved anchor instants', () => {
    expect(study.balanceAreas.map((b) => [b.low, b.high])).toEqual([
      [29240, 29696.25],
      [30204, 30334],
    ])
    const box = study.balanceAreas[0]
    expect(box.drawingId).toBe(-297193)
    expect(box.source).toBe('user')
    expect(box.color).toBe('#565E6B')
    expect(box.anchorBegin.wall).toBe('2026-08-19T02:00:00')
    expect(box.anchorBegin.iso).toBe('2026-08-19T07:00:00.000Z')
    // feat-118: JBA anchors are degenerate (begin == end) — accepted as-is.
    expect(box.anchorEnd.epochMs).toBe(box.anchorBegin.epochMs)
  })

  it('carries the Autoplot extremes from the rectangle fallback', () => {
    expect(study.autoplot).toEqual({
      high: 30287.5,
      low: 29863.5,
      source: 'rectangle',
      drawingId: -59203,
      color: '#0C4A8F',
    })
  })

  it('keeps the study settings and diagnostics per file', () => {
    expect(study.settings.daily['(BA) Lookback']).toBe(5)
    expect(study.settings.daily['Remove Old Subgraphs']).toBe(0)
    expect(study.settings.weekly['Remove Old Subgraphs']).toBe(1)
    expect(study.sources.daily.diagnostics.rectanglesOnChart).toBe(2)
    expect(study.sources.weekly.diagnostics.autoplotStudyId).toBe(5)
  })

  it('warns ONLY about the 18-minute export skew between the two manual first exports', () => {
    // 22:22:20 -> 22:40:45 = 1105 s. R13 (> 5 min => insufficient) is the CALLER's
    // decision across all bundle files; the parser reports the number and warns.
    expect(study.exportSkewSeconds).toBe(1105)
    expect(warningCodes(study)).toEqual(['export_skew'])
  })

  it('is pure and deterministic', () => {
    expect(parseWith()).toEqual(study)
  })
})

describe('parseJobStudy: size caps (a broken exporter cannot DoS the task)', () => {
  it('rejects a file over the byte cap before parsing it', () => {
    const padded = DAILY + ' '.repeat(JOB_STUDY_MAX_FILE_BYTES)
    expectError(() => parseWith(padded), 'file_too_large', 'daily')
    expectError(
      () => parseWith(DAILY, WEEKLY + ' '.repeat(JOB_STUDY_MAX_FILE_BYTES)),
      'file_too_large',
      'weekly'
    )
  })

  it('rejects too many pivot rows', () => {
    const daily = mutate(DAILY, (d) => {
      const template = d.dailyPivots[1]
      const rows = Array.from({ length: JOB_STUDY_MAX_PIVOT_ROWS + 1 }, (_, i) => ({
        ...template,
        sessionDate: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      }))
      d.dailyPivots = rows
    })
    expectError(() => parseWith(daily), 'schema_invalid', 'dailyPivots')
  })

  it('rejects too many targets on a row', () => {
    const daily = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      d.dailyPivots[0].targets = Array.from({ length: JOB_STUDY_MAX_TARGETS + 1 }, (_, i) => ({
        label: `${i + 1}A`,
        price: t[0].price + i,
      }))
    })
    expectError(() => parseWith(daily), 'schema_invalid', 'targets')
  })

  it('rejects too many balance areas', () => {
    const daily = mutate(DAILY, (d) => {
      const b = d.balanceAreas[0]
      d.balanceAreas = Array.from({ length: JOB_STUDY_MAX_BALANCE_AREAS + 1 }, (_, i) => ({
        ...b,
        low: b.low + i,
        high: b.high + i,
        drawingId: -1 - i,
      }))
    })
    expectError(() => parseWith(daily), 'schema_invalid', 'balanceAreas')
  })

  it('the caps are generous relative to the real export (5 sessions, 12 rungs, 2 boxes)', () => {
    expect(JOB_STUDY_MAX_PIVOT_ROWS).toBeGreaterThanOrEqual(30)
    expect(JOB_STUDY_MAX_TARGETS).toBeGreaterThanOrEqual(14)
    expect(JOB_STUDY_MAX_BALANCE_AREAS).toBeGreaterThanOrEqual(16)
    expect(JOB_STUDY_MAX_FILE_BYTES).toBeGreaterThanOrEqual(DAILY.length * 10)
  })
})

describe('parseJobStudy: schema and meta', () => {
  it('rejects invalid JSON', () => {
    expectError(() => parseWith('{not json'), 'json_invalid', 'daily')
    expectError(() => parseWith(DAILY, ''), 'json_invalid', 'weekly')
  })

  it('rejects an unsupported schemaVersion (fixture daily.schema-v2.json)', () => {
    expect(JOB_STUDY_SUPPORTED_SCHEMA_VERSIONS).toEqual([1])
    expectError(() => parseWith(fixture('daily.schema-v2.json')), 'schema_version_unsupported')
  })

  it.each(['meta', 'dailyPivots', 'balanceAreas'])(
    'rejects the daily file with the %s section missing',
    (section) => {
      const daily = mutate(DAILY, (d) => {
        delete d[section]
      })
      expectError(() => parseWith(daily), 'schema_invalid', section)
    }
  )

  it.each(['meta', 'weeklyPivots', 'autoplot'])(
    'rejects the weekly file with the %s section missing',
    (section) => {
      const weekly = mutate(WEEKLY, (w) => {
        delete w[section]
      })
      expectError(() => parseWith(DAILY, weekly), 'schema_invalid', section)
    }
  )

  it('rejects a file whose meta.contract names the other study (file identity)', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.contract = 'gekko.job-study-weekly'
    })
    expectError(() => parseWith(daily), 'contract_mismatch')
    // Swapped files fail on shape first — the daily schema has no weeklyPivots.
    expectError(() => parseWith(WEEKLY, DAILY), 'schema_invalid', 'weeklyPivots')
  })

  it('rejects an unknown field on a pivot row (additive fields need a schemaVersion bump)', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].newField = 1
    })
    expectError(() => parseWith(daily), 'schema_invalid', 'newField')
  })

  it('rejects contract rollover mixing: one contract only (fixture weekly.rollover.json)', () => {
    expectError(() => parseWith(DAILY, fixture('weekly.rollover.json')), 'symbol_mismatch')
  })

  it('rejects a symbol that is not a supported futures root', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.symbol = 'CLU6.NYMEX'
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.symbol = 'CLU6.NYMEX'
    })
    expectError(() => parseWith(daily, weekly), 'symbol_unsupported')
  })

  it('accepts the micro contract as the same instrument root', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.symbol = 'MNQU6.CME'
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.symbol = 'MNQU6.CME'
    })
    const study = parseWith(daily, weekly)
    expect(study.instrument).toBe('NQ')
    expect(study.contractKey).toBe('MNQU6')
  })

  it('rejects an invalid or mismatched exchange TZ', () => {
    const bad = mutate(DAILY, (d) => {
      d.meta.exchangeTz = 'Mars/Olympus'
    })
    expectError(() => parseWith(bad), 'exchange_tz_invalid')
    const ny = mutate(DAILY, (d) => {
      d.meta.exchangeTz = 'America/New_York'
    })
    expectError(() => parseWith(ny), 'exchange_tz_mismatch')
  })

  it('rejects an unsupported or mismatched session template', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.studySettings.sessionTemplate = 'RTH 08:30:00-15:15:00 CT'
    })
    expectError(() => parseWith(daily), 'session_template_unsupported')
  })

  it('rejects a tick-size mismatch between the two charts', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.tickSize = 0.5
    })
    expectError(() => parseWith(DAILY, weekly), 'tick_size_mismatch')
  })

  it('rejects the two files disagreeing on tradingDay or weekOf (a straddled export cycle)', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.tradingDay = '2026-08-25'
    })
    expectError(() => parseWith(DAILY, weekly), 'trading_day_mismatch')
    const weekly2 = mutate(WEEKLY, (w) => {
      w.meta.weekOf = '2026-08-17'
    })
    expectError(() => parseWith(DAILY, weekly2), 'week_of_mismatch')
  })

  it('rejects a tradingDay that contradicts the 17:00 CT Globex roll of lastBarTime', () => {
    // Sunday 22:20 CT bars belong to Monday; an exporter claiming Sunday is wrong.
    const daily = mutate(DAILY, (d) => {
      d.meta.tradingDay = '2026-08-23'
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.tradingDay = '2026-08-23'
    })
    expectError(() => parseWith(daily, weekly), 'trading_day_derivation')
  })

  it('rejects a tradingDay outside its weekOf week', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.weekOf = '2026-08-31'
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.weekOf = '2026-08-31'
    })
    expectError(() => parseWith(daily, weekly), 'week_of_mismatch')
  })

  it('rejects a last bar timestamped after the export and an unresolvable timestamp', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.lastBarTime = '2026-08-23T22:30:00'
    })
    expectError(() => parseWith(daily), 'last_bar_after_export')
    const gap = mutate(DAILY, (d) => {
      d.meta.exportedAt = '2026-03-08T02:30:00'
    })
    expectError(() => parseWith(gap), 'timestamp_invalid')
  })

  it('warns when weekOf is not a Monday (holiday weeks are unobserved)', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.weekOf = '2026-08-25'
      d.meta.tradingDay = '2026-08-25'
      d.meta.exportedAt = '2026-08-25T09:00:00'
      d.meta.lastBarTime = '2026-08-25T08:55:00'
      d.dailyPivots[0].sessionDate = '2026-08-25'
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.weekOf = '2026-08-25'
      w.meta.tradingDay = '2026-08-25'
      w.meta.exportedAt = '2026-08-25T09:00:00'
      w.meta.lastBarTime = '2026-08-25T08:30:00'
      w.weeklyPivots[0].weekOf = '2026-08-25'
    })
    const study = parseWith(daily, weekly)
    expect(warningCodes(study)).toContain('week_of_not_monday')
  })

  it('aligns prices to the EXPORTED tick size (0.5 rejects the sample .25/.75 prices)', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.tickSize = 0.5
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.tickSize = 0.5
    })
    expectError(() => parseWith(daily, weekly), 'tick_misaligned')
  })
})

describe('parseJobStudy: prices', () => {
  it('rejects tick misalignment on the current pivot (fixture daily.tick-misaligned.json)', () => {
    expectError(
      () => parseWith(fixture('daily.tick-misaligned.json')),
      'tick_misaligned',
      '29393.6'
    )
  })

  it.each([
    ['a target', (d: Json) => (d.dailyPivots[0].targets[0].price = 29435.6)],
    ['a value edge', (d: Json) => (d.dailyPivots[1].valueHigh = 29531.3)],
    ['a balance area edge', (d: Json) => (d.balanceAreas[0].low = 30204.1)],
    ['the current price', (d: Json) => (d.meta.currentPrice = 29298.7)],
  ])('rejects tick misalignment on %s', (_what, fn) => {
    expectError(() => parseWith(mutate(DAILY, fn)), 'tick_misaligned')
  })

  it('rejects tick misalignment on the autoplot and weekly ladder', () => {
    const w1 = mutate(WEEKLY, (w) => {
      w.autoplot.high = 30287.6
    })
    expectError(() => parseWith(DAILY, w1), 'tick_misaligned', 'autoplot')
    const w2 = mutate(WEEKLY, (w) => {
      w.weeklyPivots[0].targets[1].price = 28901.1
    })
    expectError(() => parseWith(DAILY, w2), 'tick_misaligned')
  })

  it('rejects Sierra 0.00 placeholders on a historical pivot (fixture daily.sentinel.json)', () => {
    expectError(() => parseWith(fixture('daily.sentinel.json')), 'price_sentinel', '2026-08-20')
  })

  it.each([
    ['value edge', (d: Json) => (d.dailyPivots[0].valueLow = 0)],
    ['target', (d: Json) => (d.dailyPivots[3].targets[5].price = 0)],
    ['balance area', (d: Json) => (d.balanceAreas[1].high = 0)],
    ['current price', (d: Json) => (d.meta.currentPrice = 0)],
    ['negative price', (d: Json) => (d.dailyPivots[0].pivot = -29393.5)],
  ])('rejects a 0.00 / negative sentinel on a %s', (_what, fn) => {
    expectError(() => parseWith(mutate(DAILY, fn)), 'price_sentinel')
  })

  it('rejects sentinels on the weekly side', () => {
    const w1 = mutate(WEEKLY, (w) => {
      w.autoplot.low = 0
    })
    expectError(() => parseWith(DAILY, w1), 'price_sentinel', 'autoplot')
    const w2 = mutate(WEEKLY, (w) => {
      w.weeklyPivots[0].pivot = 0
    })
    expectError(() => parseWith(DAILY, w2), 'price_sentinel')
  })

  it('rejects a non-finite price at the schema layer', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].pivot = 'NaN'
    })
    expectError(() => parseWith(daily), 'schema_invalid')
  })
})

describe('parseJobStudy: value zone', () => {
  it.each([
    ['valueLow above the pivot', (d: Json) => (d.dailyPivots[0].valueLow = 29400)],
    ['valueHigh below the pivot', (d: Json) => (d.dailyPivots[2].valueHigh = 29300)],
    [
      'valueLow above valueHigh',
      (d: Json) => {
        d.dailyPivots[1].valueLow = 29600
        d.dailyPivots[1].valueHigh = 29400
      },
    ],
  ])('rejects %s (valueLow <= pivot <= valueHigh is observed on every row)', (_what, fn) => {
    expectError(() => parseWith(mutate(DAILY, fn)), 'value_zone_order')
  })

  it('rejects the weekly zone out of order too', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.weeklyPivots[0].valueHigh = 29400
    })
    expectError(() => parseWith(DAILY, weekly), 'value_zone_order')
  })

  it('warns (does not reject) a zone collapsed to the pivot — unobserved but not impossible', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[1].valueLow = d.dailyPivots[1].pivot
      d.dailyPivots[1].valueHigh = d.dailyPivots[1].pivot
    })
    const study = parseWith(daily)
    expect(warningCodes(study)).toContain('value_zone_collapsed')
  })
})
