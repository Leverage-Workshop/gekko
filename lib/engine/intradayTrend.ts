import type { ExecBar } from './parseExecBars'
import type { RipCondition } from './ripStatus'
import type { SessionIntradayFacts, SessionPosition, SessionTrend } from './sessionIntraday'

/**
 * Code-owned composite intraday trend (feat-064) — the trend read at the
 * operator's trade horizon (minutes), synthesized from independent components
 * so the briefing never leans on the 2.5-h-lagged HTF swing sequence for an
 * intraday call:
 *
 *   direction  — majority vote of three STRUCTURAL reads: 15-min
 *                one-timeframing (sessionIntraday), micro swing structure on
 *                the exec bars with a Dow break rule, and the multi-window
 *                momentum stack.
 *   conviction — how many CONFIRMING reads agree with that direction: session
 *                cumulative delta, the Rip condition, and the session-VWAP
 *                position. Structure says where; these say how much to trust it.
 *   character  — trending / transitioning / rotational, from the momentum
 *                stack's alignment pattern (short window against long window =
 *                a reversal in progress).
 *
 * Disagreements are surfaced explicitly — "up one-timeframing but cumulative
 * delta falling" is exactly what the operator needs at a decision point.
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a
 * Briefing output — no Zod).
 */

/** Fractal pivot strength on exec bars (~3–5 min of RTH trade each side). */
export const MICRO_PIVOT_STRENGTH = 5

/**
 * Momentum windows (minutes) with their flat thresholds in points — net close
 * change inside the threshold reads as flat. NQ-scaled: ~10 pts of drift in
 * 15 min is noise; 40 pts over 3 h is not.
 */
export const MOMENTUM_WINDOWS: readonly { minutes: number; epsilonPts: number }[] = [
  { minutes: 15, epsilonPts: 10 },
  { minutes: 60, epsilonPts: 20 },
  { minutes: 180, epsilonPts: 40 },
]

/** Net session delta within this many contracts reads as neutral flow. */
export const FLOW_EPSILON = 50

/** One NQ tick. */
const PRICE_EPSILON = 0.25

const MS_PER_MINUTE = 60_000

export type TrendDirection = 'up' | 'down' | 'neutral'
export type TrendConviction = 'strong' | 'moderate' | 'weak'
export type TrendCharacter = 'trending' | 'transitioning' | 'rotational'

export type MicroSwingRead = {
  /** Swing-sequence state with the Dow break rule applied. */
  state: 'up' | 'down' | 'range'
  basis: string
  lastSwingHigh: number | null
  lastSwingLow: number | null
  /** Price traded through the last micro swing high (real-time bullish break). */
  brokeAbove: boolean
  /** Price traded through the last micro swing low (real-time bearish break). */
  brokeBelow: boolean
}

export type MomentumWindowRead = {
  minutes: number
  /** Net close change over the window; null when the export is shorter than it. */
  changePts: number | null
  direction: TrendDirection | null
}

export type IntradayTrendFacts = {
  direction: TrendDirection
  /** Null when direction is neutral — conviction only qualifies a directional call. */
  conviction: TrendConviction | null
  character: TrendCharacter
  /** One-line synthesis for the briefing prose. */
  basis: string
  components: {
    /** Null when sessionIntraday carried no one-timeframing read. */
    oneTimeframing: {
      vote: 'up' | 'down' | null
      state: 'up' | 'down' | 'none'
      barsHeld: number
      developingBarBroke: boolean
    } | null
    microSwing: MicroSwingRead
    momentum: {
      windows: MomentumWindowRead[]
      majority: 'up' | 'down' | null
    }
    flow: {
      /** Net session delta (ask − bid) over the full exec series. */
      totalDelta: number
      direction: TrendDirection
      /** Last-30-min cum-delta trend from sessionIntraday; null on partial coverage. */
      recentTrend: SessionTrend | null
    }
    frame: {
      rip: RipCondition | null
      /** Current price vs the Globex session VWAP; null on partial coverage. */
      vwapPosition: SessionPosition | null
    }
  }
  /** Explicit conflicts between components — narrate these, don't smooth them over. */
  disagreements: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Confirmed fractal pivots over exec bars (same shape as the HTF finder). */
function findPivots(
  bars: readonly ExecBar[],
  side: 'high' | 'low',
  strength: number,
): number[] {
  const pivots: number[] = []
  for (let i = strength; i < bars.length - strength; i++) {
    const v = side === 'high' ? bars[i].high : bars[i].low
    let isPivot = true
    for (let k = i - strength; k <= i + strength && isPivot; k++) {
      if (k === i) continue
      const other = side === 'high' ? bars[k].high : bars[k].low
      if (side === 'high' ? other >= v : other <= v) isPivot = false
    }
    if (isPivot) pivots.push(v)
  }
  return pivots
}

/**
 * Micro swing structure with the Dow break rule the HTF module lacks: price
 * trading through the last confirmed swing flips the state in real time —
 * no waiting for the opposing pivot to confirm.
 */
function computeMicroSwing(bars: readonly ExecBar[], price: number): MicroSwingRead {
  const highs = findPivots(bars, 'high', MICRO_PIVOT_STRENGTH)
  const lows = findPivots(bars, 'low', MICRO_PIVOT_STRENGTH)
  const lastHigh = highs.at(-1) ?? null
  const prevHigh = highs.at(-2) ?? null
  const lastLow = lows.at(-1) ?? null
  const prevLow = lows.at(-2) ?? null

  const brokeAbove = lastHigh !== null && price > lastHigh + PRICE_EPSILON
  const brokeBelow = lastLow !== null && price < lastLow - PRICE_EPSILON

  let state: MicroSwingRead['state'] = 'range'
  let basis = 'fewer than two confirmed micro swings per side'
  if (lastHigh !== null && prevHigh !== null && lastLow !== null && prevLow !== null) {
    if (lastHigh > prevHigh && lastLow > prevLow) {
      state = 'up'
      basis = 'higher micro swing highs and lows'
    } else if (lastHigh < prevHigh && lastLow < prevLow) {
      state = 'down'
      basis = 'lower micro swing highs and lows'
    } else {
      basis = 'mixed micro swing sequence'
    }
  }

  // Dow break overlay: a real-time break of the last defining swing outranks
  // the lagging sequence. Breaking both ways at once (huge developing bar)
  // reads as range — no side holds the break.
  if (brokeAbove && !brokeBelow) {
    if (state !== 'up') basis = `price broke above the last micro swing high ${round2(lastHigh!)} (was ${state})`
    state = 'up'
  } else if (brokeBelow && !brokeAbove) {
    if (state !== 'down') basis = `price broke below the last micro swing low ${round2(lastLow!)} (was ${state})`
    state = 'down'
  } else if (brokeAbove && brokeBelow) {
    state = 'range'
    basis = 'price traded through BOTH defining micro swings — no side holds the break'
  }

  return {
    state,
    basis,
    lastSwingHigh: lastHigh === null ? null : round2(lastHigh),
    lastSwingLow: lastLow === null ? null : round2(lastLow),
    brokeAbove,
    brokeBelow,
  }
}

function classifyChange(change: number, epsilon: number): TrendDirection {
  if (change > epsilon) return 'up'
  if (change < -epsilon) return 'down'
  return 'neutral'
}

function computeMomentum(bars: readonly ExecBar[]): IntradayTrendFacts['components']['momentum'] {
  const last = bars[bars.length - 1]
  const windows: MomentumWindowRead[] = MOMENTUM_WINDOWS.map(({ minutes, epsilonPts }) => {
    const cutoff = last.dateTime.getTime() - minutes * MS_PER_MINUTE
    // The reference close: the last bar at or before the cutoff.
    let ref: ExecBar | null = null
    for (const bar of bars) {
      if (bar.dateTime.getTime() <= cutoff) ref = bar
      else break
    }
    if (!ref) return { minutes, changePts: null, direction: null }
    const change = round2(last.close - ref.close)
    return { minutes, changePts: change, direction: classifyChange(change, epsilonPts) }
  })

  const cast = windows.filter((w) => w.direction !== null)
  const ups = cast.filter((w) => w.direction === 'up').length
  const downs = cast.filter((w) => w.direction === 'down').length
  const majority = ups > downs ? ('up' as const) : downs > ups ? ('down' as const) : null
  return { windows, majority }
}

export type IntradayTrendInput = {
  /** Chronological exec bars (oldest first, partial bar last). */
  bars: readonly ExecBar[]
  sessionIntraday: SessionIntradayFacts
  /** Vanguard condition when available (the analyze path); null on the eval path. */
  ripCondition: RipCondition | null
  currentPrice: number | null
}

export function computeIntradayTrend(input: IntradayTrendInput): IntradayTrendFacts {
  const { bars, sessionIntraday } = input
  if (bars.length === 0) {
    throw new Error('intraday trend needs at least one bar')
  }
  const price =
    input.currentPrice !== null && Number.isFinite(input.currentPrice)
      ? input.currentPrice
      : bars[bars.length - 1].close

  // --- Structural votes ---
  const otfFacts = sessionIntraday.oneTimeframing
  const oneTimeframing = otfFacts
    ? {
        // A run the developing bar already broke carries no vote — control is
        // being contested right now.
        vote:
          otfFacts.state === 'none' || otfFacts.developingBarBroke
            ? null
            : otfFacts.state,
        state: otfFacts.state,
        barsHeld: otfFacts.barsHeld,
        developingBarBroke: otfFacts.developingBarBroke,
      }
    : null

  const microSwing = computeMicroSwing(bars, price)
  const momentum = computeMomentum(bars)

  const votes = [
    oneTimeframing?.vote ?? null,
    microSwing.state === 'range' ? null : microSwing.state,
    momentum.majority,
  ].filter((v): v is 'up' | 'down' => v !== null)
  const ups = votes.filter((v) => v === 'up').length
  const downs = votes.filter((v) => v === 'down').length
  const direction: TrendDirection = ups > downs ? 'up' : downs > ups ? 'down' : 'neutral'

  // --- Confirming reads ---
  const totalDelta = bars.reduce((sum, b) => sum + b.delta, 0)
  const flow = {
    totalDelta,
    direction: classifyChange(totalDelta, FLOW_EPSILON),
    recentTrend: sessionIntraday.cumulativeDelta?.globex.trend ?? null,
  }
  const frame = {
    rip: input.ripCondition,
    vwapPosition: sessionIntraday.vwap?.globex.position ?? null,
  }

  let conviction: TrendConviction | null = null
  if (direction !== 'neutral') {
    const ripAgrees =
      frame.rip === null ? null : frame.rip === (direction === 'up' ? 'green' : 'red')
    const flowAgrees = flow.direction === 'neutral' ? null : flow.direction === direction
    const vwapAgrees =
      frame.vwapPosition === null || frame.vwapPosition === 'at'
        ? null
        : frame.vwapPosition === (direction === 'up' ? 'above' : 'below')
    const confirms = [ripAgrees, flowAgrees, vwapAgrees].filter((c) => c === true).length
    conviction = confirms >= 2 ? 'strong' : confirms === 1 ? 'moderate' : 'weak'
  }

  // --- Character from the momentum stack's alignment ---
  const cast = momentum.windows.filter((w) => w.direction !== null)
  const directional = cast.filter((w) => w.direction !== 'neutral')
  const shortest = directional[0] ?? null
  const longest = directional[directional.length - 1] ?? null
  let character: TrendCharacter = 'rotational'
  if (
    cast.length >= 2 &&
    directional.length === cast.length &&
    new Set(directional.map((w) => w.direction)).size === 1
  ) {
    character = 'trending'
  } else if (
    shortest !== null &&
    longest !== null &&
    shortest !== longest &&
    shortest.direction !== longest.direction
  ) {
    character = 'transitioning'
  }

  // --- Explicit conflicts ---
  const disagreements: string[] = []
  if (oneTimeframing?.developingBarBroke) {
    disagreements.push(
      `the developing 15-min bar has already broken the ${oneTimeframing.state} one-timeframing run`,
    )
  }
  if (
    oneTimeframing?.vote &&
    microSwing.state !== 'range' &&
    oneTimeframing.vote !== microSwing.state
  ) {
    disagreements.push(
      `${oneTimeframing.vote} one-timeframing against ${microSwing.state} micro swing structure`,
    )
  }
  if (direction !== 'neutral' && momentum.majority && momentum.majority !== direction) {
    disagreements.push(`momentum stack leans ${momentum.majority} against the ${direction} call`)
  }
  if (direction !== 'neutral' && flow.direction !== 'neutral' && flow.direction !== direction) {
    disagreements.push(
      `session cumulative delta (${totalDelta}) sides ${flow.direction} against the ${direction} structure`,
    )
  }
  if (
    direction !== 'neutral' &&
    frame.vwapPosition &&
    frame.vwapPosition !== 'at' &&
    frame.vwapPosition !== (direction === 'up' ? 'above' : 'below')
  ) {
    disagreements.push(`price is ${frame.vwapPosition} the session VWAP against the ${direction} call`)
  }
  if (
    direction !== 'neutral' &&
    frame.rip !== null &&
    frame.rip !== 'yellow' &&
    frame.rip !== (direction === 'up' ? 'green' : 'red')
  ) {
    disagreements.push(`Rip condition ${frame.rip} against the ${direction} call`)
  }

  const voteSummary =
    votes.length === 0
      ? 'no structural component casts a vote'
      : `${ups} up / ${downs} down of ${votes.length} structural votes (one-timeframing, micro swings, momentum)`
  const basis =
    direction === 'neutral'
      ? `neutral — ${voteSummary}; character ${character}`
      : `${direction} (${conviction}) — ${voteSummary}; character ${character}${disagreements.length > 0 ? `; ${disagreements.length} open conflict(s)` : ''}`

  return {
    direction,
    conviction,
    character,
    basis,
    components: { oneTimeframing, microSwing, momentum, flow, frame },
    disagreements,
  }
}
