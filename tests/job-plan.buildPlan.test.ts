import { describe, expect, it } from 'vitest'
import type { JobPlan, Play } from '@/knowledge/schema/job-plan.schema'
import { buildPlan, insufficiencyReasons } from '@/lib/job-plan/buildPlan'
import type { BandOriginFacts, Excursion } from '@/lib/job-plan/contextTypes'
import { MAX_STAGES } from '@/lib/job-plan/destinationChain'
import { REPEATED_DEFENSE_MIN } from '@/lib/job-plan/playGrammar'
import { MAX_PLAYS, PLANNER_REVISION } from '@/lib/job-plan/rules'
import { synthContext, type SynthRef, type SynthSpec } from './helpers/jobPlanContext'

/**
 * buildPlan grammar + precedence over hand-built contexts (NQ, merge 20 /
 * cap 40 unless stated). BASE geometry, well separated so every reference is
 * its own band: ONL 29260, G line 29300, price 29360, daily pivot 29393.5,
 * Rip 29420, ONH 29460, weekly pivot 29500, PDH 29650, weekly 1A rung 29700,
 * PW High 29750 — no JBA box, the weekly read at its pivot (no re-ordering),
 * price between the G line and the pivot but inside the pivot's edge-play
 * distance (no mid-zone), so exactly four watched bands arm. BOXED adds the
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
const boxedWith = (facts: SynthSpec['facts'], spec: Partial<SynthSpec> = {}) => boxed({ ...spec, facts })
/** The directional play at a band (the stand-down names both zone edges and is excluded). */
const playAt = (p: JobPlan, memberLabel: string): Play | undefined => p.plays.find((x) => x.stance !== 'stand-down' && x.band.memberLabels.includes(memberLabel))

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

const holding = (side: 'ABOVE' | 'BELOW'): BandOriginFacts['holdingSide'] => ({
  side,
  windowMinutes: 20,
  closes: 15,
  scope: 'session',
  from: '2026-08-24T09:10:00',
  to: '2026-08-24T09:28:00',
})

describe('the five-condition grammar, one play per grounded band', () => {
  it('look-and-fail (R5): a failed look below the G line arms a rebid, joins the rotation back across, and is the primary lean', () => {
    const p = withFacts({ 'g-line': { latestFailedLook: failedLook('below') } })
    const g = playAt(p, 'G line (week open)')!
    expect(g).toMatchObject({ rank: 1, primary: true, stance: 'rebid', direction: 'long', condition: 'look-and-fail' })
    expect(g.activation).toMatchObject({ state: 'armed', grounding: 'failed-look', factAt: '2026-08-24T09:05:00', demoted: false })
    expect(g.activation.rulesFired).toEqual(expect.arrayContaining(['R5', 'R12']))
    expect(g.activation.evidence).toContain('EARLY (R5)')
    expect(g.band).toMatchObject({ bandId: expect.any(String), low: 29300, high: 29300, role: 'actionable-now', side: 'below', distancePts: 60 })
    expect(g.invalidation).toMatchObject({ low: 29300, high: 29300, side: 'below' })
    expect(g.invalidation.condition).toContain('Acceptance below 29300')
    expect(g.invalidation.thenSeek).toMatchObject({ label: 'ONL', low: 29260, high: 29260 })
    expect(g.destinations.map((s) => [s.label, s.low, s.expect])).toEqual([
      ['Daily Job Pivot', 29393.5, 'gate-continuation'],
      ['Rip', 29420, 'gate-continuation'],
      ['ONH', 29460, 'reoffer'],
    ])
    expect(g.destinations[0].beeline).toEqual({ dontCounter: true, destinationLabel: 'Rip', destinationLow: 29420, destinationHigh: 29420 })
    expect(g.destinations[2].beeline).toBeNull()
    expect(g.responseDeadline).toBeNull()
    expect(g.dont).toContain("Don't fade the break itself")
    expect(g.summary).toBe('Look-below-and-fail at G line (week open) 29300 → rotate back across: press Daily Job Pivot 29393.5 → press Rip 29420; build above → ONH 29460; below 29300 (G line (week open)) → seek ONL 29260')
    expect(p.lean).toMatchObject({ playId: g.id, basis: 'failed-look' })
  })

  it('approach-failure (R7): a stall short of the pivot from below arms a reoffer targeting back across', () => {
    const p = withFacts({
      'daily-pivot': {
        approachFailure: { from: 'below', closestApproachPts: 30, closestApproachAt: '2026-08-24T09:10:00', closestPrice: 29363.5, retreatPts: 25, minutesSinceClosest: 20, scope: 'session' },
      },
    })
    const pivot = playAt(p, 'Daily Job Pivot')!
    expect(pivot).toMatchObject({ rank: 1, primary: true, stance: 'reoffer', direction: 'short', condition: 'approach-failure' })
    expect(pivot.activation).toMatchObject({ state: 'armed', grounding: 'approach-failure', factAt: '2026-08-24T09:10:00' })
    expect(pivot.activation.rulesFired).toContain('R7')
    expect(pivot.invalidation).toMatchObject({ low: 29393.5, high: 29393.5, side: 'above' })
    expect(pivot.destinations.map((s) => s.low)).toEqual([29300, 29260])
    expect(pivot.destinations.at(-1)?.expect).toBe('rebid')
    expect(pivot.dont).toContain('the stall short of it is the trigger')
    expect(pivot.responseDeadline).toBeNull()
  })

  it('build-beyond-continuation (R6): acceptance below the G line is a continuation short, no fade at that band, don\'t-counter until back inside', () => {
    const p = withFacts(
      { 'g-line': { acceptance: { state: 'accepted', direction: 'below', sinceAt: '2026-08-24T09:00:00', minutes: 28, scope: 'session' } } },
      { price: 29285 },
    )
    const g = playAt(p, 'G line (week open)')!
    expect(g).toMatchObject({ rank: 1, primary: true, stance: 'continuation', direction: 'short', condition: 'build-beyond-continuation' })
    expect(g.activation).toMatchObject({ state: 'armed', grounding: 'accepted', factAt: '2026-08-24T09:00:00' })
    expect(g.activation.rulesFired).toContain('R6')
    expect(g.invalidation).toMatchObject({ low: 29300, high: 29300, side: 'above' })
    expect(g.invalidation.condition).toContain('close back inside')
    expect(g.destinations.map((s) => s.low)).toEqual([29260])
    expect(g.dont).toContain("Don't counter until price is back inside")
    expect(p.plays.filter((x) => x.band.bandId === g.band.bandId)).toHaveLength(1)
    expect(p.lean.basis).toBe('accepted')
  })

  it('acceptance that merely spans the whole observation window is not a fresh initiative — the band was never crossed', () => {
    const p = withFacts(
      { 'g-line': { acceptance: { state: 'accepted', direction: 'below', sinceAt: '2026-08-23T17:00:00', minutes: 900, scope: 'overnight' } } },
      { price: 29285 },
    )
    expect(playAt(p, 'G line (week open)')?.condition).not.toBe('build-beyond-continuation')
    expect(playAt(p, 'G line (week open)')?.activation.state).toBe('conditional')
  })

  it('hold-traverse (R8): holding BELOW the pivot inside the edge-play distance arms a reoffer with the R11 deadline as text', () => {
    const p = withFacts({ 'daily-pivot': { holdingSide: holding('BELOW') } })
    const pivot = playAt(p, 'Daily Job Pivot')!
    expect(pivot).toMatchObject({ stance: 'reoffer', direction: 'short', condition: 'hold-traverse' })
    expect(pivot.activation).toMatchObject({ state: 'armed', grounding: 'holding-side', factAt: '2026-08-24T09:28:00' })
    expect(pivot.activation.rulesFired).toEqual(expect.arrayContaining(['R8', 'R11', 'R12']))
    expect(pivot.responseDeadline).toMatchObject({ minutes: 30, evaluatedByPlanner: false })
    expect(pivot.responseDeadline?.text).toContain('30 min of arrival at Daily Job Pivot 29393.5')
    expect(pivot.trigger).toContain('Reoffer Daily Job Pivot 29393.5 on the arrival from below')
    expect(pivot.destinations[0]).toMatchObject({ label: 'G line (week open)', low: 29300 })
  })

  it('hold-traverse guards: the holding side counts only within 2× merge of the band, and only on the band\'s own side of price', () => {
    const far = withFacts({ 'daily-pivot': { holdingSide: holding('BELOW') } }, { price: 29350 })
    expect(playAt(far, 'Daily Job Pivot')?.activation).toMatchObject({ state: 'conditional', grounding: 'none' })
    const inconsistent = withFacts({ 'daily-pivot': { holdingSide: holding('ABOVE') } })
    expect(playAt(inconsistent, 'Daily Job Pivot')?.activation).toMatchObject({ state: 'conditional', grounding: 'none' })
    const straddling = withFacts({ 'daily-pivot': { holdingSide: { ...holding('ABOVE')!, side: 'STRADDLING' } } })
    expect(playAt(straddling, 'Daily Job Pivot')?.activation.grounding).toBe('none')
  })

  it('repeated defense (R9): two session defenses ground a hold-traverse; one does not', () => {
    const interaction = (session: number): BandOriginFacts['interaction'] => ({
      interacted: true,
      prints: 4,
      firstAt: '2026-08-24T08:50:00',
      lastAt: '2026-08-24T09:20:00',
      defenses: { session, overnight: 0 },
      failedLookThisSession: false,
      triggerStatus: 'full',
    })
    expect(REPEATED_DEFENSE_MIN).toBe(2)
    const twice = withFacts({ 'g-line': { interaction: interaction(2) } })
    expect(playAt(twice, 'G line (week open)')).toMatchObject({ condition: 'hold-traverse', direction: 'long', stance: 'rebid' })
    expect(playAt(twice, 'G line (week open)')?.activation).toMatchObject({ state: 'armed', grounding: 'defense', factAt: '2026-08-24T09:20:00' })
    const once = withFacts({ 'g-line': { interaction: interaction(1) } })
    expect(playAt(once, 'G line (week open)')?.activation.grounding).toBe('none')
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

  it('watched bands default by structure: overnight / prior-day / JBA edges wait for a look-and-fail, interior bands for a hold', () => {
    const p = plan()
    expect(p.plays.map((x) => x.band.memberLabels[0])).toEqual(['Daily Job Pivot', 'G line (week open)', 'Rip', 'ONL'])
    expect(playAt(p, 'G line (week open)')).toMatchObject({ condition: 'hold-traverse', direction: 'long', stance: 'rebid' })
    expect(playAt(p, 'G line (week open)')?.activation).toMatchObject({ state: 'conditional', grounding: 'none', factAt: null })
    expect(playAt(p, 'ONL')).toMatchObject({ condition: 'look-and-fail', direction: 'long', stance: 'rebid' })
    expect(playAt(p, 'ONL')?.activation.state).toBe('conditional')
    expect(playAt(p, 'Daily Job Pivot')).toMatchObject({ condition: 'hold-traverse', direction: 'short', stance: 'reoffer' })
    expect(playAt(p, 'Rip')).toMatchObject({ condition: 'hold-traverse', direction: 'short' })
    expect(p.lean).toMatchObject({ playId: null, basis: 'none' })
    expect(p.plays.some((x) => x.primary)).toBe(false)
    const big = boxed({ reachPts: 500 })
    expect(playAt(big, 'JBA 1 high')).toMatchObject({ condition: 'look-and-fail', direction: 'short', activation: { state: 'conditional' } })
    expect(playAt(big, 'JBA 1 low')).toMatchObject({ condition: 'look-and-fail', direction: 'long', activation: { state: 'conditional' } })
  })
})

describe('the precedence table', () => {
  it('failed look > approach failure > accepted > stand-down > holding side > defense > watched, then freshness', () => {
    const p = boxedWith(
      {
        onl: { latestFailedLook: failedLook('below', 'LATE', '2026-08-24T09:00:00') },
        'daily-pivot': { approachFailure: { from: 'below', closestApproachPts: 30, closestApproachAt: '2026-08-24T09:20:00', closestPrice: 29363.5, retreatPts: 25, minutesSinceClosest: 10, scope: 'session' } },
        'g-line': { holdingSide: holding('ABOVE') },
      },
      { price: 29335, reachPts: 500 },
    )
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.activation.grounding])).toEqual([
      ['ONL', 'failed-look'],
      ['Daily Job Pivot', 'approach-failure'],
      ['JBA 1 low', 'mid-zone'],
      ['G line (week open)', 'holding-side'],
    ])
    expect(p.pruned.map((x) => x.reason)).toEqual(expect.arrayContaining([expect.stringContaining(`R12: max ${MAX_PLAYS} branches`)]))
  })

  it('an EARLY failed look outranks a LATE one; fresher wins inside a tier', () => {
    const p = withFacts({
      onl: { latestFailedLook: failedLook('below', 'EARLY', '2026-08-24T08:55:00') },
      'daily-pivot': { latestFailedLook: failedLook('above', 'LATE', '2026-08-24T09:20:00') },
    })
    expect(p.plays.map((x) => x.band.memberLabels[0]).slice(0, 2)).toEqual(['ONL', 'Daily Job Pivot'])
    const fresher = withFacts({
      onl: { latestFailedLook: failedLook('below', 'EARLY', '2026-08-24T08:55:00') },
      'daily-pivot': { latestFailedLook: failedLook('above', 'EARLY', '2026-08-24T09:20:00') },
    })
    expect(fresher.plays.map((x) => x.band.memberLabels[0]).slice(0, 2)).toEqual(['Daily Job Pivot', 'ONL'])
  })

  it('mid-box stand-down beats weak directional context (holding side) but not a confirmed initiative', () => {
    const weak = boxedWith({ 'g-line': { holdingSide: holding('ABOVE') } }, { price: 29335 })
    expect(weak.plays[0].stance).toBe('stand-down')
    expect(weak.plays[1].activation.grounding).toBe('holding-side')
    const initiative = boxedWith(
      { 'jba:0:low': { acceptance: { state: 'accepted', direction: 'above', sinceAt: '2026-08-24T09:00:00', minutes: 28, scope: 'session' } } },
      { reachPts: 500 },
    )
    expect(initiative.plays[0]).toMatchObject({ condition: 'build-beyond-continuation', direction: 'long' })
    expect(initiative.plays[1].stance).toBe('stand-down')
  })

  it('touched bands (R9) are demoted below untouched watched bands unless they produced a failed look or a defense', () => {
    const touched: BandOriginFacts['interaction'] = { interacted: true, prints: 2, firstAt: '2026-08-24T08:40:00', lastAt: '2026-08-24T08:41:00', defenses: { session: 0, overnight: 0 }, failedLookThisSession: false, triggerStatus: 'demoted' }
    const p = withFacts({ 'g-line': { interaction: touched } })
    const g = playAt(p, 'G line (week open)')!
    expect(g.activation.demoted).toBe(true)
    expect(g.activation.rulesFired).toContain('R9')
    expect(g.activation.evidence).toContain('demoted as a fresh trigger (R9)')
    expect(g.rank).toBeGreaterThan(playAt(p, 'ONL')!.rank)
    const kept = withFacts({ 'g-line': { interaction: { ...touched, failedLookThisSession: true, triggerStatus: 'full' }, latestFailedLook: failedLook('below') } })
    expect(playAt(kept, 'G line (week open)')).toMatchObject({ rank: 1, activation: { demoted: false } })
  })

  it('weekly context re-orders equal-precedence plays but never manufactures one', () => {
    const above = plan({ weekly: { valueLow: 29000, pivot: 29100, valueHigh: 29200 } })
    const below = plan({ weekly: { valueLow: 29500, pivot: 29600, valueHigh: 29700 } })
    const conditional = (p: JobPlan) => p.plays.filter((x) => x.activation.grounding === 'none').map((x) => x.direction)
    expect(above.context.location.vsWeeklyValue.read).toBe('above')
    expect(below.context.location.vsWeeklyValue.read).toBe('below')
    expect(conditional(above)[0]).toBe('long')
    expect(conditional(below)[0]).toBe('short')
    const ids = (p: JobPlan) => p.plays.map((x) => `${x.band.bandId}:${x.condition}:${x.activation.state}`).sort()
    expect(ids(above)).toEqual(ids(below))
    expect(above.plays.every((x) => !x.activation.evidence.includes('weekly'))).toBe(true)
  })
})

describe('R12 cardinality and pruning', () => {
  it('arms at most 2 bands per side nearest-first plus the enclosing zone\'s edges, max 4 plays, and lists every pruned band with its reason', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays.map((x) => x.band.memberLabels[0])).toEqual(['JBA 1 low', 'JBA 1 low', 'JBA 1 high', 'Daily Job Pivot'])
    expect(p.plays).toHaveLength(MAX_PLAYS)
    const labels = p.pruned.map((x) => `${x.label} :: ${x.reason}`)
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^ONH 29460 :: R12: beyond the 2 nearest armed bands above/)]))
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^PW High 29750 :: R12: skipped — no confluence and a lowest-tier source \(mgi-other\)/)]))
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/R12: max 4 branches/)]))
    expect(p.pruned.some((x) => x.label.startsWith('JBA 1 low') && x.reason.includes('beyond the 2 nearest'))).toBe(false)
    expect(p.pruned.some((x) => x.label.startsWith('Weekly Job Pivot 1A'))).toBe(false)
    expect(p.pruned.filter((x) => x.reason.includes('max 4')).map((x) => x.label)).toEqual(['G line (week open) 29300', 'Rip 29420', 'ONL 29260'])
  })

  it('an enclosing-zone edge beyond the R4 reach stays a destination (never armed) — the stand-down still names it', () => {
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

  it('a band price sits inside with no directional read is pruned, not guessed', () => {
    const p = plan({ price: 29300 })
    expect(playAt(p, 'G line (week open)')).toBeUndefined()
    expect(p.pruned.find((x) => x.label.startsWith('G line'))?.reason).toContain('no directional read')
  })

  it('caps the destination chain and never chains through rung-only bands unless nothing else is out there', () => {
    const p = withFacts({ 'g-line': { latestFailedLook: failedLook('below') } })
    const g = playAt(p, 'G line (week open)')!
    expect(g.destinations.length).toBeLessThanOrEqual(MAX_STAGES)
    expect(g.destinations.every((s) => s.label !== 'Weekly Job Pivot 1A')).toBe(true)
    const below = BASE_REFS.filter((r) => r.price <= 29300).map((r) => (r.source === 'weekly-job-pivot' ? { ...r, price: 29100 } : r))
    const weeklyBelow = { id: 'weekly-pivot', source: 'weekly-job-pivot' as const, price: 29100, label: 'Weekly Job Pivot' }
    const rung = BASE_REFS.find((r) => r.source === 'weekly-rung')!
    const pivot = BASE_REFS.find((r) => r.source === 'daily-job-pivot')!
    const withPivot = withFacts({ 'g-line': { latestFailedLook: failedLook('below') } }, { refs: [...below, weeklyBelow, pivot, rung] })
    expect(playAt(withPivot, 'G line (week open)')!.destinations.map((s) => [s.label, s.expect])).toEqual([['Daily Job Pivot', 'reoffer']])
    const rungOnly = withFacts({ 'g-line': { latestFailedLook: failedLook('below') } }, { refs: [...below, weeklyBelow, { ...pivot, price: 29150 }, rung] })
    expect(playAt(rungOnly, 'G line (week open)')!.destinations.map((s) => [s.label, s.expect, s.beeline])).toEqual([['Weekly Job Pivot 1A', 'hold', null]])
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

  it('a ready plan with nothing armable stands down explicitly', () => {
    const p = plan({ reachPts: 10 })
    expect(p.status).toBe('ready')
    expect(p.plays).toEqual([])
    expect(p.standDownReasons).toEqual(['no armable band in the actionable set — nothing to plan; destinations only'])
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
    expect(p.meta.sourceHashes).toEqual({ jobStudyDaily: null, jobStudyWeekly: null, mgi: 'abc', execBars: null, htfBars: null, fiveDayProfile: null, fourHourProfile: null })
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
      { id: 'node:5d:0', source: 'profile-5d', price: 7980, label: '5-day lvn (primary) #1', node: { primary: true, prominence: 1 } },
      { id: 'rip', source: 'rip', price: 7982, label: 'Rip' },
      { id: 'node:5d:1', source: 'profile-5d', price: 8004, label: '5-day hvn-edge #2', node: { kind: 'hvn', prominence: 2, edgeBelow: 'ledge', edgeAbove: 'flat' } },
      { id: 'jba:0:high', source: 'jba-edge', price: 8005, label: 'JBA 1 high', boxIndex: 0 },
      { id: 'pdh', source: 'previous-day-extreme', price: 8005, label: 'PDH' },
      { id: 'mgi:weekly.pwHigh', source: 'mgi-other', price: 8040, label: 'PW High' },
    ],
    boxes: [{ low: 7955, high: 8005 }],
    weekly: { valueLow: 7930, pivot: 7970, valueHigh: 8010 },
    daily: { valueLow: 7960, pivot: 7970, valueHigh: 7985 },
    facts: { rip: { holdingSide: { side: 'ABOVE', windowMinutes: 20, closes: 12, scope: 'session', from: '2026-08-24T09:08:00', to: '2026-08-24T09:28:00' } } },
  }

  const p = buildPlan({ context: synthContext(GOAL) })

  it('"stay inside → balance": the two-way declaration between yesterday\'s low and the JBA high leads', () => {
    expect(p.status).toBe('ready')
    expect(p.plays).toHaveLength(4)
    expect(p.plays[0]).toMatchObject({ stance: 'stand-down', condition: 'mid-zone-two-way', primary: true })
    expect(p.plays[0].summary).toBe('Stay inside 7955–8005 (JBA 1 low – JBA 1 high) → balance; play the edges, stand down in the middle')
    expect(p.lean.basis).toBe('mid-zone')
  })

  it('"rebid 7980–82 into the LVN → press the 8004s; build above → attack prior week high"', () => {
    const rebid = p.plays[1]
    expect(rebid).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'hold-traverse', activation: { state: 'armed', grounding: 'holding-side' } })
    expect(rebid.band).toMatchObject({ low: 7980, high: 7982, memberLabels: ['Rip', '5-day lvn (primary) #1'] })
    expect(rebid.destinations.map((s) => [s.label, s.low, s.high, s.expect])).toEqual([
      ['JBA 1 high (+2)', 8004, 8005, 'gate-continuation'],
      ['PW High', 8040, 8040, 'reoffer'],
    ])
    expect(rebid.destinations[0].beeline).toEqual({ dontCounter: true, destinationLabel: 'PW High', destinationLow: 8040, destinationHigh: 8040 })
    expect(rebid.responseDeadline?.minutes).toBe(30)
    expect(rebid.summary).toBe('Rebid 7980–7982 into Rip (+1) → press JBA 1 high (+2) 8004–8005; build above → PW High 8040; below 7980 (Rip (+1)) → seek Weekly Job Pivot (+1) 7970')
  })

  it('"look-below-and-fail → rotate back across" at yesterday\'s low, and "below yesterday\'s low → seek the 7720s" as its flip clause', () => {
    const pdl = playAt(p, 'PDL')!
    expect(pdl).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'look-and-fail', activation: { state: 'conditional', grounding: 'none' } })
    expect(pdl.band).toMatchObject({ low: 7955, high: 7955, memberLabels: ['JBA 1 low', 'PDL'] })
    expect(pdl.destinations[0]).toMatchObject({ label: 'Weekly Job Pivot (+1)', low: 7970 })
    expect(pdl.invalidation).toMatchObject({ low: 7955, side: 'below' })
    expect(pdl.invalidation.thenSeek).toMatchObject({ label: 'Weekly Job Pivot 1B', low: 7722, high: 7722, expect: 'hold' })
    expect(pdl.invalidation.thenSeek?.text).toBe('below 7955 (JBA 1 low (+1)) → seek Weekly Job Pivot 1B 7722')
  })

  it('the JBA high is the other watched edge; the lone prior-week high is skipped as a trigger (R12) but kept as a destination', () => {
    const high = playAt(p, 'JBA 1 high')!
    expect(high).toMatchObject({ stance: 'reoffer', direction: 'short', condition: 'look-and-fail', activation: { state: 'conditional' } })
    expect(p.pruned.find((x) => x.label.startsWith('PW High'))?.reason).toContain('R12: skipped')
    expect(p.pruned.find((x) => x.label.startsWith('Weekly Job Pivot (+1)'))?.reason).toContain('max 4')
  })
})
