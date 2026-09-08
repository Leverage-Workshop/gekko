import { describe, expect, it } from 'vitest'
import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import { buildPlan, insufficiencyReasons } from '@/lib/job-plan/buildPlan'
import type { BandOriginFacts, Excursion } from '@/lib/job-plan/contextTypes'
import { MAX_STAGES } from '@/lib/job-plan/destinationChain'
import { planFrame } from '@/lib/job-plan/planFrame'
import { buildBandPlay, buildBandPlays } from '@/lib/job-plan/playGrammar'
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

/** The directional draft the LLM path would compose at the band in a REQUESTED direction (feat-152: the deterministic read there may be the two-way). */
function draftAt(spec: SynthSpec, memberId: string, direction: 'long' | 'short' | 'two-way') {
  const ctx = synthContext(spec)
  const frame = planFrame(ctx)
  const band = ctx.bands.find((b) => b.members.some((m) => m.id === memberId))!
  const candidate = { band, role: ctx.roles.find((r) => r.bandId === band.id)!, facts: ctx.origin.bands.find((f) => f.bandId === band.id)!, why: 'test' }
  const result = buildBandPlay(candidate, ctx, frame, direction)
  if (!('draft' in result)) throw new Error(result.pruned)
  return result.draft
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

  it("feat-153: a prior session's pivot and an hvn in reach are never armed — targets only — while the lvn beside them is", () => {
    // the prior pivot sits AT price (20 pts, the merge tolerance), the hvn and the lvn beyond the Rip — all in reach
    const p = line({
      reachPts: 200,
      refs: [
        ...LINE.refs,
        { id: 'daily-pivot:2026-08-20', source: 'daily-job-pivot', price: 29380, label: 'Daily Job Pivot 2026-08-20', pivotRole: 'historical' },
        { id: 'lvn', source: 'profile-balance', price: 29460, label: 'balance-area lvn #2', node: { kind: 'lvn', prominence: 2 } },
        { id: 'hvn', source: 'profile-balance', price: 29500, label: 'balance-area hvn (primary) #1', node: { kind: 'hvn', prominence: 1, primary: true } },
      ],
    })
    const armed = p.plays.filter((x) => x.stance !== 'stand-down').flatMap((x) => x.band.memberLabels)
    expect(armed).not.toContain('Daily Job Pivot 2026-08-20')
    expect(armed).not.toContain('balance-area hvn (primary) #1')
    expect(playAt(p, 'balance-area lvn #2')).toBeDefined()
    // still in the inventory, as destinations
    expect(p.geometryRefs.references.find((r) => r.id === 'hvn')).toMatchObject({ destinationOnly: true })
    expect(p.geometryRefs.references.find((r) => r.id === 'daily-pivot:2026-08-20')).toMatchObject({ destinationOnly: true })
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
  it('the line itself is NEVER a play (feat-151): two-way by assumption, drawn as the frame, the slots go to the other areas', () => {
    const p = line()
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above' })
    expect(p.frame?.text).toContain('The line itself is two-way: rebid while it holds, reoffer once lost')
    expect(p.plays.some((x) => x.band.memberLabels.includes('Daily Job Pivot'))).toBe(false)
    expect(draftsAt(LINE, 'daily-pivot')).toEqual([])
    // the grammar names the reason when asked for a play there
    const ctx = synthContext(LINE)
    const band = ctx.bands.find((b) => b.members.some((m) => m.id === 'daily-pivot'))!
    const candidate = { band, role: ctx.roles.find((r) => r.bandId === band.id)!, facts: ctx.origin.bands.find((f) => f.bandId === band.id)!, why: 'test' }
    expect(buildBandPlays(candidate, ctx, planFrame(ctx))).toEqual({ pruned: expect.stringContaining('two-way by assumption') })
    // the bias-side pullback and the far side still read against the line
    expect(playAt(p, 'Rip', 'long')).toMatchObject({ stance: 'continuation', condition: 'build-beyond-continuation' })
    expect(playAt(p, 'ONL')!.trigger).toContain('Only once price has lost the Daily Job Pivot')
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
    // an overnight high at the same price IS a real important level: the deterministic read is ONE two-way play (feat-152) — the hold AND the fail in one slot
    const spec = { ...LINE, refs: LINE.refs.map((r) => (r.id === 'rip' ? { ...r, id: 'onh', source: 'overnight-extreme' as const, label: 'ONH' } : r)) }
    const onh = draftsAt(spec, 'onh')
    expect(onh.map((d) => [d.direction, d.stance, d.condition])).toEqual([['two-way', 'two-way', 'fail-or-hold']])
    // a lone important level leads with the hold; the fail is the second leg
    expect(onh[0].trigger).toBe('Two-way at ONH 29420: break above ONH 29420 and HOLD — completed exec-bar closes above 29420 for 20 min (R6) — then the pullback into it that holds is the long toward PDH; or a look above ONH 29420 that fails back → short back across toward Daily Job Pivot')
    expect(onh[0].summary).toContain('break-and-hold first')
    expect(onh[0].invalidation).toMatchObject({ low: 29420, high: 29420, side: 'either', thenSeek: null })
    // each leg's first stage keeps its own expectation and beeline (the fail leg gates at the line toward ONL; the hold leg's PDH gates on toward the weekly pivot)
    expect(onh[0].destinations.map((d) => [d.label, d.text.split(':')[0], d.expect, d.beeline?.destinationLabel ?? null])).toEqual([
      ['Daily Job Pivot', 'Fail leg (short)', 'gate-continuation', 'ONL'],
      ['PDH', 'Hold leg (long)', 'gate-continuation', 'Weekly Job Pivot'],
    ])
    expect(onh[0].dont).toContain("Don't pick a side ahead of the response")
    expect(onh[0].responseDeadline).toBeNull()
    // the LLM path may still ask for either leg alone
    expect(draftAt(spec, 'onh', 'long')).toMatchObject({ stance: 'continuation', condition: 'build-beyond-continuation' })
    const fail = draftAt(spec, 'onh', 'short')
    expect(fail).toMatchObject({ stance: 'reoffer', condition: 'look-and-fail' })
    expect(fail.trigger).toContain('Look above ONH 29420 and fail')
    expect(fail.dont).toContain("Don't fade the break itself")
    // and two-way is never a read where only one exists
    expect(() => draftAt(LINE, 'rip', 'two-way')).toThrow('two-way is a read only at an unreached important level')
    const p = line(spec)
    expect(playAt(p, 'ONH')).toMatchObject({ stance: 'two-way', direction: 'two-way' })
  })

  it('feat-150: a distribution boundary LVN is a real important level on its own (it could frame the day) — the hold AND the fail', () => {
    const edge = { id: 'node:balance:2', source: 'profile-balance' as const, price: 29420, label: 'balance-area lvn #2', node: { kind: 'lvn' as const, prominence: 2, edgeAbove: 'ledge' as const, distributionEdges: [{ edge: 'lower' as const, rank: 2, low: 29425, high: 29700, peak: 29560 }] } }
    const drafts = draftsAt({ ...LINE, refs: LINE.refs.map((r) => (r.id === 'rip' ? edge : r)) }, 'node:balance:2')
    expect(drafts.map((d) => [d.direction, d.condition, d.precedence.primary])).toEqual([['two-way', 'fail-or-hold', true]])
    // a lone important level keeps the with-trend hold first
    expect(drafts[0].summary).toContain('break-and-hold first')
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
    expect(drafts.map((d) => [d.direction, d.condition])).toEqual([['two-way', 'fail-or-hold']])
    // the stacked level leads with the fail leg
    expect(drafts[0].summary).toContain('fail first')
    expect(drafts[0].trigger.indexOf('fails back')).toBeLessThan(drafts[0].trigger.indexOf('HOLD'))
    expect(drafts[0].activation.evidence).toContain('the fail first at a level this stacked')
    // the LLM path's separate legs keep the same ranking: the fail is the primary read here
    expect(draftAt({ ...LINE, refs }, 'node:balance:2', 'short').precedence.primary).toBe(true)
    expect(draftAt({ ...LINE, refs }, 'node:balance:2', 'long').precedence.primary).toBe(false)
    // confluence alone is important by the operator's rule (two mgi-other lines stacked)
    const stackedOnly = draftsAt({ ...LINE, refs: [...LINE.refs.filter((r) => r.id !== 'rip'), { id: 'mgi:vRange.high', source: 'mgi-other' as const, price: 29418, label: 'VRange Upper' }, { id: 'mgi:daily.ibh', source: 'mgi-other' as const, price: 29422, label: 'IBH' }] }, 'mgi:daily.ibh')
    expect(stackedOnly.map((d) => [d.direction, d.condition])).toEqual([['two-way', 'fail-or-hold']])
    expect(stackedOnly[0].summary).toContain('fail first')
  })

  it('the far side of the line: fork-direction break-and-hold, each level conditional on losing the line; the bounce against it only at a real important level, ranked after', () => {
    const p = line({ reachPts: 300, refs: LINE.refs.filter((r) => ['onl', 'daily-pivot', 'weekly-pivot'].includes(r.id)) })
    // feat-151/152: the line itself is never a play — the far side's important level is ONE two-way play, conditional on losing the line
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([['ONL', 'two-way', 'fail-or-hold']])
    const twoWay = playAt(p, 'ONL')!
    expect(twoWay.trigger).toContain('Only once price has lost the Daily Job Pivot: Two-way at ONL 29260: break below ONL 29260 and HOLD')
    expect(twoWay.trigger).toContain('a look below ONL 29260 that fails back → long back across')
    // the LLM path's legs, each conditional on losing the line
    const farSpec = { ...LINE, reachPts: 300, refs: LINE.refs.filter((r) => ['onl', 'daily-pivot', 'weekly-pivot'].includes(r.id)) }
    expect(draftAt(farSpec, 'onl', 'short').trigger).toContain('Only once price has lost the Daily Job Pivot: Break below ONL 29260 and HOLD')
    expect(draftAt(farSpec, 'onl', 'long').trigger).toContain('Only once price has lost the Daily Job Pivot: Look below ONL 29260 and fail')
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
    // JBA 1 low is beyond price on the bias side → ONE two-way play (the short hold AND the long fail)
    expect(big.plays.filter((x) => x.band.memberLabels.includes('JBA 1 low') && x.stance !== 'stand-down').map((x) => [x.direction, x.condition])).toEqual([['two-way', 'fail-or-hold']])
    // price below the line: JBA 1 high is far (above the line) → its two-way is conditional on losing the line, the long hold leading
    const high = big.plays.find((x) => x.stance !== 'stand-down' && x.band.memberLabels.includes('JBA 1 high'))!
    expect(high).toMatchObject({ direction: 'two-way', stance: 'two-way' })
    expect(high.trigger).toContain('Only once price has lost the Daily Job Pivot: Two-way at JBA 1 high')
    expect(draftAt({ ...BOXED, reachPts: 500 }, 'jba:0:high', 'long')).toMatchObject({ stance: 'continuation' })
    expect(draftAt({ ...BOXED, reachPts: 500 }, 'jba:0:high', 'short')).toMatchObject({ stance: 'reoffer', condition: 'look-and-fail' })
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
    // the demoted Rip keeps its play but ranks LAST, behind every fresh area (feat-151 freed the line's slots, so it no longer falls to the cap)
    const demoted = playAt(p, 'Rip', 'long')!
    expect(demoted).toMatchObject({ rank: p.plays.length, activation: { demoted: true } })
    expect(p.plays.filter((x) => x.id !== demoted.id).every((x) => !x.activation.demoted)).toBe(true)
    const kept = buildPlan({ context: synthContext({ ...spec, facts: { rip: { interaction: { ...touched, failedLookThisSession: true, triggerStatus: 'full' } } } }) })
    expect(playAt(kept, 'Rip', 'long')).toMatchObject({ activation: { demoted: false } })
    expect(playAt(kept, 'Rip', 'long')!.rank).toBeLessThan(demoted.rank)
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
    // the bias side leads (the G line's two-way beyond price — the line itself is never a play, feat-151; an important level is ONE two-way play, feat-152),
    // then the SIDES OF THE FRAME alternate: ONH's two-way on the far side, ONL's two-way on the bias side, Rip's long hold on the far side
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['G line (week open)', 'two-way', 'fail-or-hold'],
      ['ONH', 'two-way', 'fail-or-hold'],
      ['ONL', 'two-way', 'fail-or-hold'],
      ['Rip', 'long', 'build-beyond-continuation'],
    ])
    expect(p.plays.some((x) => x.band.memberLabels.includes('Daily Job Pivot'))).toBe(false)
    expect(p.plays[0].primary).toBe(true)
    expect(p.lean).toMatchObject({ playId: p.plays[0].id, basis: 'frame' })
    expect(p.lean.text).toContain('frame-aligned look (below the Daily Job Pivot)')
  })

  it('above the line the longs lead (mirrored frame)', () => {
    const p = plan({ price: 29450 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'above' })
    // the nearest bias-side level (ONH, an important level) is a two-way whose hold leg is the long
    expect(p.plays[0]).toMatchObject({ direction: 'two-way', stance: 'two-way' })
    expect(p.plays[0].trigger).toContain('the pullback into it that holds is the long')
    expect(p.lean.text).toContain('frame-aligned look (above the Daily Job Pivot)')
  })

  it('the enclosing zone\'s edges rank first within a side ("play the edges")', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction, x.condition])).toEqual([
      ['JBA 1 low', 'two-way', 'mid-zone-two-way'],
      ['JBA 1 low', 'two-way', 'fail-or-hold'],
      ['JBA 1 high', 'two-way', 'fail-or-hold'],
      ['G line (week open)', 'two-way', 'fail-or-hold'],
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
    // (the G line is an important level, so the plan reads it two-way — the directional chain is the LLM path's long leg)
    expect(draftAt({ ...BASE, refs: [...below, weeklyBelow, pivot, rung] }, 'g-line', 'long').destinations.map((s) => [s.label, s.expect])).toEqual([['Daily Job Pivot', 'reoffer']])
    expect(draftAt({ ...BASE, refs: [...below, weeklyBelow, { ...pivot, price: 29150 }, rung] }, 'g-line', 'long').destinations.map((s) => [s.label, s.expect, s.beeline])).toEqual([['Weekly Job Pivot 1A', 'hold', null]])
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

  it('price above the pivot band: the edges lead as ONE two-way each (feat-152) — the upper edge (bias side), the lower edge (fork side) — and the LVN rebid now fits under the cap', () => {
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.condition, x.direction])).toEqual([
      ['JBA 1 low', 'mid-zone-two-way', 'two-way'],
      ['JBA 1 high', 'fail-or-hold', 'two-way'],
      ['JBA 1 low', 'fail-or-hold', 'two-way'],
      ['Rip', 'hold-traverse', 'long'],
    ])
    // the stacked upper edge leads with the fail leg
    expect(p.plays[1].summary).toContain('fail first')
    expect(p.pruned.some((x) => x.label.startsWith('Rip'))).toBe(false)
  })

  it('yesterday\'s low is on the far side of the line: the fork short — "lose the pivot → build below 7955, sell the pullback → the 7720s"', () => {
    // a JBA edge is a real important level: the deterministic read is ONE two-way play (feat-152), conditional on losing the line
    expect(draftsAt(GOAL, 'pdl').map((d) => [d.direction, d.condition])).toEqual([['two-way', 'fail-or-hold']])
    expect(draftsAt(GOAL, 'pdl')[0].trigger).toContain('Only once price has lost the Daily Job Pivot: Two-way at JBA 1 low (+1) 7955')
    // the LLM path's legs: the fork hold, and the bounce against it as a fail
    expect(draftAt(GOAL, 'pdl', 'long').trigger).toContain('Only once price has lost the Daily Job Pivot: Look below JBA 1 low (+1) 7955 and fail')
    const pdl = draftAt(GOAL, 'pdl', 'short')
    expect(pdl).toMatchObject({ stance: 'continuation', direction: 'short', condition: 'build-beyond-continuation', activation: { state: 'conditional', grounding: 'none' } })
    expect(pdl.band).toMatchObject({ low: 7955, high: 7955, memberLabels: ['JBA 1 low', 'PDL'] })
    expect(pdl.summary).toContain('Lose the Daily Job Pivot → Break-and-hold below JBA 1 low (+1) 7955, sell the pullback → Weekly Job Pivot 1B 7722')
    expect(pdl.destinations.map((s) => [s.label, s.expect])).toEqual([['Weekly Job Pivot 1B', 'hold']])
    expect(pdl.invalidation).toMatchObject({ low: 7955, side: 'above' })
    expect(pdl.invalidation.condition).toContain('the rubber meets the road')
    expect(pdl.invalidation.thenSeek).toMatchObject({ label: 'Weekly Job Pivot (+1)', low: 7970 })
    expect(pdl.invalidation.thenSeek?.text).toBe('above 7955 (JBA 1 low (+1)) → seek Weekly Job Pivot (+1) 7970')
    // in the plan the level is one two-way play
    expect(p.plays.filter((x) => x.band.memberLabels.includes('PDL') && x.stance !== 'stand-down').map((x) => x.direction)).toEqual(['two-way'])
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

  it('the lone prior-week high is skipped as a trigger (R12) but kept as a destination; the pivot band (the line) is never a play', () => {
    expect(p.pruned.find((x) => x.label.startsWith('PW High'))?.reason).toContain('R12: skipped')
    expect(playAt(p, 'Weekly Job Pivot')).toBeUndefined()
    expect(playAt(p, 'Daily Job Pivot')).toBeUndefined()
  })
})
