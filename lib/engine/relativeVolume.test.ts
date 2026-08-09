import { describe, expect, it } from 'vitest'
import type { DailyValueArea } from './parseDailyValueAreas'
import type { HtfBar } from './parseHtfBars'
import {
  RTH_CLOSE_MINUTES,
  RVOL_BASELINE_LOOKBACK_SESSIONS,
  RVOL_DEAD_MAX,
  RVOL_ELEVATED_MAX,
  RVOL_LIGHT_MAX,
  RVOL_MIN_DAILY_SESSIONS,
  RVOL_MIN_SLOT_SESSIONS,
  RVOL_NORMAL_MAX,
  RVOL_REPORTED_SLOTS,
  classifyRvol,
  computeRelativeVolume,
  computeSlotBaselines,
  expectedRthVolumeThrough,
  rvolGate,
} from './relativeVolume'

/** 30-min bar at a chart-local date/time; only volume matters for these reads. */
const bar = (dateTime: string, volume: number): HtfBar => ({
  dateTime: new Date(dateTime),
  open: 30000,
  high: 30010,
  low: 29990,
  close: 30005,
  volume,
  bidVolume: volume / 2,
  askVolume: volume / 2,
  delta: 0,
})

/** RTH slot starts (chart time) used across the fixtures: 08:30 … 11:00. */
const SLOTS = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00'] as const

/** Calendar date `offset` days after 2026-06-01, as `YYYY-MM-DD`. */
function day(offset: number): string {
  const d = new Date(2026, 5, 1 + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * `sessions` prior trading days ending 2026-06-30, each printing `perSlot` in
 * every RTH slot from 08:30 through the slot at index `slotsPerDay - 1`,
 * oldest first — so the history never collides with today (2026-07-01).
 */
function history(sessions: number, perSlot: number, slotsPerDay: number = SLOTS.length): HtfBar[] {
  const bars: HtfBar[] = []
  for (let d = sessions - 1; d >= 0; d--) {
    const date = day(29 - d)
    for (let s = 0; s < slotsPerDay; s++) {
      bars.push(bar(`${date}T${SLOTS[s]}:00`, perSlot))
    }
  }
  return bars
}

/** Today's completed slots plus the mandatory in-progress final bar. */
function today(volumes: readonly number[], date = '2026-07-01'): HtfBar[] {
  const bars = volumes.map((v, i) => bar(`${date}T${SLOTS[i]}:00`, v))
  // parseHtfBars always ships the in-progress bar last; it must be ignored.
  bars.push(bar(`${date}T${SLOTS[volumes.length]}:00`, 1))
  return bars
}

const dailySession = (date: string, sessionVolume: number): DailyValueArea => ({
  date,
  poc: 30000,
  vah: 30050,
  val: 29950,
  sessionHigh: 30100,
  sessionLow: 29900,
  sessionVolume,
})

describe('classifyRvol / rvolGate', () => {
  it('places each ratio in the band its constant defines', () => {
    expect(classifyRvol(RVOL_DEAD_MAX - 0.01)).toBe('dead')
    expect(classifyRvol(RVOL_DEAD_MAX)).toBe('light')
    expect(classifyRvol(RVOL_LIGHT_MAX - 0.01)).toBe('light')
    expect(classifyRvol(RVOL_LIGHT_MAX)).toBe('normal')
    expect(classifyRvol(1)).toBe('normal')
    expect(classifyRvol(RVOL_NORMAL_MAX)).toBe('normal')
    expect(classifyRvol(RVOL_NORMAL_MAX + 0.01)).toBe('elevated')
    expect(classifyRvol(RVOL_ELEVATED_MAX)).toBe('elevated')
    expect(classifyRvol(RVOL_ELEVATED_MAX + 0.01)).toBe('heavy')
  })

  it('gates other order-flow signals off the same bands', () => {
    expect(rvolGate('dead')).toBe('discount')
    expect(rvolGate('light')).toBe('discount')
    expect(rvolGate('normal')).toBe('neutral')
    expect(rvolGate('elevated')).toBe('confirming')
    expect(rvolGate('heavy')).toBe('confirming')
  })
})

describe('computeSlotBaselines', () => {
  it('takes a per-slot median across sessions, robust to a single outlier day', () => {
    const bars = [
      ...history(10, 1000, 1),
      // One news day at 10x in the 08:30 slot — the median must not move.
      bar('2026-06-11T08:30:00', 10000),
    ]
    const baselines = computeSlotBaselines(bars)
    expect(baselines).toHaveLength(1)
    expect(baselines[0].slot).toBe('08:30')
    expect(baselines[0].sessions).toBe(11)
    expect(baselines[0].medianVolume).toBe(1000)
  })

  it('excludes the named trading day so a session is never its own baseline', () => {
    const bars = [...history(10, 1000, 1), bar('2026-07-01T08:30:00', 9999)]
    const baselines = computeSlotBaselines(bars, { excludeTradingDay: '2026-07-01' })
    expect(baselines[0].sessions).toBe(10)
    expect(baselines[0].medianVolume).toBe(1000)
  })

  it('caps each slot at the most recent lookback sessions', () => {
    const bars = [
      ...history(RVOL_BASELINE_LOOKBACK_SESSIONS + 20, 1000, 1),
    ]
    const baselines = computeSlotBaselines(bars)
    expect(baselines[0].sessions).toBe(RVOL_BASELINE_LOOKBACK_SESSIONS)
  })

  it('ignores non-positive volumes', () => {
    const baselines = computeSlotBaselines([...history(10, 1000, 1), bar('2026-06-20T08:30:00', 0)])
    expect(baselines[0].sessions).toBe(10)
  })

  it('returns slots sorted by time of day', () => {
    const baselines = computeSlotBaselines(history(10, 1000))
    expect(baselines.map((b) => b.slot)).toEqual([...SLOTS])
  })
})

describe('expectedRthVolumeThrough', () => {
  it('accumulates the covered slots and expresses them as a fraction of the RTH day', () => {
    const baselines = computeSlotBaselines(history(RVOL_MIN_SLOT_SESSIONS, 1000))
    // Through 09:30 = 3 of the 6 slots.
    const expectation = expectedRthVolumeThrough(baselines, 9 * 60 + 30)
    expect(expectation).not.toBeNull()
    expect(expectation?.expectedVolume).toBe(3000)
    expect(expectation?.slotsCovered).toBe(3)
    expect(expectation?.slotsTotal).toBe(SLOTS.length)
    expect(expectation?.expectedFraction).toBe(0.5)
    expect(expectation?.coveredSlotMinutes).toEqual([510, 540, 570])
  })

  it('drops slots whose history is below the minimum', () => {
    const baselines = computeSlotBaselines(history(RVOL_MIN_SLOT_SESSIONS - 1, 1000))
    expect(expectedRthVolumeThrough(baselines, RTH_CLOSE_MINUTES)).toBeNull()
  })

  it('ignores overnight slots — the expectation is an RTH curve', () => {
    const bars = [...history(RVOL_MIN_SLOT_SESSIONS, 1000)]
    for (let d = 0; d < RVOL_MIN_SLOT_SESSIONS; d++) {
      bars.push(bar(`2026-06-${String(1 + d).padStart(2, '0')}T03:00:00`, 5000))
    }
    const baselines = computeSlotBaselines(bars)
    expect(expectedRthVolumeThrough(baselines, RTH_CLOSE_MINUTES)?.expectedVolume).toBe(6000)
  })
})

describe('computeRelativeVolume', () => {
  it('throws on empty input', () => {
    expect(() => computeRelativeVolume({ bars: [] })).toThrow(/at least one bar/)
  })

  it('reads the latest completed slot against its own history', () => {
    const bars = [...history(20, 1000), ...today([1000, 1000, 1400])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.sessionDate).toBe('2026-07-01')
    expect(facts.current?.slot).toBe('09:30')
    expect(facts.current?.volume).toBe(1400)
    expect(facts.current?.baselineVolume).toBe(1000)
    expect(facts.current?.baselineSessions).toBe(20)
    expect(facts.current?.rvol).toBe(1.4)
    expect(facts.current?.band).toBe('elevated')
  })

  it('never measures the in-progress final bar', () => {
    const bars = [...history(20, 1000), ...today([1000, 1000])]
    const facts = computeRelativeVolume({ bars })
    // today() appends a 1-contract in-progress bar at 09:30 — a 0.001x read if used.
    expect(facts.recentSlots.map((s) => s.slot)).toEqual(['09:00', '08:30'])
    expect(facts.current?.slot).toBe('09:00')
  })

  it('reports the recent slots newest first, capped at the window', () => {
    const bars = [
      ...history(20, 1000, SLOTS.length),
      ...today([1000, 1000, 1000, 1000, 1000]),
    ]
    const facts = computeRelativeVolume({ bars })
    expect(facts.recentSlots).toHaveLength(Math.min(RVOL_REPORTED_SLOTS, 5))
    expect(facts.recentSlots[0].slot).toBe('10:30')
  })

  it('degrades a slot to null rvol when its history is too thin', () => {
    const bars = [...history(RVOL_MIN_SLOT_SESSIONS - 1, 1000), ...today([1000, 3000])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.recentSlots[0].rvol).toBeNull()
    expect(facts.recentSlots[0].band).toBeNull()
    expect(facts.recentSlots[0].baselineVolume).toBeNull()
    expect(facts.current).toBeNull()
    expect(facts.sessionSoFar).toBeNull()
    expect(facts.participation).toBeNull()
  })

  it('falls back to an older completed slot when the newest has no baseline', () => {
    // 10:00 exists only today (no history), 08:30/09:00/09:30 have 20 sessions.
    const bars = [...history(20, 1000, 3), ...today([1000, 1000, 1000, 2000])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.recentSlots[0].slot).toBe('10:00')
    expect(facts.recentSlots[0].rvol).toBeNull()
    expect(facts.current?.slot).toBe('09:30')
    expect(facts.participation?.source).toBe('slot')
  })

  it('aggregates session-so-far against the time-of-day expectation', () => {
    const bars = [...history(20, 1000), ...today([1200, 1200, 1200])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.sessionSoFar?.throughSlot).toBe('09:30')
    expect(facts.sessionSoFar?.volume).toBe(3600)
    expect(facts.sessionSoFar?.expectedVolume).toBe(3000)
    expect(facts.sessionSoFar?.expectedFraction).toBe(0.5)
    expect(facts.sessionSoFar?.rvol).toBe(1.2)
    expect(facts.sessionSoFar?.band).toBe('normal')
  })

  it('sums only the slots the expectation covers', () => {
    // 10:00 has no history, so today's 10:00 volume must stay out of BOTH sides.
    const bars = [...history(20, 1000, 3), ...today([1000, 1000, 1000, 9000])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.sessionSoFar?.slotsCovered).toBe(3)
    expect(facts.sessionSoFar?.volume).toBe(3000)
    expect(facts.sessionSoFar?.expectedVolume).toBe(3000)
    expect(facts.sessionSoFar?.rvol).toBe(1)
  })

  it('prefers the slot read for the participation scalar and gates off its band', () => {
    const bars = [...history(20, 1000), ...today([1000, 1000, 600])]
    const facts = computeRelativeVolume({ bars })
    expect(facts.participation?.source).toBe('slot')
    expect(facts.participation?.rvol).toBe(0.6)
    expect(facts.participation?.band).toBe('light')
    expect(facts.participation?.gate).toBe('discount')
    expect(facts.participation?.basis).toContain('09:30')
  })

  it('measures a live daily SessionVolume against the elapsed-time expectation', () => {
    const bars = [...history(20, 1000), ...today([1000, 1000, 1000])]
    const daily = [
      // Row 1 is the in-progress session (today), as the live export ships it.
      dailySession('2026-07-01', 200_000),
      ...Array.from({ length: RVOL_MIN_DAILY_SESSIONS }, (_, i) =>
        dailySession(`2026-06-${String(20 - i).padStart(2, '0')}`, 400_000),
      ),
    ]
    const facts = computeRelativeVolume({ bars, dailySessions: daily })
    expect(facts.daily?.inProgress).toBe(true)
    expect(facts.daily?.medianSessionVolume).toBe(400_000)
    expect(facts.daily?.expectedFraction).toBe(0.5)
    expect(facts.daily?.expectedVolume).toBe(200_000)
    // Raw 200k/400k would read 0.5x ("dead") at half a session elapsed.
    expect(facts.daily?.rvol).toBe(1)
    expect(facts.daily?.band).toBe('normal')
  })

  it('measures a completed daily row against the whole-session median', () => {
    const bars = [...history(20, 1000), ...today([1000])]
    const daily = [
      dailySession('2026-06-30', 320_000),
      ...Array.from({ length: RVOL_MIN_DAILY_SESSIONS }, (_, i) =>
        dailySession(`2026-06-${String(29 - i).padStart(2, '0')}`, 400_000),
      ),
    ]
    const facts = computeRelativeVolume({ bars, dailySessions: daily })
    expect(facts.daily?.inProgress).toBe(false)
    expect(facts.daily?.expectedFraction).toBe(1)
    expect(facts.daily?.rvol).toBe(0.8)
    expect(facts.daily?.band).toBe('normal')
  })

  it('nulls the daily read without enough completed sessions', () => {
    const bars = [...history(20, 1000), ...today([1000])]
    const daily = Array.from({ length: RVOL_MIN_DAILY_SESSIONS }, (_, i) =>
      dailySession(`2026-06-${String(30 - i).padStart(2, '0')}`, 400_000),
    )
    expect(computeRelativeVolume({ bars, dailySessions: daily }).daily).toBeNull()
    expect(computeRelativeVolume({ bars }).daily).toBeNull()
  })

  it('falls back to the daily scalar when no intraday slot has a baseline', () => {
    // Only the in-progress bar belongs to today, so there is no completed slot.
    const bars = [...history(20, 1000), bar('2026-07-01T08:30:00', 1000)]
    const daily = [
      dailySession('2026-06-30', 500_000),
      ...Array.from({ length: RVOL_MIN_DAILY_SESSIONS }, (_, i) =>
        dailySession(`2026-06-${String(29 - i).padStart(2, '0')}`, 400_000),
      ),
    ]
    const facts = computeRelativeVolume({ bars, dailySessions: daily })
    expect(facts.current).toBeNull()
    expect(facts.sessionSoFar).toBeNull()
    expect(facts.participation?.source).toBe('daily')
    expect(facts.participation?.rvol).toBe(1.25)
    expect(facts.participation?.gate).toBe('neutral')
  })

  it('reproduces the review measurement shape: heavy morning, light lunch', () => {
    const bars = [...history(20, 1000), ...today([1130, 1250, 1260, 730, 920])]
    const facts = computeRelativeVolume({ bars })
    const byslot = Object.fromEntries(facts.recentSlots.map((s) => [s.slot, s.rvol]))
    expect(byslot).toEqual({
      '08:30': 1.13,
      '09:00': 1.25,
      '09:30': 1.26,
      '10:00': 0.73,
      '10:30': 0.92,
    })
    expect(facts.recentSlots.find((s) => s.slot === '10:00')?.band).toBe('light')
    expect(facts.recentSlots.find((s) => s.slot === '09:30')?.band).toBe('elevated')
  })
})
