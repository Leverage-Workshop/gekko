import { describe, expect, it } from 'vitest'
import type { DailyValueArea } from './parseDailyValueAreas'
import {
  DEVELOPING_MIN_BASELINE_SESSIONS,
  RTH_SESSION_MINUTES,
  computeDevelopingSession,
} from './developingSession'

/** Completed session builder: a 200-pt range and a 400k whole-session volume. */
const completedSession = (date: string, mid = 29800): DailyValueArea => ({
  date,
  poc: mid,
  vah: mid + 50,
  val: mid - 50,
  sessionHigh: mid + 100,
  sessionLow: mid - 100,
  sessionVolume: 400_000,
})

const completed = Array.from({ length: DEVELOPING_MIN_BASELINE_SESSIONS + 3 }, (_, i) =>
  completedSession(`2026-07-${String(31 - i).padStart(2, '0')}`),
)

/** The live row: 150 pts travelled, 200k done. */
const developing: DailyValueArea = {
  date: '2026-08-06',
  poc: 29520,
  vah: 29620,
  val: 29476.75,
  sessionHigh: 29650,
  sessionLow: 29500,
  sessionVolume: 200_000,
}

/** 11:00 chart time = 150 of the session's 390 RTH minutes. */
const at = (clock: string) => new Date(`2026-08-06T${clock}:00`)

describe('computeDevelopingSession', () => {
  it('reports the developing volume value area with a full maturity qualifier', () => {
    const facts = computeDevelopingSession({
      developing,
      completed,
      currentPrice: 29542.5,
      chartNow: at('11:00'),
      expectedVolumeFraction: 0.5,
    })

    expect(facts.date).toBe('2026-08-06')
    expect(facts.poc).toBe(29520)
    expect(facts.vah).toBe(29620)
    expect(facts.val).toBe(29476.75)
    expect(facts.rangePts).toBe(150)
    // Price sits inside the value area being built RIGHT NOW — which is exactly
    // why this read may never stand in for the prior-day one.
    expect(facts.currentPriceVsDevelopingValue).toEqual({ position: 'inside', pointsOutside: 0 })

    expect(facts.maturity.elapsedRthMinutes).toBe(150)
    expect(facts.maturity.elapsedFraction).toBe(0.38)
    expect(facts.maturity.read).toBe('developing')

    // Volume so far vs the time-of-day expectation (feat-094's expectedFraction
    // × the completed-session median), NOT vs a whole session.
    expect(facts.maturity.volume).toEqual({
      medianSessionVolume: 400_000,
      expectedFraction: 0.5,
      expectedVolume: 200_000,
      ratio: 1,
      band: 'normal',
    })

    // Range used so far vs the completed-session median (200 pts here).
    expect(facts.maturity.range).toEqual({
      medianCompletedRangePts: 200,
      usedFraction: 0.75,
    })
    expect(facts.maturity.basis).toContain('150 of 390 RTH minutes elapsed')
    expect(facts.maturity.basis).toContain('200-pt completed-session median')
  })

  it('reads early right after the open and mature late in the session', () => {
    const early = computeDevelopingSession({
      developing,
      completed,
      currentPrice: null,
      chartNow: at('09:30'),
      expectedVolumeFraction: 0.15,
    })
    expect(early.maturity.elapsedRthMinutes).toBe(60)
    expect(early.maturity.read).toBe('early')
    expect(early.currentPriceVsDevelopingValue).toBeNull()

    const mature = computeDevelopingSession({
      developing,
      completed,
      currentPrice: 29700,
      chartNow: at('14:00'),
      expectedVolumeFraction: 0.9,
    })
    expect(mature.maturity.elapsedRthMinutes).toBe(330)
    expect(mature.maturity.read).toBe('mature')
    expect(mature.currentPriceVsDevelopingValue).toEqual({ position: 'above', pointsOutside: 80 })
  })

  it('clamps the clock to the cash session and never reports negative elapsed time', () => {
    const preOpen = computeDevelopingSession({
      developing,
      completed,
      currentPrice: null,
      chartNow: at('07:15'),
    })
    expect(preOpen.maturity.elapsedRthMinutes).toBe(0)
    expect(preOpen.maturity.elapsedFraction).toBe(0)
    expect(preOpen.maturity.read).toBe('early')

    const afterClose = computeDevelopingSession({
      developing,
      completed,
      currentPrice: null,
      chartNow: at('16:30'),
    })
    expect(afterClose.maturity.elapsedRthMinutes).toBe(RTH_SESSION_MINUTES)
    expect(afterClose.maturity.read).toBe('mature')
  })

  it('flags a session that has already travelled a full normal day', () => {
    const wide = computeDevelopingSession({
      developing: { ...developing, sessionHigh: 29700, sessionLow: 29455 },
      completed,
      currentPrice: null,
      chartNow: at('11:00'),
    })
    expect(wide.rangePts).toBe(245)
    expect(wide.maturity.range).toEqual({
      medianCompletedRangePts: 200,
      usedFraction: 1.23,
    })
  })

  it('degrades each maturity leg independently', () => {
    // No chart clock and no volume expectation: read is unqualified.
    const noClock = computeDevelopingSession({
      developing,
      completed,
      currentPrice: null,
    })
    expect(noClock.maturity.elapsedRthMinutes).toBeNull()
    expect(noClock.maturity.elapsedFraction).toBeNull()
    expect(noClock.maturity.volume).toBeNull()
    expect(noClock.maturity.read).toBe('unknown')
    expect(noClock.maturity.range).not.toBeNull()

    // No clock but a volume expectation: that becomes the qualifier.
    const volumeOnly = computeDevelopingSession({
      developing,
      completed,
      currentPrice: null,
      expectedVolumeFraction: 0.8,
    })
    expect(volumeOnly.maturity.read).toBe('mature')

    // Too little history for either median.
    const thin = computeDevelopingSession({
      developing,
      completed: completed.slice(0, DEVELOPING_MIN_BASELINE_SESSIONS - 1),
      currentPrice: null,
      chartNow: at('11:00'),
      expectedVolumeFraction: 0.5,
    })
    expect(thin.maturity.volume).toBeNull()
    expect(thin.maturity.range).toBeNull()
    expect(thin.maturity.read).toBe('developing')
    expect(thin.maturity.basis).toBe('150 of 390 RTH minutes elapsed')
  })
})
