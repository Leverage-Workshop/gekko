import { describe, expect, it } from 'vitest'
import { wallMsOfString } from '@/lib/job-plan/chartClock'
import { observeBars } from '@/lib/job-plan/observedBars'
import { bandOriginFacts } from '@/lib/job-plan/originFacts'
import { execBars, flatBars, type BarSpec } from './helpers/jobContext'

/**
 * R5–R9 over hand-built 750-volume bars, wall-clock on their timestamps. The
 * band under test is [29400, 29420] (NQ merge 20); RTH opens 08:30; asOf is
 * 10:00 unless stated. Every scenario names the ratified boundary it pins.
 */

const BAND = { id: 'band-01', low: 29400, high: 29420 }
const MERGE = 20
const ms = (wall: string) => wallMsOfString(wall)!

function facts(specs: readonly BarSpec[], asOf = '2026-08-24T10:00:00', inProgress?: BarSpec) {
  const bars = execBars(specs, inProgress ?? [specs[specs.length - 1][0].replace(/:\d{2}$/, ':30'), 29350, 29350, 29350])
  return bandOriginFacts(BAND, observeBars(bars, ms(asOf)), MERGE)
}

const below = (start: string, count: number, step = 1) => flatBars(start, count, step, 29350)

describe('observeBars: what the origin facts may see', () => {
  it('drops the in-progress bar even when it prints beyond the band', () => {
    const f = facts(below('2026-08-24T09:00:00', 30), '2026-08-24T10:00:00', ['2026-08-24T09:30:00', 29450, 29350, 29440])
    expect(f.excursions).toEqual([])
    expect(f.acceptance).toMatchObject({ state: 'accepted', direction: 'below' })
  })

  it('drops bars after asOf and counts them', () => {
    const bars = execBars([...below('2026-08-24T09:00:00', 30), ['2026-08-24T09:45:00', 29450, 29350, 29440], ['2026-08-24T09:50:00', 29450, 29350, 29440]])
    const observation = observeBars(bars, ms('2026-08-24T09:40:00'))
    expect(observation.coverage.excludedBars).toEqual({ inProgress: 1, afterAsOf: 1, priorTradingDays: 0 })
    expect(observation.coverage.lastCompletedBarAt).toBe('2026-08-24T09:29:00')
    expect(bandOriginFacts(BAND, observation, MERGE).excursions).toEqual([])
  })

  it('keeps prior trading days out of the origin window but available to the pivot check', () => {
    const bars = execBars(
      [...below('2026-08-21T09:00:00', 5), ...below('2026-08-23T18:00:00', 3, 30), ...below('2026-08-24T09:00:00', 3)],
      ['2026-08-24T09:03:00', 29351, 29349, 29350],
    )
    const observation = observeBars(bars, ms('2026-08-24T10:00:00'))
    expect(observation.tradingDay).toBe('2026-08-24')
    expect(observation.bars).toHaveLength(6)
    expect(observation.allCompleted).toHaveLength(11)
    expect(observation.coverage.excludedBars.priorTradingDays).toBe(5)
    expect(observation.coverage.overnightBars).toBe(3)
    expect(observation.coverage.sessionBars).toBe(3)
  })

  it('scopes 08:29:59 as overnight and 08:30:00 as session; Sunday 17:00 rolls into Monday', () => {
    const bars = execBars([['2026-08-23T17:00:00', 1, 0, 0], ['2026-08-24T08:29:59', 1, 0, 0], ['2026-08-24T08:30:00', 1, 0, 0]])
    const observation = observeBars(bars, ms('2026-08-24T09:00:00'))
    expect(observation.bars.map((b) => [b.tradingDay, b.scope])).toEqual([
      ['2026-08-24', 'overnight'],
      ['2026-08-24', 'overnight'],
    ])
    expect(observation.coverage.rthOpenAt).toBe('2026-08-24T08:30:00')
  })

  it('reports a pre-open run as session-not-started with the early window closed', () => {
    const observation = observeBars(execBars(below('2026-08-24T06:00:00', 5)), ms('2026-08-24T07:00:00'))
    expect(observation.coverage.sessionStarted).toBe(false)
    expect(observation.coverage.minutesSinceOpen).toBeNull()
    expect(observation.coverage.earlyWindow).toBe(false)
  })

  it('flags the 90-min early window from the RTH open, inclusive of 0 and exclusive of 90', () => {
    const at = (asOf: string) => observeBars(execBars(below('2026-08-24T08:30:00', 3)), ms(asOf)).coverage
    expect(at('2026-08-24T08:30:00')).toMatchObject({ sessionStarted: true, minutesSinceOpen: 0, earlyWindow: true })
    expect(at('2026-08-24T09:59:59')).toMatchObject({ earlyWindow: true })
    expect(at('2026-08-24T10:00:00')).toMatchObject({ minutesSinceOpen: 90, earlyWindow: false })
  })

  it('uses asOf for the trading day when there are no bars at all', () => {
    const observation = observeBars([], ms('2026-08-24T10:00:00'))
    expect(observation.tradingDay).toBe('2026-08-24')
    expect(observation.coverage.lastCompletedBarAt).toBeNull()
    expect(observation.coverage.excludedBars.inProgress).toBe(0)
  })
})

describe('R5 — failed look', () => {
  it('positive: print above, close back within 30 min → EARLY inside the first 90 min of RTH', () => {
    const f = facts([
      ...below('2026-08-24T08:30:00', 30),
      ['2026-08-24T09:00:00', 29430, 29380, 29425],
      ['2026-08-24T09:05:00', 29435, 29410, 29428],
      ['2026-08-24T09:10:00', 29425, 29405, 29415],
      ...below('2026-08-24T09:11:00', 5),
    ])
    expect(f.latestFailedLook).toMatchObject({
      direction: 'above',
      startedAt: '2026-08-24T09:00:00',
      endedAt: '2026-08-24T09:10:00',
      minutes: 10,
      scope: 'session',
      outcome: 'failed-look',
      grade: 'EARLY',
      extremePrice: 29435,
    })
    expect(f.interaction.failedLookThisSession).toBe(true)
  })

  it('boundary: a close back at exactly 30 min is a failed look; at 30.5 it hands off (extended return)', () => {
    const at = (endWall: string) =>
      facts([...below('2026-08-24T08:30:00', 3), ['2026-08-24T09:00:00', 29430, 29380, 29425], [endWall, 29425, 29405, 29415]], '2026-08-24T11:00:00')
    expect(at('2026-08-24T09:30:00').excursions[0]).toMatchObject({ outcome: 'failed-look', minutes: 30 })
    expect(at('2026-08-24T09:30:30').excursions[0]).toMatchObject({ outcome: 'extended-return', minutes: 30.5, grade: null })
    expect(at('2026-08-24T09:30:30').latestFailedLook).toBeNull()
  })

  it('grades LATE when the excursion began at or after open + 90 min', () => {
    const lead = below('2026-08-24T09:30:00', 3)
    const f = facts([...lead, ['2026-08-24T10:00:00', 29430, 29380, 29425], ['2026-08-24T10:05:00', 29425, 29405, 29415]], '2026-08-24T10:30:00')
    expect(f.latestFailedLook).toMatchObject({ grade: 'LATE', scope: 'session' })
    const early = facts([...lead, ['2026-08-24T09:59:00', 29430, 29380, 29425], ['2026-08-24T10:05:00', 29425, 29405, 29415]], '2026-08-24T10:30:00')
    expect(early.latestFailedLook).toMatchObject({ grade: 'EARLY' })
  })

  it('an overnight failed look is scoped overnight and graded LATE, and is not a session fact', () => {
    const f = facts([['2026-08-24T02:00:00', 29412, 29402, 29408], ['2026-08-24T03:00:00', 29409, 29390, 29395], ['2026-08-24T03:20:00', 29412, 29398, 29410]], '2026-08-24T09:00:00')
    expect(f.excursions).toHaveLength(1)
    expect(f.latestFailedLook).toMatchObject({ direction: 'below', scope: 'overnight', grade: 'LATE', minutes: 20 })
    expect(f.interaction.failedLookThisSession).toBe(false)
  })

  it('a same-bar wick beyond that closes back is a 0-minute failed look', () => {
    const f = facts([...below('2026-08-24T09:00:00', 3), ['2026-08-24T09:03:00', 29430, 29350, 29350]])
    expect(f.latestFailedLook).toMatchObject({ minutes: 0, startedAt: '2026-08-24T09:03:00', endedAt: '2026-08-24T09:03:00' })
  })

  it('reports looks below symmetrically and keeps the freshest as latestFailedLook', () => {
    const f = facts([
      ...below('2026-08-24T08:30:00', 3),
      ['2026-08-24T09:00:00', 29430, 29380, 29425],
      ['2026-08-24T09:10:00', 29425, 29405, 29415],
      ['2026-08-24T09:20:00', 29416, 29390, 29395],
      ['2026-08-24T09:25:00', 29410, 29396, 29405],
    ])
    expect(f.excursions.map((e) => [e.direction, e.outcome])).toEqual([['above', 'failed-look'], ['below', 'failed-look']])
    expect(f.latestFailedLook?.direction).toBe('below')
  })
})

describe('R6 — build / hold beyond', () => {
  const accepted = (lastWall: string) => [
    ...below('2026-08-24T09:00:00', 30),
    ...flatBars('2026-08-24T09:30:00', 1 + (ms(lastWall) - ms('2026-08-24T09:30:00')) / 60_000, 1, 29440),
  ]

  it('positive: every completed close beyond for 20 continuous minutes = accepted', () => {
    const f = facts(accepted('2026-08-24T09:50:00'))
    expect(f.acceptance).toEqual({ state: 'accepted', direction: 'above', sinceAt: '2026-08-24T09:30:00', minutes: 20, scope: 'session' })
    expect(f.excursions.at(-1)).toMatchObject({ outcome: 'open', grade: null })
  })

  it('boundary: 19 minutes of closes beyond is still testing', () => {
    expect(facts(accepted('2026-08-24T09:49:00')).acceptance).toMatchObject({ state: 'testing', minutes: 19 })
  })

  it('a single close back inside resets the clock and hands the earlier run to R5', () => {
    const f = facts([
      ...below('2026-08-24T09:00:00', 30),
      ...flatBars('2026-08-24T09:30:00', 16, 1, 29440),
      ['2026-08-24T09:46:00', 29441, 29405, 29410],
      ...flatBars('2026-08-24T09:47:00', 13, 1, 29440),
    ])
    expect(f.excursions.map((e) => e.outcome)).toEqual(['failed-look', 'open'])
    expect(f.excursions[0]).toMatchObject({ startedAt: '2026-08-24T09:30:00', endedAt: '2026-08-24T09:46:00', minutes: 16 })
    expect(f.acceptance).toMatchObject({ state: 'testing', sinceAt: '2026-08-24T09:47:00', minutes: 12 })
  })

  it('measures acceptance to the last COMPLETED bar, not to asOf', () => {
    const f = facts(accepted('2026-08-24T09:45:00'), '2026-08-24T11:00:00')
    expect(f.acceptance).toMatchObject({ state: 'testing', minutes: 15 })
  })

  it('a look that never came from the original side is not an excursion (first bar cannot open one)', () => {
    const f = facts([['2026-08-24T09:00:00', 29450, 29380, 29440], ...flatBars('2026-08-24T09:01:00', 5, 1, 29440)])
    expect(f.excursions).toEqual([])
    expect(f.acceptance).toMatchObject({ state: 'testing', direction: 'above', sinceAt: '2026-08-24T09:00:00', minutes: 5 })
  })

  it('price sitting beyond the band since the window opened reads accepted from the first bar', () => {
    const f = facts(flatBars('2026-08-23T17:00:00', 20, 30, 29440), '2026-08-24T09:00:00')
    expect(f.acceptance).toMatchObject({ state: 'accepted', scope: 'overnight', sinceAt: '2026-08-23T17:00:00' })
  })
})

describe('R7 — approach failure', () => {
  const approach = (closestHigh: number, retreatClose: number, closestWall = '2026-08-24T09:20:00') => [
    ...below('2026-08-24T09:00:00', 20),
    [closestWall, closestHigh, 29340, 29355] as const,
    ...flatBars('2026-08-24T09:21:00', 10, 1, retreatClose),
  ]

  it('positive: within 2× tolerance, never touched, retreated ≥ 1×, closest approach inside 60 min', () => {
    const f = facts(approach(29365, 29340))
    expect(f.approachFailure).toEqual({
      from: 'below',
      closestApproachPts: 35,
      closestApproachAt: '2026-08-24T09:20:00',
      closestPrice: 29365,
      retreatPts: 25,
      minutesSinceClosest: 40,
      scope: 'session',
    })
  })

  it('boundary: gap of exactly 40 and retreat of exactly 20 fire; a tick past either does not', () => {
    expect(facts(approach(29360, 29340)).approachFailure).not.toBeNull()
    expect(facts(approach(29359.75, 29339.75)).approachFailure).toBeNull()
    expect(facts(approach(29365, 29345.25)).approachFailure).toBeNull()
  })

  it('negative: touching the band is not an approach failure', () => {
    expect(facts(approach(29400, 29340)).approachFailure).toBeNull()
  })

  it('negative: a closest approach older than 60 min has gone stale', () => {
    expect(facts(approach(29365, 29340), '2026-08-24T10:20:00').approachFailure).not.toBeNull()
    expect(facts(approach(29365, 29340), '2026-08-24T10:20:30').approachFailure).toBeNull()
  })

  it('an overnight touch does not disqualify a fresh session approach (episode restarts after the last touch)', () => {
    const f = facts([['2026-08-24T03:00:00', 29405, 29380, 29390], ...approach(29365, 29340)])
    expect(f.approachFailure).toMatchObject({ from: 'below', closestApproachAt: '2026-08-24T09:20:00' })
  })

  it('reads an approach from above symmetrically', () => {
    const f = facts([
      ...flatBars('2026-08-24T09:00:00', 20, 1, 29480),
      ['2026-08-24T09:20:00', 29490, 29455, 29475],
      ...flatBars('2026-08-24T09:21:00', 10, 1, 29480),
    ])
    expect(f.approachFailure).toMatchObject({ from: 'above', closestApproachPts: 35, closestPrice: 29455, retreatPts: 25 })
  })
})

describe('R8 — holding side', () => {
  const window = (edgeClose: number) => [
    ...below('2026-08-24T09:00:00', 39),
    ['2026-08-24T09:39:00', 29391, 29389, 29390] as const,
    ['2026-08-24T09:40:00', 29500, 29380, edgeClose] as const,
    ...flatBars('2026-08-24T09:41:00', 19, 1, 29440),
  ]

  it('positive: every close in the last 20 min above the band → ABOVE, session-scoped', () => {
    expect(facts(window(29440)).holdingSide).toEqual({
      side: 'ABOVE',
      windowMinutes: 20,
      closes: 20,
      scope: 'session',
      from: '2026-08-24T09:40:00',
      to: '2026-08-24T09:59:00',
    })
  })

  it('boundary: the bar exactly 20 min before asOf is inside the window', () => {
    expect(facts(window(29390)).holdingSide?.side).toBe('STRADDLING')
  })

  it('BELOW when every recent close is under the band; mixed scope when the window spans the open', () => {
    const f = facts([...below('2026-08-24T08:15:00', 30)], '2026-08-24T08:45:00')
    expect(f.holdingSide).toMatchObject({ side: 'BELOW', scope: 'mixed', closes: 20 })
  })

  it('has no holding side without a completed close in the window', () => {
    expect(facts(below('2026-08-24T09:00:00', 5)).holdingSide).toBeNull()
  })
})

describe('R9 — already-interacted (this RTH session only)', () => {
  it('overnight prints inside the band leave it fresh', () => {
    const f = facts([['2026-08-24T03:00:00', 29410, 29395, 29405], ...below('2026-08-24T09:00:00', 5)])
    expect(f.interaction).toMatchObject({ interacted: false, prints: 0, triggerStatus: 'fresh', firstAt: null })
  })

  it('a session print inside the band that just sits there demotes it', () => {
    const f = facts([...below('2026-08-24T09:00:00', 5), ['2026-08-24T09:05:00', 29410, 29395, 29405], ['2026-08-24T09:06:00', 29412, 29402, 29408]])
    expect(f.interaction).toMatchObject({ interacted: true, prints: 2, firstAt: '2026-08-24T09:05:00', lastAt: '2026-08-24T09:06:00', triggerStatus: 'demoted' })
  })

  it('a defense (print into the band, close back on the arrival side) keeps full trigger status', () => {
    const f = facts([...below('2026-08-24T09:00:00', 5), ['2026-08-24T09:05:00', 29405, 29380, 29390], ...below('2026-08-24T09:06:00', 3)])
    expect(f.interaction).toMatchObject({ defenses: { session: 1, overnight: 0 }, triggerStatus: 'full' })
  })

  it('a failed look keeps full trigger status; overnight defenses are counted separately', () => {
    const f = facts([
      ['2026-08-24T02:50:00', 29351, 29349, 29350],
      ['2026-08-24T03:00:00', 29405, 29380, 29390],
      ...below('2026-08-24T09:00:00', 5),
      ['2026-08-24T09:05:00', 29430, 29395, 29425],
      ['2026-08-24T09:10:00', 29425, 29395, 29415],
      ['2026-08-24T09:11:00', 29418, 29395, 29398],
    ])
    expect(f.interaction).toMatchObject({ failedLookThisSession: true, defenses: { session: 0, overnight: 1 }, triggerStatus: 'full' })
  })

  it('stamps every band fact with asOf', () => {
    expect(facts(below('2026-08-24T09:00:00', 5)).asOf).toBe('2026-08-24T10:00:00')
  })
})
