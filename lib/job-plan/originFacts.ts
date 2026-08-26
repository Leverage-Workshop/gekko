import { MINUTE_MS, minutesBetween } from './chartClock'
import type {
  AcceptanceFact,
  BandOriginFacts,
  ConfluenceBand,
  Excursion,
  ExcursionDirection,
  HoldingSideFact,
  InteractionFact,
  ObservationScope,
} from './contextTypes'
import { measureApproachFailure } from './approachFailure'
import type { Observation, ObservedBar } from './observedBars'
import {
  HOLDING_WINDOW_MINUTES,
  r5FailedLook,
  r5Grade,
  r6Accepted,
  r8HoldingSide,
  r9TriggerStatus,
} from './rules'

/**
 * Step 3 of the level-production procedure (feat-126): the ORIGIN facts per
 * band — what was looked at and failed (R5), what is being accepted (R6),
 * what could not even be reached (R7), which side is being held (R8) and
 * what has already interacted this session (R9). Snapshot-observed from the
 * completed exec bars at/before `asOf`, in WALL-CLOCK minutes on their
 * timestamps; every fact is stamped `asOf` and scoped overnight vs session.
 *
 * An EXCURSION (R5) opens on the first PRINT beyond a band edge from the
 * edge's ORIGINAL side — the previous completed close was at/inside that edge,
 * so the window's first bar can never open one — and closes on the first
 * completed CLOSE back on that side. Closed within 30 min → failed look
 * (graded EARLY / LATE); closed later → extended return (neither); still open
 * → `open`. ACCEPTANCE (R6) is the trailing run of completed closes beyond
 * the band ending at the last completed bar, however it started (price that
 * has sat beyond the band since the window opened is accepted from its first
 * bar); a single close back inside breaks the run and hands the excursion to
 * R5.
 */

type Band = Pick<ConfluenceBand, 'id' | 'low' | 'high'>

function scanExcursions(
  bars: readonly ObservedBar[],
  band: Band,
  direction: ExcursionDirection,
  rthOpenMs: number,
  lastMs: number,
): Excursion[] {
  const beyond = (bar: ObservedBar): boolean => (direction === 'above' ? bar.high > band.high : bar.low < band.low)
  const closedBack = (bar: ObservedBar): boolean =>
    direction === 'above' ? bar.close <= band.high : bar.close >= band.low
  const onOriginalSide = (prev: ObservedBar | undefined): boolean => prev !== undefined && closedBack(prev)
  const extremeOf = (bar: ObservedBar): number => (direction === 'above' ? bar.high : bar.low)
  const further = (a: number, b: number): number => (direction === 'above' ? Math.max(a, b) : Math.min(a, b))

  type Open = { readonly start: ObservedBar; readonly extreme: number }
  const excursions: Excursion[] = []
  let open: Open | null = null
  const close = (start: ObservedBar, extreme: number, end: ObservedBar | null): Excursion => {
    const minutes = minutesBetween(start.ms, end ? end.ms : lastMs)
    const outcome = end === null ? 'open' : r5FailedLook(minutes) ? 'failed-look' : 'extended-return'
    return {
      direction,
      startedAt: start.wall,
      endedAt: end?.wall ?? null,
      minutes,
      scope: start.scope,
      outcome,
      grade: outcome === 'failed-look' ? r5Grade(start.ms, rthOpenMs) : null,
      extremePrice: extreme,
    }
  }

  for (const [i, bar] of bars.entries()) {
    if (open === null && !(beyond(bar) && onOriginalSide(bars[i - 1]))) continue
    const current: Open =
      open === null
        ? { start: bar, extreme: extremeOf(bar) }
        : { start: open.start, extreme: further(open.extreme, extremeOf(bar)) }
    if (closedBack(bar)) {
      excursions.push(close(current.start, current.extreme, bar))
      open = null
    } else {
      open = current
    }
  }
  if (open !== null) excursions.push(close(open.start, open.extreme, null))
  return excursions
}

/** R6: the trailing run of completed closes beyond the band, measured to the last completed bar. */
function acceptance(bars: readonly ObservedBar[], band: Band): AcceptanceFact {
  const last = bars.at(-1)
  const direction: ExcursionDirection | null =
    last === undefined ? null : last.close > band.high ? 'above' : last.close < band.low ? 'below' : null
  if (last === undefined || direction === null) {
    return { state: 'none', direction: null, sinceAt: null, minutes: 0, scope: null }
  }
  const beyond = (bar: ObservedBar): boolean => (direction === 'above' ? bar.close > band.high : bar.close < band.low)
  let start = bars.length - 1
  while (start > 0 && beyond(bars[start - 1])) start -= 1
  const minutes = minutesBetween(bars[start].ms, last.ms)
  return {
    state: r6Accepted(minutes) ? 'accepted' : 'testing',
    direction,
    sinceAt: bars[start].wall,
    minutes,
    scope: bars[start].scope,
  }
}

function holdingSide(bars: readonly ObservedBar[], band: Band, asOfMs: number): HoldingSideFact | null {
  const window = bars.filter((bar) => bar.ms >= asOfMs - HOLDING_WINDOW_MINUTES * MINUTE_MS)
  const side = r8HoldingSide(window.map((bar) => bar.close), band.low, band.high)
  if (side === null) return null
  const scopes = new Set<ObservationScope>(window.map((bar) => bar.scope))
  return {
    side,
    windowMinutes: HOLDING_WINDOW_MINUTES,
    closes: window.length,
    scope: scopes.size === 1 ? window[0].scope : 'mixed',
    from: window[0].wall,
    to: window[window.length - 1].wall,
  }
}

const overlaps = (bar: ObservedBar, band: Band): boolean => bar.low <= band.high && bar.high >= band.low

/** A defense: a print into the band that closes back out on the side it came from. */
function isDefense(prev: ObservedBar, bar: ObservedBar, band: Band): boolean {
  if (!overlaps(bar, band)) return false
  return (prev.close < band.low && bar.close < band.low) || (prev.close > band.high && bar.close > band.high)
}

function interaction(
  bars: readonly ObservedBar[],
  band: Band,
  excursions: readonly Excursion[],
): InteractionFact {
  const session = bars.filter((bar) => bar.scope === 'session')
  const prints = session.filter((bar) => overlaps(bar, band))
  const defenses = { session: 0, overnight: 0 }
  for (let i = 1; i < bars.length; i++) {
    if (isDefense(bars[i - 1], bars[i], band)) defenses[bars[i].scope] += 1
  }
  const failedLookThisSession = excursions.some((e) => e.outcome === 'failed-look' && e.scope === 'session')
  return {
    interacted: prints.length > 0,
    prints: prints.length,
    firstAt: prints[0]?.wall ?? null,
    lastAt: prints.at(-1)?.wall ?? null,
    defenses,
    failedLookThisSession,
    triggerStatus: r9TriggerStatus({
      interactedThisSession: prints.length > 0,
      failedLookThisSession,
      defendedThisSession: defenses.session > 0,
    }),
  }
}

export function bandOriginFacts(band: Band, observation: Observation, merge: number): BandOriginFacts {
  const { bars, asOfMs, rthOpenMs } = observation
  const lastMs = bars.at(-1)?.ms ?? asOfMs
  const excursions = [
    ...scanExcursions(bars, band, 'above', rthOpenMs, lastMs),
    ...scanExcursions(bars, band, 'below', rthOpenMs, lastMs),
  ].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.direction.localeCompare(b.direction))
  const failedLooks = excursions.filter((e) => e.outcome === 'failed-look')
  return {
    bandId: band.id,
    asOf: observation.coverage.asOf,
    holdingSide: holdingSide(bars, band, asOfMs),
    excursions,
    latestFailedLook: failedLooks.at(-1) ?? null,
    acceptance: acceptance(bars, band),
    approachFailure: measureApproachFailure(bars, band, asOfMs, merge),
    interaction: interaction(bars, band, excursions),
  }
}

export function classifyOrigin(bands: readonly ConfluenceBand[], observation: Observation, merge: number) {
  return { coverage: observation.coverage, bands: bands.map((band) => bandOriginFacts(band, observation, merge)) }
}
