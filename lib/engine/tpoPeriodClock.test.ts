import { describe, expect, it } from 'vitest'
import type { TpoMeta } from './parseTpo'
import { buildTpoPeriodClock, resolveTpoPeriodTime, TPO_PERIOD_LETTERS } from './tpoPeriodClock'

const meta = (overrides: Partial<TpoMeta> = {}): TpoMeta => ({
  sessionDate: '2026-06-16',
  session: 'RTH',
  tpoPeriodMinutes: 30,
  tickSize: 0.25,
  binSize: 8,
  step: 2,
  firstPeriod: { letter: 'A', start: '2026-06-16 08:30:00' },
  ...overrides,
})

const anchor = { letter: 'A', start: '2026-06-16 08:30:00' }

describe('resolveTpoPeriodTime', () => {
  it('places the first letter at the anchor instant', () => {
    expect(resolveTpoPeriodTime(anchor, 30, 'A')).toEqual({
      letter: 'A',
      index: 0,
      start: '2026-06-16 08:30:00',
      end: '2026-06-16 09:00:00',
      clock: '08:30',
    })
  })

  it('advances one period length per letter', () => {
    expect(resolveTpoPeriodTime(anchor, 30, 'D')?.clock).toBe('10:00')
    expect(resolveTpoPeriodTime(anchor, 30, 'M')).toMatchObject({
      index: 12,
      start: '2026-06-16 14:30:00',
      end: '2026-06-16 15:00:00',
      clock: '14:30',
    })
  })

  it('honours a non-30-minute period length', () => {
    expect(resolveTpoPeriodTime(anchor, 60, 'D')?.clock).toBe('11:30')
    expect(resolveTpoPeriodTime(anchor, 5, 'D')?.clock).toBe('08:45')
  })

  it('continues into lowercase letters and across midnight', () => {
    // Globex-anchored ETH session: 'a' is the 27th period.
    const eth = { letter: 'A', start: '2026-06-15 17:00:00' }
    expect(resolveTpoPeriodTime(eth, 30, 'a')).toMatchObject({
      index: 26,
      start: '2026-06-16 06:00:00',
      clock: '06:00',
    })
  })

  it('anchors on a first letter other than A', () => {
    expect(resolveTpoPeriodTime({ letter: 'C', start: '2026-06-16 08:30:00' }, 30, 'E')).toMatchObject({
      index: 2,
      clock: '09:30',
    })
  })

  it.each([
    ['no anchor (older bundle)', null, 30, 'B'],
    ['zero period length', anchor, 0, 'B'],
    ['negative period length', anchor, -30, 'B'],
    ['non-letter', anchor, 30, '1'],
    ['empty letter', anchor, 30, ''],
    ['multi-character letter', anchor, 30, 'AB'],
  ])('returns null for %s', (_name, a, minutes, letter) => {
    expect(resolveTpoPeriodTime(a, minutes, letter)).toBeNull()
  })

  it('returns null for a letter that precedes the anchor letter', () => {
    expect(resolveTpoPeriodTime({ letter: 'C', start: '2026-06-16 08:30:00' }, 30, 'B')).toBeNull()
  })

  it('returns null for a malformed anchor timestamp', () => {
    expect(resolveTpoPeriodTime({ letter: 'A', start: 'not-a-time' }, 30, 'B')).toBeNull()
  })

  it('covers 52 periods, uppercase before lowercase', () => {
    expect(TPO_PERIOD_LETTERS).toHaveLength(52)
    expect(TPO_PERIOD_LETTERS.slice(25, 27)).toBe('Za')
  })
})

describe('buildTpoPeriodClock', () => {
  it('resolves every letter in the ladder, deduped and in period order', () => {
    const clock = buildTpoPeriodClock(meta(), ['CB', 'A', 'B', ''])
    expect(clock.map((p) => [p.letter, p.clock])).toEqual([
      ['A', '08:30'],
      ['B', '09:00'],
      ['C', '09:30'],
    ])
  })

  it('is empty when the export carries no anchor', () => {
    expect(buildTpoPeriodClock(meta({ firstPeriod: null }), ['ABC'])).toEqual([])
  })

  it('drops unresolvable letters instead of throwing', () => {
    expect(
      buildTpoPeriodClock(meta({ firstPeriod: { letter: 'C', start: '2026-06-16 08:30:00' } }), [
        'ABCD',
      ]).map((p) => p.letter),
    ).toEqual(['C', 'D'])
  })
})
