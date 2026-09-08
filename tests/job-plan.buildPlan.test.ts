import { describe, expect, it } from 'vitest'
import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import { buildPlan, insufficiencyReasons } from '@/lib/job-plan/buildPlan'
import type { BandOriginFacts, Excursion } from '@/lib/job-plan/contextTypes'
import { MAX_STAGES } from '@/lib/job-plan/destinationChain'
import { planFrame } from '@/lib/job-plan/planFrame'
import { buildBandPlays } from '@/lib/job-plan/playGrammar'
import { MAX_PLAYS, PLANNER_REVISION } from '@/lib/job-plan/rules'
import { synthContext, type SynthRef, type SynthSpec } from './helpers/jobPlanContext'

/**
 * buildPlan over hand-built contexts (NQ, merge 20 / cap 40 unless stated),
 * pinning the 2026-08-31 forward-conditional contract: every directional
 * play is the EXPECTED response at a key area if price reaches it — origin
 * facts never arm, demote only (R9). BASE geometry, well separated so every
 * reference is its own band: ONL 29260, G line 29300, price 29360, daily
 * pivot 29393.5, Rip 29420, ONH 29460, weekly pivot 29500, PDH 29650,
 * weekly 1A rung 29700, PW High 29750 — no JBA box; price 60 pts above the
 * G line, so the frame is above-the-G-line and longs lead. BOXED adds the
 * JBA box [29200, 29600] and sits price at 29350, mid-zone.
 */

const BASE_REFS: readonly SynthRef[] = [
  { id: 'onl', source: 'overnight-extreme', price: 29260, label: 'ONL' },
  { id: 'g-line', source: 'g-line', price: 29300, label: 'G line (week open)' },
  { id: 'daily-pivot', source: 'daily-job-pivot', price: 29393.5, label: 'Daily Job Pivot' },
  { id: 'rip', source: 'rip', price: 29420, label: 'Rip' },
  { id: 'onh', source: 'overnight-extreme', price: 29460, label: 'ONH' },
  { id: 'weekly-pivot', source: 'weekly-job-pivot', price: 29500, label: 'Weekly Job Pivot' },
  { id: 'pdh', source: 'previous-day-extreme', price: 29650, label: 'PDH' },
  { id: 'rung:weekly:1A', source: 'weekly-rung', price: 29700, label: 'Weekly Job Pivot 1A' },
  { id: 'mgi:weekly.pwHigh', source: 'mgi-other', price: 29750, label: 'PW High' },
]

const BASE: SynthSpec = {
  price: 29360,
  refs: BASE_REFS,
  weekly: { valueLow: 29260, pivot: 29360, valueHigh: 29460 },
  daily: { valueLow: 29379.5, pivot: 29393.5, valueHigh: 29407.5 },
}

const BOXED: SynthSpec = {
  ...BASE,
  price: 29350,
  refs: [
    { id: 'jba:0:low', source: 'jba-edge', price: 29200, label: 'JBA 1 low', boxIndex: 0 },
    ...BASE_REFS,
    { id: 'jba:0:high', source: 'jba-edge', price: 29600, label: 'JBA 1 high', boxIndex: 0 },
  ],
  boxes: [{ low: 29200, high: 29600 }],
  weekly: { valueLow: 29250, pivot: 29350, valueHigh: 29450 },
}

const plan = (spec: Partial<SynthSpec> = {}): JobPlan => buildPlan({ context: synthContext({ ...BASE, ...spec }) })
const boxed = (spec: Partial<SynthSpec> = {}): JobPlan => buildPlan({ context: synthContext({ ...BOXED, ...spec }) })
const withFacts = (facts: SynthSpec['facts'], spec: Partial<SynthSpec> = {}) => plan({ ...spec, facts })
/** The directional play at a band (the stand-down names both zone edges and is excluded); a band may carry both directions since feat-149. */
const playAt = (p: JobPlan, memberLabel: string, direction?: 'long' | 'short') =>
  p.plays.find((x) => x.stance !== 'stand-down' && x.band.memberLabels.includes(memberLabel) && (direction === undefined || x.direction === direction))

/**
 * feat-149 grammar fixture: price 29360 ABOVE the daily pivot 29330 (the bias
 * line, longs), Rip 29420 unreached overhead, PDH 29650 and the weekly pivot
 * 29800 far above, ONL 29260 below the line. Small enough that nothing falls
 * off the cap.
 */
const LINE: SynthSpec = {
  price: 29360,
  refs: [
    { id: 'onl', source: 'overnight-extreme', price: 29260, label: 'ONL' },
    { id: 'daily-pivot', source: 'daily-job-pivot', price: 29330, label: 'Daily Job Pivot' },
    { id: 'rip', source: 'rip', price: 29420, label: 'Rip' },
    { id: 'pdh', source: 'previous-day-extreme', price: 29650, label: 'PDH' },
    { id: 'weekly-pivot', source: 'weekly-job-pivot', price: 29800, label: 'Weekly Job Pivot' },
  ],
  reachPts: 120,
}
const line = (spec: Partial<SynthSpec> = {}): JobPlan => buildPlan({ context: synthContext({ ...LINE, ...spec }) })

/** Every legal draft the grammar composes at the band holding `memberId` — read straight from the grammar, so the cap hides nothing. */
function draftsAt(spec: SynthSpec, memberId: string) {
  const ctx = synthContext(spec)
  const frame = planFrame(ctx)
  const band = ctx.bands.find((b) => b.members.some((m) => m.id === memberId))!
  const candidate = { band, role: ctx.roles.find((r) => r.bandId === band.id)!, facts: ctx.origin.bands.find((f) => f.bandId === band.id)!, why: 'test' }
  const result = buildBandPlays(candidate, ctx, frame)
  return 'drafts' in result ? result.drafts : []
}

const failedLook = (direction: 'above' | 'below', grade: 'EARLY' | 'LATE' = 'EARLY', endedAt = '2026-08-24T09:05:00'): Excursion => ({
  direction,
  startedAt: '2026-08-24T08:45:00',
  endedAt,
  minutes: 20,
  scope: 'session',
  outcome: 'failed-look',
  grade,
  extremePrice: direction === 'below' ? 29285 : 29410,
})

describe('the frame: the BIAS LINE (feat-148) — current daily pivot first, then weekly pivot / G line in reach, stacked bands outrank lone lines', () => {
  it('names the bias line as a band, the side and the productive direction', () => {
    const p = plan()
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', label: 'Daily Job Pivot', price: 29393.5, side: 'below', distancePts: 33.5, low: 29393.5, high: 29393.5, tier: 0, memberLabels: ['Daily Job Pivot'] })
    expect(p.frame?.text).toContain('Below the Daily Job Pivot 29393.5')
    expect(p.frame?.text).toContain('shorts only')
    expect(p.frame?.provenance).toEqual({ kind: 'reference', referenceIds: ['daily-pivot'], derivation: null })
  })

  it('the daily pivot frames even when the G line is nearer and in reach — the ladder, never blind proximity', () => {
    expect(plan({ price: 29310 }).frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below', distancePts: 83.5 })
  })

  it('a stacked band outranks the lone daily pivot ("a collection of candidates around a level is a very strong candidate")', () => {
    const p = plan({ refs: BASE_REFS.map((r) => (r.id === 'onh' ? { ...r, price: 29490 } : r)) })
    expect(p.frame).toMatchObject({ referenceId: 'weekly-pivot', side: 'below', distancePts: 130, low: 29490, high: 29500, memberLabels: ['Weekly Job Pivot', 'ONH'] })
    expect(p.frame?.text).toContain('Below the Weekly Job Pivot (+1) 29490–29500')
  })

  it('a weekly rung never frames ("worked our way up to the 1A" is a destination) — the daily pivot still frames from afar', () => {
    const p = plan({ price: 29660, reachPts: 100 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above', distancePts: 266.5 })
  })

  it('the daily pivot frames when every weekly line is out of reach', () => {
    const p = plan({ price: 29370, reachPts: 30 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below', distancePts: 23.5 })
  })

  it('nothing in reach → the daily pivot still frames, stated at its distance', () => {
    const p = plan({ reachPts: 10 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below', distancePts: 33.5 })
  })

  it('only the CURRENT daily pivot may frame — a nearer historical pivot never does (it is not the fresh line)', () => {
    const p = plan({
      price: 29370,
      reachPts: 30,
      refs: [...BASE_REFS, { id: 'daily-pivot:2026-08-20', source: 'daily-job-pivot', price: 29365, label: 'Daily Job Pivot 2026-08-20', pivotRole: 'historical' }],
    })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', price: 29393.5 })
  })

  it("within one merge tolerance of the band the frame is AT it — no bias yet, the fork stated", () => {
    const p = plan({ price: 29390 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'at' })
    expect(p.frame?.text).toContain('no bias yet')
  })

  it('an insufficient plan carries no frame', () => {
    const p = plan({ dataQuality: { sufficient: false, issues: [{ code: 'export_skew', severity: 'insufficient', message: 'skewed' }] } })
    expect(p.status).toBe('insufficient')
    expect(p.frame).toBeNull()
  })
})

describe('the forward-conditional grammar (feat-149: plays read against the frame): the fade on arrival, or the hold after the break', () => {
  it('the line itself, price above it: the pullback is bought on arrival — rebid, R11 deadline, build-below flip', () => {
    const p = line()
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above' })
    const dp = playAt(p, 'Daily Job Pivot', 'long')!
    expect(dp).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'hold-traverse', rank: 1, primary: true })
    expect(dp.activation).toMatchObject({ state: 'conditional', grounding: 'none', factAt: null, demoted: false })
    expect(dp.activation.evidence).toContain('Expect the bid at Daily Job Pivot 29330')
    expect(dp.trigger).toContain('Rebid Daily Job Pivot 29330 on the arrival from above')
    expect(dp.responseDeadline).toMatchObject({ minutes: 30, evaluatedByPlanner: false })
    expect(dp.invalidation).toMatchObject({ low: 29330, high: 29330, side: 'below' })
    expect(dp.invalidation.condition).toContain('Build below 29330')
    expect(dp.invalidation.thenSeek).toMatchObject({ label: 'ONL', low: 29260 })
    expect(dp.destinations.map((s) => [s.label, s.low, s.expect])).toEqual([
      ['Rip', 29420, 'gate-continuation'],
      ['PDH', 29650, 'gate-continuation'],
      ['Weekly Job Pivot', 29800, 'reoffer'],
    ])
    expect(dp.dont).toContain("Don't buy ahead of")
  })

  it('the line itself, the fork: once price loses it, the break-and-hold below and the pullback into it is the short — same band, both directions', () => {
    const p = line()
    const fork = playAt(p, 'Daily Job Pivot', 'short')!
    expect(fork).toMatchObject({ stance: 'continuation', direction: 'short', condition: 'build-beyond-continuation' })
    expect(fork.trigger).toContain('Only once price has lost the Daily Job Pivot: Break below Daily Job Pivot 29330 and HOLD')
    expect(fork.trigger).toContain('the trade is the hold after the break, never the break itself')
    expect(fork.summary).toContain('Lose the Daily Job Pivot → Break-and-hold below Daily Job Pivot 29330, sell the pullback → ONL 29260')
    expect(fork.invalidation).toMatchObject({ low: 29330, side: 'above' })
    expect(fork.invalidation.condition).toContain('Fail back above 29330')
    expect(fork.invalidation.thenSeek).toMatchObject({ label: 'Rip', low: 29420 })
    expect(fork.destinations.map((s) => s.low)).toEqual([29260])
    expect(fork.responseDeadline).toBeNull()
    expect(fork.dont).toContain("Don't sell the break itself")
    expect(p.plays.filter((x) => x.band.memberLabels.includes('Daily Job Pivot')).map((x) => x.direction).sort()).toEqual(['long', 'short'])
  })

  it('an unreached level beyond price on the bias side: the break-and-hold WITH the line; the FAIL against it only at a real important level', () => {
    // Rip is not an important level: the hold only, no counter play
    const rip = draftsAt(LINE, 'rip')
    expect(rip.map((d) => d.direction)).toEqual(['long'])
    expect(rip[0]).toMatchObject({ stance: 'continuation', direction: 'long', condition: 'build-beyond-continuation' })
    expect(rip[0].trigger).toContain('Break above Rip 29420 and HOLD')
    expect(rip[0].trigger).not.toContain('Only once')
    expect(rip[0].summary).toContain('Break-and-hold above Rip 29420, buy the pullback')
    expect(rip[0].invalidation).toMatchObject({ low: 29420, side: 'below' })
    // an overnight high at the same price IS a real important level: the hold AND the fail against the trend
    const onh = draftsAt({ ...LINE, refs: LINE.refs.map((r) => (r.id === 'rip' ? { ...r, id: 'onh', source: 'overnight-extreme' as const, label: 'ONH' } : r)) }, 'onh')
    expect(onh.map((d) => [d.direction, d.stance, d.condition])).toEqual([
      ['long', 'continuation', 'build-beyond-continuation'],
      ['short', 'reoffer', 'look-and-fail'],
    ])
    expect(onh[1].trigger).toContain('Look above ONH 29420 and fail')
    expect(onh[1].activation.evidence).toContain('a sweep beyond that fails is the trigger, not the arrival alone')
    expect(onh[1].dont).toContain("Don't fade the break itself")
    // and in the plan the with-trend hold ranks ahead of the counter-trend fail
    const p = line({ refs: LINE.refs.map((r) => (r.id === 'rip' ? { ...r, id: 'onh', source: 'overnight-extreme' as const, label: 'ONH' } : r)) })
    const fail = playAt(p, 'ONH', 'short')
    if (fail) expect(playAt(p, 'ONH', 'long')!.rank).toBeLessThan(fail.rank)
    else expect(p.pruned.some((x) => x.label.startsWith('ONH') && x.reason.includes('max 4'))).toBe(true)
    expect(playAt(p, 'ONH', 'long')).toBeDefined()
  })

  it('feat-150: a distribution boundary LVN is a real important level on its own (it could frame the day) — the hold AND the fail', () => {
    const edge = { id: 'node:balance:2', source: 'profile-balance' as const, price: 29420, label: 'balance-area lvn #2', node: { kind: 'lvn' as const, prominence: 2, edgeAbove: 'ledge' as const, distributionEdges: [{ edge: 'lower' as const, rank: 2, low: 29425, high: 29700, peak: 29560 }] } }
    const drafts = draftsAt({ ...LINE, refs: LINE.refs.map((r) => (r.id === 'rip' ? edge : r)) }, 'node:balance:2')
    expect(drafts.map((d) => [d.direction, d.condition])).toEqual([
      ['long', 'build-beyond-continuation'],
      ['short', 'look-and-fail'],
    ])
    // a lone important level keeps the with-trend hold first
    expect(drafts.map((d) => d.precedence.primary)).toEqual([true, false])
    // an interior profile node (no distribution edge) is NOT important: the hold only
    const interior = draftsAt({ ...LINE, refs: LINE.refs.map((r) => (r.id === 'rip' ? { ...edge, node: { ...edge.node, distributionEdges: [] } } : r)) }, 'node:balance:2')
    expect(interior.map((d) => d.direction)).toEqual(['long'])
  })

  it('feat-150: a STACKED important level beyond price ranks the counter-trend fail FIRST ("confluence of 5… more likely to trigger a countertrend trade")', () => {
    // the 2026-09-07 band: a distribution-edge lvn with VRange High and IBH stacked into it, 49 pts overhead
    const refs = [
      ...LINE.refs.filter((r) => r.id !== 'rip'),
      { id: 'node:balance:2', source: 'profile-balance' as const, price: 29420, label: 'balance-area lvn #2', node: { kind: 'lvn' as const, prominence: 2, distributionEdges: [{ edge: 'lower' as const, rank: 2, low: 29425, high: 29700, peak: 29560 }] } },
      { id: 'mgi:vRange.high', source: 'mgi-other' as const, price: 29418, label: 'VRange Upper' },
      { id: 'mgi:daily.ibh', source: 'mgi-other' as const, price: 29422, label: 'IBH' },
    ]
    const drafts = draftsAt({ ...LINE, refs }, 'node:balance:2')
    expect(drafts.map((d) => [d.direction, d.condition, d.precedence.primary])).toEqual([
      ['long', 'build-beyond-continuation', false],
      ['short', 'look-and-fail', true],
    ])
    const p = line({ refs })
    const fail = playAt(p, 'balance-area lvn #2', 'short')
    const hold = playAt(p, 'balance-area lvn #2', 'long')
    expect(fail).toBeDefined()
    if (hold) expect(fail!.rank).toBeLessThan(hold.rank)
    // a stacked band that is NOT important (two mgi-other lines) still gets no counter play... unless stacked: confluence alone is important by the operator's rule
    const stackedOnly = draftsAt({ ...LINE, refs: [...LINE.refs.filter((r) => r.id !== 'rip'), { id: 'mgi:vRange.high', source: 'mgi-other' as const, price: 29418, label: 'VRange Upper' }, { id: 'mgi:daily.ibh', source: 'mgi-other' as const, price: 29422, label: 'IBH' }] }, 'mgi:daily.ibh')
    expect(stackedOnly.map((d) => [d.direction, d.precedence.primary])).toEqual([['long', false], ['short', true]])
  })

  it('the far side of the line: fork-direction break-and-hold, each level conditional on losing the line; the bounce against it only at a real important level, ranked after', () => {
    const p = line({ reachPts: 300, refs: LINE.refs.filter((r) => ['onl', 'daily-pivot', 'weekly-pivot'].includes(r.id)) })
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['Daily Job Pivot', 'long', 'hold-traverse'],
      ['Daily Job Pivot', 'short', 'build-beyond-continuation'],
      ['ONL', 'short', 'build-beyond-continuation'],
      ['ONL', 'long', 'look-and-fail'],
    ])
    const hold = playAt(p, 'ONL', 'short')!
    expect(hold.trigger).toContain('Only once price has lost the Daily Job Pivot: Break below ONL 29260 and HOLD')
    const bounce = playAt(p, 'ONL', 'long')!
    expect(bounce.trigger).toContain('Only once price has lost the Daily Job Pivot: Look below ONL 29260 and fail')
    // a far level that is NOT important gets the fork continuation only
    const rip = draftsAt({ ...LINE, reachPts: 300, refs: [{ id: 'rip', source: 'rip', price: 29260, label: 'Rip' }, ...LINE.refs.filter((r) => ['daily-pivot', 'weekly-pivot'].includes(r.id))] }, 'rip')
    expect(rip.map((d) => [d.direction, d.condition])).toEqual([['short', 'build-beyond-continuation']])
  })

  it('a band price sits inside on the bias side leans with the frame; with no frame direction it is pruned, not guessed', () => {
    const p = line({ price: 29420 })
    const rip = playAt(p, 'Rip', 'long')!
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above' })
    expect(rip).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'hold-traverse' })
    expect(rip.band.side).toBe('inside')
    expect(rip.trigger).toContain('Lean on Rip 29420 from here')
    expect(p.plays.filter((x) => x.band.memberLabels.includes('Rip')).map((x) => x.direction)).toEqual(['long'])
    const at = plan({ price: 29393.5 })
    expect(at.frame?.side).toBe('at')
    expect(playAt(at, 'Daily Job Pivot')).toBeUndefined()
    expect(at.pruned.find((x) => x.label.startsWith('Daily Job Pivot'))?.reason).toContain('no directional read')
  })

  it('with the frame AT its band the read falls back to geometry against price — fades both sides, no continuation', () => {
    const p = plan({ price: 29390 })
    expect(p.frame?.side).toBe('at')
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['Daily Job Pivot', 'short', 'hold-traverse'],
      ['G line (week open)', 'long', 'hold-traverse'],
      ['Rip', 'short', 'hold-traverse'],
      ['ONL', 'long', 'look-and-fail'],
    ])
  })

  it('JBA edges on the far side: the fork continuation; on the bias side beyond price: the hold and the fail', () => {
    const big = boxed({ reachPts: 500 })
    expect(big.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below' })
    // JBA 1 low is beyond price on the bias side → the short hold AND the long fail
    expect(big.plays.filter((x) => x.band.memberLabels.includes('JBA 1 low') && x.stance !== 'stand-down').map((x) => [x.direction, x.condition])).toEqual([
      ['short', 'build-beyond-continuation'],
      ['long', 'look-and-fail'],
    ])
    // price below the line: JBA 1 high is far (above the line) → never a short there
    expect(big.plays.filter((x) => x.stance !== 'stand-down' && x.band.memberLabels.includes('JBA 1 high')).every((x) => x.direction === 'long')).toBe(true)
    expect(big.pruned.some((x) => x.label.startsWith('JBA 1 low') && x.reason.includes('beyond the 2 nearest'))).toBe(false)
  })

  it('origin facts NEVER arm a play — a completed failed look or acceptance leaves every play conditional (the 2026-08-25 OR Low regression)', () => {
    const p = withFacts({
      'g-line': { latestFailedLook: failedLook('below') },
      'daily-pivot': { acceptance: { state: 'accepted', direction: 'above', sinceAt: '2026-08-24T09:06:00', minutes: 25, scope: 'session' } },
      onl: { approachFailure: { from: 'above', closestApproachPts: 30, closestApproachAt: '2026-08-24T09:10:00', closestPrice: 29290, retreatPts: 25, minutesSinceClosest: 10, scope: 'session' } },
    })
    for (const play of p.plays) {
      expect(play.activation.state).toBe('conditional')
      expect(play.activation.grounding).toBe('none')
      expect(play.activation.factAt).toBeNull()
      expect(play.activation.rulesFired).not.toContain('R5')
      expect(play.activation.rulesFired).not.toContain('R6')
      expect(play.activation.rulesFired).not.toContain('R7')
      expect(play.activation.rulesFired).not.toContain('R8')
    }
    // continuation plays exist since feat-149, but only as FORWARD conditionals (break, hold, pullback) — never armed off a fact
    for (const play of p.plays.filter((x) => x.condition === 'build-beyond-continuation')) expect(play.activation.state).toBe('conditional')
  })

  it('R9 freshness: a touched band is demoted as a fresh trigger and ranks last', () => {
    const touched: BandOriginFacts['interaction'] = { interacted: true, prints: 2, firstAt: '2026-08-24T08:40:00', lastAt: '2026-08-24T08:41:00', defenses: { session: 0, overnight: 0 }, failedLookThisSession: false, triggerStatus: 'demoted' }
    // daily pivot (the line), Rip and PDH unreached overhead, the weekly pivot far above: PDH's two plays outrank a demoted Rip
    const spec: SynthSpec = { ...LINE, reachPts: 300, refs: LINE.refs.filter((r) => r.id !== 'onl') }
    const demotedRip = draftsAt({ ...spec, facts: { rip: { interaction: touched } } }, 'rip')
    expect(demotedRip).toHaveLength(1)
    expect(demotedRip[0].activation).toMatchObject({ demoted: true, state: 'conditional' })
    expect(demotedRip[0].activation.rulesFired).toContain('R9')
    expect(demotedRip[0].activation.evidence).toContain('demoted as a fresh trigger (R9)')
    const p = buildPlan({ context: synthContext({ ...spec, facts: { rip: { interaction: touched } } }) })
    expect(p.plays.some((x) => x.band.memberLabels.includes('Rip'))).toBe(false)
    expect(p.pruned.find((x) => x.label.startsWith('Rip'))?.reason).toContain('max 4')
    const kept = buildPlan({ context: synthContext({ ...spec, facts: { rip: { interaction: { ...touched, failedLookThisSession: true, triggerStatus: 'full' } } } }) })
    expect(playAt(kept, 'Rip', 'long')).toMatchObject({ rank: 3, activation: { demoted: false } })
  })

  it('mid-zone two-way (R10): price in the middle of the JBA box declares the two-way trade between the named edges and stands down', () => {
    const p = boxed()
    const zone = p.plays.find((x) => x.stance === 'stand-down')!
    expect(zone).toMatchObject({ rank: 1, primary: true, direction: 'two-way', condition: 'mid-zone-two-way' })
    expect(zone.band).toMatchObject({ bandId: null, low: 29200, high: 29600, role: 'enclosing-zone', side: 'inside' })
    expect(zone.band.provenance).toEqual({ kind: 'reference', referenceIds: ['jba:0:low', 'jba:0:high'], derivation: null })
    expect(zone.activation).toMatchObject({ state: 'armed', grounding: 'mid-zone', rulesFired: ['R10', 'R12'] })
    expect(zone.invalidation).toMatchObject({ low: 29200, high: 29600, side: 'either', thenSeek: null })
    expect(zone.destinations.map((s) => [s.label, s.low, s.expect])).toEqual([
      ['JBA 1 low', 29200, 'rebid'],
      ['JBA 1 high', 29600, 'reoffer'],
    ])
    expect(zone.summary).toBe('Stay inside 29200–29600 (JBA 1 low – JBA 1 high) → balance; play the edges, stand down in the middle')
    expect(p.standDownReasons).toEqual([zone.activation.evidence])
    expect(p.lean).toMatchObject({ playId: zone.id, basis: 'mid-zone' })
  })

  it('no mid-zone play when price is within the edge-play distance of an edge', () => {
    const p = boxed({ price: 29230 })
    expect(p.plays.some((x) => x.stance === 'stand-down')).toBe(false)
    expect(p.standDownReasons).toEqual([])
  })
})

describe('the precedence table: frame side leads, sides alternate, structure ranks', () => {
  it('below the daily pivot the shorts lead and the sides alternate; the frame-aligned play is the primary look', () => {
    const p = plan()
    // the bias side leads (the reoffer at the line), then the SIDES OF THE FRAME alternate: the line's own long once taken, the G line's short hold, Rip's long hold on the far side
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['Daily Job Pivot', 'short', 'hold-traverse'],
      ['Daily Job Pivot', 'long', 'build-beyond-continuation'],
      ['G line (week open)', 'short', 'build-beyond-continuation'],
      ['Rip', 'long', 'build-beyond-continuation'],
    ])
    expect(p.plays[0].primary).toBe(true)
    expect(p.lean).toMatchObject({ playId: p.plays[0].id, basis: 'frame' })
    expect(p.lean.text).toContain('frame-aligned look (below the Daily Job Pivot)')
  })

  it('above the line the longs lead (mirrored frame)', () => {
    const p = plan({ price: 29450 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above' })
    expect(p.plays[0].direction).toBe('long')
  })

  it('the enclosing zone\'s edges rank first within a side ("play the edges")', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['JBA 1 low', 'two-way', 'mid-zone-two-way'],
      ['JBA 1 low', 'short', 'build-beyond-continuation'],
      ['JBA 1 high', 'long', 'build-beyond-continuation'],
      ['JBA 1 low', 'long', 'look-and-fail'],
    ])
    expect(p.plays[0].stance).toBe('stand-down')
  })

  it('at the frame line no side leads — the structurally-first play\'s side leads, then nearest, and the lean names the at-line frame', () => {
    const p = plan({ price: 29390 })
    expect(p.frame?.side).toBe('at')
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.band.distancePts])).toEqual([
      ['Daily Job Pivot', 3.5],
      ['G line (week open)', 90],
      ['Rip', 30],
      ['ONL', 130],
    ])
    expect(p.lean.text).toContain('(frame: at the Daily Job Pivot)')
  })
})

describe('R12 cardinality and pruning', () => {
  it('arms at most 2 bands per side nearest-first plus the enclosing zone\'s edges, max 4 plays, and lists every pruned band with its reason', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays).toHaveLength(MAX_PLAYS)
    const labels = p.pruned.map((x) => `${x.label} :: ${x.reason}`)
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Weekly Job Pivot 29500 :: R12: beyond the 2 nearest armed bands on the far side of the line/)]))
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^PW High 29750 :: R12: skipped — no confluence and a lowest-tier source \(mgi-other\)/)]))
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/R12: max 4 branches/)]))
    expect(p.pruned.some((x) => x.label.startsWith('JBA 1 low') && x.reason.includes('beyond the 2 nearest'))).toBe(false)
    expect(p.pruned.some((x) => x.label.startsWith('Weekly Job Pivot 1A'))).toBe(false)
  })

  it('an enclosing-zone edge beyond the R4 reach stays a destination (never played) — the stand-down still names it', () => {
    const p = boxed({ reachPts: 120 })
    expect(playAt(p, 'JBA 1 high')).toBeUndefined()
    expect(p.plays[0]).toMatchObject({ stance: 'stand-down', band: { high: 29600 } })
  })

  it('a lone lowest-tier band nearest to price is skipped for the next structural one', () => {
    const p = plan({ refs: [...BASE_REFS, { id: 'mgi:daily.pdc', source: 'mgi-other', price: 29330, label: 'PDC' }] })
    expect(playAt(p, 'PDC')).toBeUndefined()
    expect(playAt(p, 'G line (week open)')).toBeDefined()
    expect(p.context.location.enclosingZone?.lowerEdge.label).toBe('PDC')
    expect(p.pruned.find((x) => x.label.startsWith('PDC'))?.reason).toContain('R12: skipped')
  })

  it('a lowest-tier level in confluence is a full member', () => {
    const p = plan({ refs: [...BASE_REFS, { id: 'mgi:daily.pdc', source: 'mgi-other', price: 29310, label: 'PDC' }] })
    expect(playAt(p, 'PDC')?.band.memberLabels).toEqual(['G line (week open)', 'PDC'])
  })

  it('caps the destination chain and never chains through rung-only bands unless nothing else is out there', () => {
    const p = plan()
    const g = playAt(p, 'G line (week open)')!
    expect(g.destinations.length).toBeLessThanOrEqual(MAX_STAGES)
    expect(g.destinations.every((s) => s.label !== 'Weekly Job Pivot 1A')).toBe(true)
    const below = BASE_REFS.filter((r) => r.price <= 29300).map((r) => (r.source === 'weekly-job-pivot' ? { ...r, price: 29100 } : r))
    const weeklyBelow = { id: 'weekly-pivot', source: 'weekly-job-pivot' as const, price: 29100, label: 'Weekly Job Pivot' }
    const rung = BASE_REFS.find((r) => r.source === 'weekly-rung')!
    const pivot = BASE_REFS.find((r) => r.source === 'daily-job-pivot')!
    const withPivot = plan({ refs: [...below, weeklyBelow, pivot, rung] })
    expect(playAt(withPivot, 'G line (week open)', 'long')!.destinations.map((s) => [s.label, s.expect])).toEqual([['Daily Job Pivot', 'reoffer']])
    const rungOnly = plan({ refs: [...below, weeklyBelow, { ...pivot, price: 29150 }, rung] })
    expect(playAt(rungOnly, 'G line (week open)', 'long')!.destinations.map((s) => [s.label, s.expect, s.beeline])).toEqual([['Weekly Job Pivot 1A', 'hold', null]])
  })
})

describe('sufficiency and the UI-only uncertainty band', () => {
  it('insufficient data quality (R13) yields no plays and says why', () => {
    const p = plan({ dataQuality: { sufficient: false, issues: [{ code: 'export_skew', severity: 'insufficient', message: '1105 s between daily and MGI' }] } })
    expect(p.status).toBe('insufficient')
    expect(p.plays).toEqual([])
    expect(p.standDownReasons).toEqual(['export_skew: 1105 s between daily and MGI'])
    expect(p.lean).toMatchObject({ playId: null, basis: 'none' })
    expect(p.warnings).toContain('export_skew: 1105 s between daily and MGI')
  })

  it('missing core geometry never yields ready', () => {
    const noDaily = synthContext({ ...BASE, refs: BASE_REFS.filter((r) => r.source !== 'daily-job-pivot') })
    expect(insufficiencyReasons(noDaily)).toEqual(['core geometry missing: no current daily Job Pivot in the inventory'])
    expect(buildPlan({ context: noDaily }).status).toBe('insufficient')
    const noWeekly = synthContext({ ...BASE, refs: BASE_REFS.filter((r) => r.source !== 'weekly-job-pivot') })
    expect(buildPlan({ context: noWeekly }).status).toBe('insufficient')
    const noBands = synthContext({ ...BASE, refs: [] })
    expect(buildPlan({ context: noBands }).standDownReasons).toEqual(expect.arrayContaining([expect.stringContaining('no confluence bands')]))
  })

  it('a ready plan with nothing playable stands down explicitly, frame still stated', () => {
    const p = plan({ reachPts: 10 })
    expect(p.status).toBe('ready')
    expect(p.plays).toEqual([])
    expect(p.standDownReasons).toEqual(['no playable band in the actionable set — nothing to watch; destinations only'])
    expect(p.frame).not.toBeNull()
  })

  it('provisional JBA edges carry a derived, labeled, UI-only expansion band; nothing else does', () => {
    const p = boxed({ reachPts: 500, dataQuality: { boxesProvisional: true } })
    const low = playAt(p, 'JBA 1 low')!
    expect(low.uncertaintyBand).toMatchObject({ kind: 'box-expansion', uiOnly: true, low: 29180, high: 29220 })
    expect(low.uncertaintyBand?.provenance).toEqual({ kind: 'derived', referenceIds: ['jba:0:low'], derivation: 'JBA 1 low ± merge tolerance 20' })
    expect(low.band).toMatchObject({ low: 29200, high: 29200 })
    expect(playAt(plan({ dataQuality: { boxesProvisional: true } }), 'G line (week open)')?.uncertaintyBand).toBeNull()
    expect(playAt(boxed({ reachPts: 500 }), 'JBA 1 low')?.uncertaintyBand).toBeNull()
  })

  it('stamps the revision, asOf, instrument and the meta placeholders', () => {
    const p = buildPlan({ context: synthContext(BASE), meta: { bundleId: 'b-1', sourceHashes: { mgi: 'abc' }, visionModelId: 'm' } })
    expect(p.meta).toMatchObject({ plannerRevision: PLANNER_REVISION, asOf: '2026-08-24T09:30:00', instrument: 'NQ', symbol: 'NQU26', tradingDay: '2026-08-24', bundleId: 'b-1', inputFingerprint: null, visionModelId: 'm', visionPromptRevision: null })
    expect(p.meta.sourceHashes).toEqual({ jobStudyDaily: null, jobStudyWeekly: null, mgi: 'abc', execBars: null, htfBars: null, balanceAreaProfile: null, rotationProfile: null })
    expect(p.geometryRefs.references.map((r) => r.id)).toEqual(BASE_REFS.map((r) => r.id))
    expect(p.geometryRefs.bands.length).toBe(p.context.bands.length)
  })
})

describe('the 08-11-style example from the plan\'s Goal, reproduced from a fixture (ES: merge 5 / cap 10)', () => {
  const GOAL: SynthSpec = {
    instrument: 'ES',
    price: 7990,
    reachPts: 70,
    refs: [
      { id: 'rung:weekly:1B', source: 'weekly-rung', price: 7722, label: 'Weekly Job Pivot 1B' },
      { id: 'jba:0:low', source: 'jba-edge', price: 7955, label: 'JBA 1 low', boxIndex: 0 },
      { id: 'pdl', source: 'previous-day-extreme', price: 7955, label: 'PDL' },
      { id: 'weekly-pivot', source: 'weekly-job-pivot', price: 7970, label: 'Weekly Job Pivot' },
      { id: 'daily-pivot', source: 'daily-job-pivot', price: 7970, label: 'Daily Job Pivot' },
      { id: 'node:balance:0', source: 'profile-balance', price: 7980, label: 'balance-area lvn (primary) #1', node: { primary: true, prominence: 1 } },
      { id: 'rip', source: 'rip', price: 7982, label: 'Rip' },
      { id: 'node:balance:1', source: 'profile-balance', price: 8004, label: 'balance-area hvn-edge #2', node: { kind: 'hvn', prominence: 2, edgeBelow: 'ledge', edgeAbove: 'flat' } },
      { id: 'jba:0:high', source: 'jba-edge', price: 8005, label: 'JBA 1 high', boxIndex: 0 },
      { id: 'pdh', source: 'previous-day-extreme', price: 8005, label: 'PDH' },
      { id: 'mgi:weekly.pwHigh', source: 'mgi-other', price: 8040, label: 'PW High' },
    ],
    boxes: [{ low: 7955, high: 8005 }],
    weekly: { valueLow: 7930, pivot: 7970, valueHigh: 8010 },
    daily: { valueLow: 7960, pivot: 7970, valueHigh: 7985 },
  }

  const p = buildPlan({ context: synthContext(GOAL) })

  it('frames off the stacked daily + weekly pivot band (no G line in the inventory) and leads with the two-way declaration', () => {
    expect(p.status).toBe('ready')
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above', distancePts: 20, low: 7970, high: 7970, memberLabels: ['Weekly Job Pivot', 'Daily Job Pivot'] })
    expect(p.plays[0]).toMatchObject({ stance: 'stand-down', condition: 'mid-zone-two-way', primary: true })
    expect(p.plays[0].summary).toBe('Stay inside 7955–8005 (JBA 1 low – JBA 1 high) → balance; play the edges, stand down in the middle')
    expect(p.lean.basis).toBe('mid-zone')
  })

  it('price above the pivot band: the edges lead — the upper edge\'s FAIL first (a stacked important level, feat-150), the lower edge\'s fork hold, then the upper edge\'s hold; the LVN rebid falls to the cap', () => {
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.condition, x.direction])).toEqual([
      ['JBA 1 low', 'mid-zone-two-way', 'two-way'],
      ['JBA 1 high', 'look-and-fail', 'short'],
      ['JBA 1 low', 'build-beyond-continuation', 'short'],
      ['JBA 1 high', 'build-beyond-continuation', 'long'],
    ])
    expect(p.pruned.find((x) => x.label.startsWith('Rip'))?.reason).toContain('max 4')
  })

  it('yesterday\'s low is on the far side of the line: the fork short — "lose the pivot → build below 7955, sell the pullback → the 7720s"', () => {
    const drafts = draftsAt(GOAL, 'pdl')
    // a JBA edge is a real important level: the fork hold first, then the bounce against it as a fail
    expect(drafts.map((d) => [d.direction, d.condition])).toEqual([['short', 'build-beyond-continuation'], ['long', 'look-and-fail']])
    expect(drafts[1].trigger).toContain('Only once price has lost the Daily Job Pivot: Look below JBA 1 low (+1) 7955 and fail')
    const pdl = drafts[0]
    expect(pdl).toMatchObject({ stance: 'continuation', direction: 'short', condition: 'build-beyond-continuation', activation: { state: 'conditional', grounding: 'none' } })
    expect(pdl.band).toMatchObject({ low: 7955, high: 7955, memberLabels: ['JBA 1 low', 'PDL'] })
    expect(pdl.summary).toContain('Lose the Daily Job Pivot → Break-and-hold below JBA 1 low (+1) 7955, sell the pullback → Weekly Job Pivot 1B 7722')
    expect(pdl.destinations.map((s) => [s.label, s.expect])).toEqual([['Weekly Job Pivot 1B', 'hold']])
    expect(pdl.invalidation).toMatchObject({ low: 7955, side: 'above' })
    expect(pdl.invalidation.condition).toContain('the rubber meets the road')
    expect(pdl.invalidation.thenSeek).toMatchObject({ label: 'Weekly Job Pivot (+1)', low: 7970 })
    expect(pdl.invalidation.thenSeek?.text).toBe('above 7955 (JBA 1 low (+1)) → seek Weekly Job Pivot (+1) 7970')
    // in the plan, the with-trend hold ranks and the counter-trend bounce falls to the cap
    expect(p.plays.some((x) => x.band.memberLabels.includes('PDL') && x.direction === 'long')).toBe(false)
  })

  it('"rebid 7980–82 into the LVN → press the 8004s; build above → attack prior week high" (the grammar\'s draft; the plan\'s cap keeps the edges ahead of it)', () => {
    const rebid = draftsAt(GOAL, 'rip')[0]
    expect(rebid).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'hold-traverse', activation: { state: 'conditional', grounding: 'none' } })
    expect(rebid.band).toMatchObject({ low: 7980, high: 7982, memberLabels: ['Rip', 'balance-area lvn (primary) #1'] })
    expect(rebid.destinations.map((s) => [s.label, s.low, s.high, s.expect])).toEqual([
      ['JBA 1 high (+2)', 8004, 8005, 'gate-continuation'],
      ['PW High', 8040, 8040, 'reoffer'],
    ])
    expect(rebid.destinations[0].beeline).toEqual({ dontCounter: true, destinationLabel: 'PW High', destinationLow: 8040, destinationHigh: 8040 })
    expect(rebid.responseDeadline?.minutes).toBe(30)
    expect(rebid.summary).toBe('Rebid 7980–7982 into Rip (+1) → press JBA 1 high (+2) 8004–8005; build above → PW High 8040; below 7980 (Rip (+1)) → seek Weekly Job Pivot (+1) 7970')
  })

  it('the lone prior-week high is skipped as a trigger (R12) but kept as a destination; the pivot band falls to the cap', () => {
    expect(p.pruned.find((x) => x.label.startsWith('PW High'))?.reason).toContain('R12: skipped')
    expect(p.pruned.find((x) => x.label.startsWith('Weekly Job Pivot (+1)'))?.reason).toContain('max 4')
  })
})
