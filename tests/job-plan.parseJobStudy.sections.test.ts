import { describe, expect, it } from 'vitest'
import { MGI_CROSS_CHECK_TOLERANCE_TICKS, crossCheckWithMgi } from '@/lib/job-plan/parseJobStudy'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import {
  DAILY,
  WEEKLY,
  expectError,
  fixture,
  mutate,
  parseWith,
  warningCodes,
  type Json,
} from './helpers/jobStudy'

describe('parseJobStudy: target ladders', () => {
  it('rejects a duplicate label + price (fixture daily.targets-dup.json)', () => {
    const err = expectError(
      () => parseWith(fixture('daily.targets-dup.json')),
      'target_label_duplicate'
    )
    expect(err.issues.map((i) => i.code)).toContain('target_price_duplicate')
  })

  it('rejects an out-of-order ladder (a higher rung closer to the pivot)', () => {
    const daily = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      const a2 = t.find((x: Json) => x.label === '2A')
      const a3 = t.find((x: Json) => x.label === '3A')
      ;[a2.price, a3.price] = [a3.price, a2.price]
    })
    expectError(() => parseWith(daily), 'target_not_monotonic', '3A')
  })

  it('rejects a rung on the wrong side of the pivot', () => {
    const daily = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      t.find((x: Json) => x.label === '1B').price = d.dailyPivots[0].pivot + 100
    })
    expectError(() => parseWith(daily), 'target_wrong_side', '1B')
  })

  it('rejects a label outside the <rung><A|B> vocabulary', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].targets[0].label = 'T1'
    })
    expectError(() => parseWith(daily), 'target_label_invalid', 'T1')
  })

  it('rejects duplicate prices under distinct labels', () => {
    const daily = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      t.find((x: Json) => x.label === '2A').price = t.find((x: Json) => x.label === '1A').price
    })
    expectError(() => parseWith(daily), 'target_price_duplicate')
  })

  it('accepts a shuffled ladder and normalizes it (input order is not an invariant)', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].targets.reverse()
    })
    const study = parseWith(daily)
    expect(study.daily.current.ladder.above.map((t) => t.label)).toEqual([
      '1A',
      '2A',
      '3A',
      '4A',
      '5A',
      '6A',
    ])
  })

  it('warns on a rung gap, an asymmetric ladder and an empty side (unobserved, non-fatal)', () => {
    const gap = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      d.dailyPivots[0].targets = t.filter((x: Json) => x.label !== '3A')
    })
    const codes = warningCodes(parseWith(gap))
    expect(codes).toContain('ladder_rung_gap')
    expect(codes).toContain('ladder_asymmetric')

    const empty = mutate(DAILY, (d) => {
      const t = d.dailyPivots[0].targets
      d.dailyPivots[0].targets = t.filter((x: Json) => !x.label.endsWith('B'))
    })
    expect(warningCodes(parseWith(empty))).toContain('ladder_empty_side')
  })

  it('warns when a rung sits inside the value zone (observed always outside it)', () => {
    const daily = mutate(DAILY, (d) => {
      const row = d.dailyPivots[0]
      row.targets.find((x: Json) => x.label === '1A').price = row.pivot + 0.25
    })
    expect(warningCodes(parseWith(daily))).toContain('ladder_inside_value_zone')
  })
})

describe('parseJobStudy: sessions', () => {
  it('rejects a session after tradingDay (fixture daily.future-session.json)', () => {
    expectError(
      () => parseWith(fixture('daily.future-session.json')),
      'future_session',
      '2026-08-25'
    )
  })

  it('rejects a duplicate session date', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[2].sessionDate = '2026-08-21'
    })
    expectError(() => parseWith(daily), 'session_duplicate', '2026-08-21')
  })

  it('rejects a weekend session date (Sunday Globex folds into Monday)', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[1].sessionDate = '2026-08-23'
    })
    expectError(() => parseWith(daily), 'session_weekend', '2026-08-23')
  })

  it('rejects a non-calendar session date', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[1].sessionDate = '2026-02-30'
    })
    expectError(() => parseWith(daily), 'schema_invalid')
  })

  it('rejects a daily export with no row for the current trading day', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots.shift()
    })
    expectError(() => parseWith(daily), 'daily_current_missing')
  })

  it('accepts a shuffled daily history and sorts it newest-first', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots.reverse()
    })
    const study = parseWith(daily)
    expect(study.daily.current.sessionDate).toBe('2026-08-24')
    expect(study.daily.history.map((r) => r.sessionDate)).toEqual([
      '2026-08-21',
      '2026-08-20',
      '2026-08-19',
      '2026-08-18',
    ])
  })

  it('keeps every historical pivot (untested historical pivots stay relevant) and warns on incompleteness', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[3].complete = false
    })
    const study = parseWith(daily)
    expect(study.daily.history).toHaveLength(4)
    expect(study.daily.history[2].complete).toBe(false)
    expect(warningCodes(study)).toContain('daily_history_incomplete')
  })

  it('warns when there is no prior session at all', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots = [d.dailyPivots[0]]
    })
    expect(warningCodes(parseWith(daily))).toContain('daily_history_missing')
  })

  it('warns when a row carries non-empty extras (SVP / developing pivot read 0 today)', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].extras = { 'Developing Pivot': 29390 }
    })
    const study = parseWith(daily)
    expect(study.daily.current.extras).toEqual({ 'Developing Pivot': 29390 })
    expect(warningCodes(study)).toContain('extras_present')
  })

  it('handles a Friday-afternoon export (no Globex roll) end to end', () => {
    const daily = mutate(DAILY, (d) => {
      d.meta.tradingDay = '2026-08-21'
      d.meta.weekOf = '2026-08-17'
      d.meta.exportedAt = '2026-08-21T15:59:00'
      d.meta.lastBarTime = '2026-08-21T15:55:00'
      d.dailyPivots.shift() // 08-21 becomes the current row
      d.dailyPivots[0].complete = false
    })
    const weekly = mutate(WEEKLY, (w) => {
      w.meta.tradingDay = '2026-08-21'
      w.meta.weekOf = '2026-08-17'
      w.meta.exportedAt = '2026-08-21T16:00:00'
      w.meta.lastBarTime = '2026-08-21T15:30:00'
      w.weeklyPivots[0].weekOf = '2026-08-17'
    })
    const study = parseWith(daily, weekly)
    expect(study.tradingDay).toBe('2026-08-21')
    expect(study.daily.current.sessionDate).toBe('2026-08-21')
    expect(study.daily.history.map((r) => r.sessionDate)).toEqual([
      '2026-08-20',
      '2026-08-19',
      '2026-08-18',
    ])
    expect(study.exportSkewSeconds).toBe(60)
    expect(warningCodes(study)).toEqual([])
  })
})

describe('parseJobStudy: weekly', () => {
  it('drops the back-read prior-week row and warns (fixture weekly.history-backread.json)', () => {
    const study = parseWith(DAILY, fixture('weekly.history-backread.json'))
    expect(study.weekly.current.weekOf).toBe('2026-08-24')
    expect(study.weekly.droppedHistoryRows).toBe(1)
    expect(warningCodes(study)).toContain('weekly_history_dropped')
  })

  it('rejects a weekly export with no current-week row', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.weeklyPivots[0].weekOf = '2026-08-17'
    })
    expectError(() => parseWith(DAILY, weekly), 'weekly_current_missing', '2026-08-24')
  })

  it('rejects an empty weeklyPivots array', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.weeklyPivots = []
    })
    expectError(() => parseWith(DAILY, weekly), 'weekly_current_missing')
  })

  it('rejects a weekly row dated after the current week', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.weeklyPivots.push({ ...w.weeklyPivots[0], weekOf: '2026-08-31' })
    })
    expectError(() => parseWith(DAILY, weekly), 'future_session', '2026-08-31')
  })
})

describe('parseJobStudy: balance areas and autoplot', () => {
  it('rejects a box with low >= high', () => {
    const eq = mutate(DAILY, (d) => {
      d.balanceAreas[0].high = d.balanceAreas[0].low
    })
    expectError(() => parseWith(eq), 'balance_area_order')
    const inverted = mutate(DAILY, (d) => {
      ;[d.balanceAreas[1].low, d.balanceAreas[1].high] = [
        d.balanceAreas[1].high,
        d.balanceAreas[1].low,
      ]
    })
    expectError(() => parseWith(inverted), 'balance_area_order')
  })

  it('rejects the autoplot with high <= low', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.autoplot.high = w.autoplot.low
    })
    expectError(() => parseWith(DAILY, weekly), 'balance_area_order', 'autoplot')
  })

  it('de-duplicates identical boxes with a warning', () => {
    const daily = mutate(DAILY, (d) => {
      d.balanceAreas.push({ ...d.balanceAreas[0], drawingId: -1 })
    })
    const study = parseWith(daily)
    expect(study.balanceAreas).toHaveLength(2)
    expect(warningCodes(study)).toContain('balance_area_duplicate')
  })

  it('warns on an empty balanceAreas array and a null autoplot (core geometry absent)', () => {
    const daily = mutate(DAILY, (d) => {
      d.balanceAreas = []
    })
    expect(warningCodes(parseWith(daily))).toContain('balance_areas_empty')
    const weekly = mutate(WEEKLY, (w) => {
      w.autoplot = null
    })
    const study = parseWith(DAILY, weekly)
    expect(study.autoplot).toBeNull()
    expect(warningCodes(study)).toContain('autoplot_missing')
  })

  it('warns on reversed box anchors and unknown sources; rejects an unresolvable anchor', () => {
    const daily = mutate(DAILY, (d) => {
      d.balanceAreas[0].anchorTimes.end = '2026-08-16T02:00:00'
      d.balanceAreas[1].source = 'study'
    })
    const codes = warningCodes(parseWith(daily))
    expect(codes).toContain('balance_area_anchor_reversed')
    expect(codes).toContain('balance_area_source_unknown')
    const bad = mutate(DAILY, (d) => {
      d.balanceAreas[0].anchorTimes.begin = '2026-03-08T02:30:00'
    })
    expectError(() => parseWith(bad), 'timestamp_invalid')
  })

  it('warns on an unknown autoplot source', () => {
    const weekly = mutate(WEEKLY, (w) => {
      w.autoplot.source = 'subgraph'
    })
    expect(warningCodes(parseWith(DAILY, weekly))).toContain('autoplot_source_unknown')
  })
})

describe('crossCheckWithMgi', () => {
  const study = parseWith()
  const mgi = (overrides: Partial<MgiStaticLevels> = {}): MgiStaticLevels => ({
    symbol: 'NQU26',
    daily: { jobPivot: 29393.5 },
    weekly: { jobPivot: 29488 },
    ...overrides,
  })

  it('passes when both pivots match within the tick tolerance and the contract agrees', () => {
    const check = crossCheckWithMgi(study, mgi())
    expect(check.ok).toBe(true)
    expect(check.toleranceTicks).toBe(MGI_CROSS_CHECK_TOLERANCE_TICKS)
    expect(check.daily).toEqual({
      status: 'match',
      studyPivot: 29393.5,
      mgiPivot: 29393.5,
      diffTicks: 0,
    })
    expect(check.weekly.status).toBe('match')
    expect(check.symbol).toEqual({ status: 'match', study: 'NQU6.CME', mgi: 'NQU26' })
  })

  it('tolerates exactly one tick of drift by default', () => {
    const check = crossCheckWithMgi(study, mgi({ daily: { jobPivot: 29393.75 } }))
    expect(check.daily.status).toBe('match')
    expect(check.daily.diffTicks).toBe(1)
    expect(check.ok).toBe(true)
  })

  it('fails on a daily mismatch beyond tolerance and reports the diff in ticks', () => {
    const check = crossCheckWithMgi(study, mgi({ daily: { jobPivot: 29394.25 } }))
    expect(check.ok).toBe(false)
    expect(check.daily).toEqual({
      status: 'mismatch',
      studyPivot: 29393.5,
      mgiPivot: 29394.25,
      diffTicks: 3,
    })
    expect(check.weekly.status).toBe('match')
  })

  it('fails on a weekly mismatch', () => {
    const check = crossCheckWithMgi(study, mgi({ weekly: { jobPivot: 29500 } }))
    expect(check.ok).toBe(false)
    expect(check.weekly.status).toBe('mismatch')
  })

  it('reports a missing or 0.00-placeholder MGI pivot as mgi_missing (not a mismatch)', () => {
    const check = crossCheckWithMgi(study, mgi({ daily: { jobPivot: 0 }, weekly: {} }))
    expect(check.daily).toEqual({
      status: 'mgi_missing',
      studyPivot: 29393.5,
      mgiPivot: null,
      diffTicks: null,
    })
    expect(check.weekly.status).toBe('mgi_missing')
    expect(check.ok).toBe(false)
  })

  it('flags an MGI export on a different contract, and an MGI without a symbol', () => {
    const rolled = crossCheckWithMgi(study, mgi({ symbol: 'NQZ26' }))
    expect(rolled.symbol.status).toBe('mismatch')
    expect(rolled.ok).toBe(false)
    const unknown = crossCheckWithMgi(study, mgi({ symbol: undefined }))
    expect(unknown.symbol).toEqual({ status: 'mgi_missing', study: 'NQU6.CME', mgi: null })
    expect(unknown.ok).toBe(true)
  })

  it('honours a caller-supplied tolerance', () => {
    const check = crossCheckWithMgi(study, mgi({ daily: { jobPivot: 29394.25 } }), 3)
    expect(check.daily.status).toBe('match')
    expect(check.ok).toBe(true)
  })
})

describe('JobStudyParseError', () => {
  it('collects every invariant failure into one error with structured issues', () => {
    const daily = mutate(DAILY, (d) => {
      d.dailyPivots[0].pivot = 29393.6
      d.dailyPivots[1].sessionDate = '2026-08-25'
      d.balanceAreas[0].low = 0
    })
    const err = expectError(() => parseWith(daily), 'tick_misaligned')
    const codes = err.issues.map((i) => i.code)
    expect(codes).toContain('future_session')
    expect(codes).toContain('price_sentinel')
    expect(err.code).toBe(codes[0])
    expect(err.name).toBe('JobStudyParseError')
    expect(err.message).toContain('job-study')
  })
})
