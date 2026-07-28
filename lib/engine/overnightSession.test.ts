import { describe, expect, it } from 'vitest'
import type { HtfBar } from './parseHtfBars'
import { computeOvernightSession } from './overnightSession'

/** One 30-min bar at a chart-time datetime, open=close=v, high=v+1, low=v−1. */
const bar = (dateTime: string, v: number, hi = v + 1, lo = v - 1): HtfBar => ({
  dateTime: new Date(dateTime),
  open: v,
  high: hi,
  low: lo,
  close: v,
  volume: 1000,
  bidVolume: 500,
  askVolume: 500,
  delta: 0,
})

/** A full overnight (17:00 prev day → 08:00) plus optional RTH bars. */
function overnightPlusRth(): HtfBar[] {
  return [
    bar('2026-07-27T17:00:00', 28000, 28010, 27995), // Globex open — evening of the 27th
    bar('2026-07-27T20:00:00', 28020, 28060, 28015), // overnight high 28060
    bar('2026-07-28T03:00:00', 27990, 27995, 27940), // overnight low 27940
    bar('2026-07-28T08:00:00', 27980, 27985, 27960), // last pre-open bar
    bar('2026-07-28T08:30:00', 27985, 28005, 27970), // RTH open
    bar('2026-07-28T09:00:00', 27995, 28030, 27990), // RTH high 28030
    bar('2026-07-28T09:30:00', 28010, 28015, 27950), // RTH low 27950
  ]
}

describe('computeOvernightSession', () => {
  it('throws on empty input', () => {
    expect(() => computeOvernightSession([], null)).toThrow(/at least one/)
  })

  it('returns null on an RTH-only export (no overnight bars for the trading day)', () => {
    const rthOnly = [
      bar('2026-07-28T08:30:00', 28000),
      bar('2026-07-28T09:00:00', 28010),
    ]
    expect(computeOvernightSession(rthOnly, 28000)).toBeNull()
  })

  it('splits the trading day into overnight and RTH-so-far at 08:30 chart time', () => {
    const facts = computeOvernightSession(overnightPlusRth(), 28000)!
    expect(facts.sessionDate).toBe('2026-07-28')
    expect(facts.overnight).toEqual({
      high: 28060,
      low: 27940,
      rangePts: 120,
      open: 28000,
      close: 27980,
      highTime: '2026-07-27 20:00',
      lowTime: '2026-07-28 03:00',
      barCount: 4,
    })
    expect(facts.rthSoFar).toEqual({
      open: 27985,
      high: 28030,
      low: 27950,
      rangePts: 80,
      barCount: 3,
    })
  })

  it('reports signed distances from the overnight extremes', () => {
    const facts = computeOvernightSession(overnightPlusRth(), 28000)!
    expect(facts.currentVsOvernight).toEqual({
      fromOnHighPts: -60, // 28000 − 28060
      fromOnLowPts: 60, // 28000 − 27940
    })
  })

  it('degrades the distance fact to null without a current price', () => {
    const facts = computeOvernightSession(overnightPlusRth(), null)!
    expect(facts.currentVsOvernight).toBeNull()
  })

  it('reports rthSoFar as null before the open', () => {
    const preOpen = overnightPlusRth().slice(0, 4)
    const facts = computeOvernightSession(preOpen, 27980)!
    expect(facts.sessionDate).toBe('2026-07-28')
    expect(facts.rthSoFar).toBeNull()
    expect(facts.overnight.barCount).toBe(4)
  })

  it('rolls bars at/after 17:00 into the NEXT trading day (Sunday reopen → Monday session)', () => {
    const sundayEvening = [
      bar('2026-07-26T17:00:00', 28100, 28120, 28090), // Sunday 17:00 — Monday's overnight
      bar('2026-07-26T23:30:00', 28110, 28115, 28080),
    ]
    const facts = computeOvernightSession(sundayEvening, 28100)!
    expect(facts.sessionDate).toBe('2026-07-27')
    expect(facts.overnight.high).toBe(28120)
    expect(facts.overnight.low).toBe(28080)
    expect(facts.rthSoFar).toBeNull()
  })

  it('scopes the session to the LAST bar’s trading day, ignoring prior days', () => {
    const twoDays = [
      // Prior trading day (the 27th): overnight + RTH
      bar('2026-07-26T17:00:00', 28200, 28300, 28190),
      bar('2026-07-27T09:00:00', 28250, 28260, 28100),
      // Current trading day (the 28th)
      ...overnightPlusRth(),
    ]
    const facts = computeOvernightSession(twoDays, 28000)!
    expect(facts.sessionDate).toBe('2026-07-28')
    // The 27th's wider extremes must not leak into the 28th's overnight read.
    expect(facts.overnight.high).toBe(28060)
    expect(facts.overnight.low).toBe(27940)
  })
})
