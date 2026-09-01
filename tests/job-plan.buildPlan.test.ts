import { describe, expect, it } from 'vitest'
import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import { buildPlan, insufficiencyReasons } from '@/lib/job-plan/buildPlan'
import type { BandOriginFacts, Excursion } from '@/lib/job-plan/contextTypes'
import { MAX_STAGES } from '@/lib/job-plan/destinationChain'
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
/** The directional play at a band (the stand-down names both zone edges and is excluded). */
const playAt = (p: JobPlan, memberLabel: string) => p.plays.find((x) => x.stance !== 'stand-down' && x.band.memberLabels.includes(memberLabel))

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

describe('the frame: the tier-one MGI ladder — G line > weekly pivot > weekly extensions > daily pivot, most important in reach wins', () => {
  it('names the operative line, the side and the productive direction', () => {
    const p = plan()
    expect(p.frame).toMatchObject({ referenceId: 'g-line', label: 'G line (week open)', price: 29300, side: 'above', distancePts: 60 })
    expect(p.frame?.text).toContain('Above the G line (week open) 29300')
    expect(p.frame?.text).toContain('upside is productive')
    expect(p.frame?.provenance).toEqual({ kind: 'reference', referenceIds: ['g-line'], derivation: null })
  })

  it('the G line in reach outranks a nearer weekly pivot — importance, never blind proximity', () => {
    expect(plan({ price: 29450 }).frame).toMatchObject({ referenceId: 'g-line', side: 'above', distancePts: 150 })
  })

  it('with the G line out of reach the weekly pivot frames, even when the daily pivot is nearer', () => {
    const p = plan({ refs: BASE_REFS.filter((r) => r.source !== 'g-line') })
    expect(p.frame).toMatchObject({ referenceId: 'weekly-pivot', side: 'below', distancePts: 140 })
  })

  it('a weekly pivot extension frames when the pivots are out of reach ("worked our way up to the 1A")', () => {
    const p = plan({ price: 29660, reachPts: 100 })
    expect(p.frame).toMatchObject({ referenceId: 'rung:weekly:1A', label: 'Weekly Job Pivot 1A', side: 'below', distancePts: 40 })
  })

  it('the fresh daily pivot frames when every weekly line is out of reach — ranked right below the weekly MGI', () => {
    const p = plan({ price: 29370, reachPts: 30 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below', distancePts: 23.5 })
  })

  it('nothing in reach → the nearest tier-one line still frames, stated at its distance', () => {
    const p = plan({ reachPts: 10 })
    expect(p.frame).toMatchObject({ referenceId: 'daily-pivot', side: 'below', distancePts: 33.5 })
  })

  it('within one merge tolerance of the line the frame is AT it — balance, no productive side', () => {
    const p = plan({ price: 29310 })
    expect(p.frame).toMatchObject({ referenceId: 'g-line', side: 'at' })
    expect(p.frame?.text).toContain('balance around the line')
  })

  it('an insufficient plan carries no frame', () => {
    const p = plan({ dataQuality: { sufficient: false, issues: [{ code: 'export_skew', severity: 'insufficient', message: 'skewed' }] } })
    expect(p.status).toBe('insufficient')
    expect(p.frame).toBeNull()
  })
})

describe('the forward-conditional grammar: expected response on arrival, both outcomes stated', () => {
  it('a band below price watches for bid: rebid on arrival, R11 deadline, build-below flip with acceleration past the G line', () => {
    const p = plan()
    const g = playAt(p, 'G line (week open)')!
    expect(g).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'hold-traverse' })
    expect(g.activation).toMatchObject({ state: 'conditional', grounding: 'none', factAt: null, demoted: false })
    expect(g.activation.evidence).toContain('Expect the bid at G line (week open) 29300')
    expect(g.trigger).toContain('Rebid G line (week open) 29300 on the arrival from above')
    expect(g.trigger).toContain('a look below and fail is the stronger green light')
    expect(g.responseDeadline).toMatchObject({ minutes: 30, evaluatedByPlanner: false })
    expect(g.invalidation).toMatchObject({ low: 29300, high: 29300, side: 'below' })
    expect(g.invalidation.condition).toContain('Build below 29300')
    expect(g.invalidation.condition).toContain('the rubber meets the road')
    expect(g.invalidation.thenSeek).toMatchObject({ label: 'ONL', low: 29260 })
    expect(g.destinations.map((s) => [s.label, s.low, s.expect])).toEqual([
      ['Daily Job Pivot', 29393.5, 'gate-continuation'],
      ['Rip', 29420, 'gate-continuation'],
      ['ONH', 29460, 'reoffer'],
    ])
    expect(g.destinations[0].beeline).toEqual({ dontCounter: true, destinationLabel: 'Rip', destinationLow: 29420, destinationHigh: 29420 })
    expect(g.dont).toContain("Don't buy ahead of")
  })

  it('a band above price watches for offer: reoffer on arrival targeting back across', () => {
    const pivot = playAt(plan(), 'Daily Job Pivot')!
    expect(pivot).toMatchObject({ stance: 'reoffer', direction: 'short', condition: 'hold-traverse' })
    expect(pivot.activation.evidence).toContain('Expect the offer at Daily Job Pivot 29393.5 (33.5 pts above)')
    expect(pivot.invalidation).toMatchObject({ low: 29393.5, side: 'above' })
    expect(pivot.destinations.map((s) => s.low)).toEqual([29300, 29260])
  })

  it('overnight / prior-day / JBA edges wait for the look-and-fail, not the arrival alone', () => {
    const onl = playAt(plan(), 'ONL')!
    expect(onl).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'look-and-fail' })
    expect(onl.trigger).toContain('Look below ONL 29260 and fail')
    expect(onl.activation.evidence).toContain('a sweep beyond that fails is the trigger, not the arrival alone')
    expect(onl.responseDeadline).toBeNull()
    expect(onl.dont).toContain("Don't fade the break itself")
    const big = boxed({ reachPts: 500 })
    expect(playAt(big, 'JBA 1 high')).toMatchObject({ condition: 'look-and-fail', direction: 'short' })
    expect(playAt(big, 'JBA 1 low')).toMatchObject({ condition: 'look-and-fail', direction: 'long' })
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
    expect(p.plays.map((x) => x.condition)).not.toContain('build-beyond-continuation')
  })

  it('a band price sits inside leans with the frame', () => {
    const p = plan({ price: 29420 })
    const rip = playAt(p, 'Rip')!
    expect(p.frame).toMatchObject({ referenceId: 'g-line', side: 'above' })
    expect(rip).toMatchObject({ stance: 'rebid', direction: 'long' })
    expect(rip.band.side).toBe('inside')
    expect(rip.trigger).toContain('Lean on Rip 29420 from here')
    const below = plan({ price: 29420, refs: BASE_REFS.map((r) => (r.source === 'g-line' ? { ...r, price: 29500 } : r.source === 'weekly-job-pivot' ? { ...r, price: 29800 } : r)) })
    expect(below.frame).toMatchObject({ side: 'below' })
    expect(playAt(below, 'Rip')).toMatchObject({ stance: 'reoffer', direction: 'short' })
  })

  it('a band price sits inside with no frame direction is pruned, not guessed', () => {
    const p = plan({ price: 29300 })
    expect(playAt(p, 'G line (week open)')).toBeUndefined()
    expect(p.pruned.find((x) => x.label.startsWith('G line'))?.reason).toContain('no directional read')
  })

  it('R9 freshness: a touched band is demoted as a fresh trigger and ranks last', () => {
    const touched: BandOriginFacts['interaction'] = { interacted: true, prints: 2, firstAt: '2026-08-24T08:40:00', lastAt: '2026-08-24T08:41:00', defenses: { session: 0, overnight: 0 }, failedLookThisSession: false, triggerStatus: 'demoted' }
    const p = withFacts({ 'g-line': { interaction: touched } })
    const g = playAt(p, 'G line (week open)')!
    expect(g.activation.demoted).toBe(true)
    expect(g.activation.state).toBe('conditional')
    expect(g.activation.rulesFired).toContain('R9')
    expect(g.activation.evidence).toContain('demoted as a fresh trigger (R9)')
    expect(g.rank).toBe(p.plays.length)
    const kept = withFacts({ 'g-line': { interaction: { ...touched, failedLookThisSession: true, triggerStatus: 'full' } } })
    expect(playAt(kept, 'G line (week open)')).toMatchObject({ rank: 1, activation: { demoted: false } })
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
  it('above the G line the longs lead and the sides alternate; the frame-aligned play is the primary look', () => {
    const p = plan()
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.direction])).toEqual([
      ['G line (week open)', 'long'],
      ['Daily Job Pivot', 'short'],
      ['ONL', 'long'],
      ['Rip', 'short'],
    ])
    expect(p.plays[0].primary).toBe(true)
    expect(p.lean).toMatchObject({ playId: p.plays[0].id, basis: 'frame' })
    expect(p.lean.text).toContain('frame-aligned look (above the G line (week open))')
  })

  it('below the line the shorts lead (mirrored frame)', () => {
    const p = plan({ price: 29240 })
    expect(p.frame).toMatchObject({ referenceId: 'g-line', side: 'below' })
    expect(p.plays[0].direction).toBe('short')
  })

  it('the enclosing zone\'s edges rank first within a side ("play the edges")', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays.map((x) => x.band.memberLabels[0])).toEqual(['JBA 1 low', 'JBA 1 low', 'JBA 1 high', 'G line (week open)'])
    expect(p.plays[0].stance).toBe('stand-down')
  })

  it('at the frame line no side leads — the enclosing zone\'s edges rank first, then nearest, and the lean names the at-line frame', () => {
    const p = plan({ price: 29310 })
    expect(p.frame?.side).toBe('at')
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.band.distancePts])).toEqual([
      ['G line (week open)', 10],
      ['Daily Job Pivot', 83.5],
      ['ONL', 50],
      ['Rip', 110],
    ])
    expect(p.lean.text).toContain('(frame: at the G line (week open))')
  })
})

describe('R12 cardinality and pruning', () => {
  it('arms at most 2 bands per side nearest-first plus the enclosing zone\'s edges, max 4 plays, and lists every pruned band with its reason', () => {
    const p = boxed({ reachPts: 500 })
    expect(p.plays).toHaveLength(MAX_PLAYS)
    const labels = p.pruned.map((x) => `${x.label} :: ${x.reason}`)
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^ONH 29460 :: R12: beyond the 2 nearest armed bands above/)]))
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
    expect(playAt(withPivot, 'G line (week open)')!.destinations.map((s) => [s.label, s.expect])).toEqual([['Daily Job Pivot', 'reoffer']])
    const rungOnly = plan({ refs: [...below, weeklyBelow, { ...pivot, price: 29150 }, rung] })
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

  it('frames off the weekly pivot (no G line in the inventory) and leads with the two-way declaration', () => {
    expect(p.status).toBe('ready')
    expect(p.frame).toMatchObject({ referenceId: 'weekly-pivot', side: 'above', distancePts: 20 })
    expect(p.plays[0]).toMatchObject({ stance: 'stand-down', condition: 'mid-zone-two-way', primary: true })
    expect(p.plays[0].summary).toBe('Stay inside 7955–8005 (JBA 1 low – JBA 1 high) → balance; play the edges, stand down in the middle')
    expect(p.lean.basis).toBe('mid-zone')
  })

  it('both edges are watched with look-and-fail forks and the near LVN rebid rides the frame side', () => {
    expect(p.plays.map((x) => [x.band.memberLabels[0], x.condition, x.direction])).toEqual([
      ['JBA 1 low', 'mid-zone-two-way', 'two-way'],
      ['JBA 1 low', 'look-and-fail', 'long'],
      ['JBA 1 high', 'look-and-fail', 'short'],
      ['Rip', 'hold-traverse', 'long'],
    ])
  })

  it('"look-below-and-fail → rotate back across" at yesterday\'s low, and "below yesterday\'s low → seek the 7720s" as its flip clause', () => {
    const pdl = playAt(p, 'PDL')!
    expect(pdl).toMatchObject({ stance: 'rebid', direction: 'long', condition: 'look-and-fail', activation: { state: 'conditional', grounding: 'none' } })
    expect(pdl.band).toMatchObject({ low: 7955, high: 7955, memberLabels: ['JBA 1 low', 'PDL'] })
    expect(pdl.destinations[0]).toMatchObject({ label: 'Weekly Job Pivot (+1)', low: 7970 })
    expect(pdl.invalidation).toMatchObject({ low: 7955, side: 'below' })
    expect(pdl.invalidation.condition).toContain('the rubber meets the road')
    expect(pdl.invalidation.thenSeek).toMatchObject({ label: 'Weekly Job Pivot 1B', low: 7722, high: 7722, expect: 'hold' })
    expect(pdl.invalidation.thenSeek?.text).toBe('below 7955 (JBA 1 low (+1)) → seek Weekly Job Pivot 1B 7722')
  })

  it('"rebid 7980–82 into the LVN → press the 8004s; build above → attack prior week high"', () => {
    const rebid = playAt(p, 'Rip')!
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
