import { describe, expect, it } from 'vitest'
import { JobPlanSchema, type JobPlan, type Play } from '@/knowledge/schema/job-plan.schema'
import { buildPlan } from '@/lib/job-plan/buildPlan'
import { MAX_PLAYS, PLANNER_REVISION } from '@/lib/job-plan/rules'
import { classify } from './helpers/jobContext'
import { mirror, synthContext, type SynthSpec } from './helpers/jobPlanContext'

/**
 * The plan-level invariants (docs/job-planning-task-plan.md, Tests
 * "Invariants"), asserted over a corpus of contexts: hand-built specs with
 * every grounding, their mirrors, and the real job-study geometry through
 * classifyContext.
 */

const REFS: SynthSpec['refs'] = [
  { id: 'jba:0:low', source: 'jba-edge', price: 29200, label: 'JBA 1 low', boxIndex: 0 },
  { id: 'onl', source: 'overnight-extreme', price: 29260, label: 'ONL' },
  { id: 'g-line', source: 'g-line', price: 29300, label: 'G line' },
  { id: 'daily-pivot', source: 'daily-job-pivot', price: 29393.5, label: 'Daily Job Pivot' },
  { id: 'rip', source: 'rip', price: 29420, label: 'Rip' },
  { id: 'onh', source: 'overnight-extreme', price: 29460, label: 'ONH' },
  { id: 'weekly-pivot', source: 'weekly-job-pivot', price: 29500, label: 'Weekly Job Pivot' },
  { id: 'jba:0:high', source: 'jba-edge', price: 29600, label: 'JBA 1 high', boxIndex: 0 },
  { id: 'rung:weekly:1A', source: 'weekly-rung', price: 29700, label: 'Weekly 1A' },
  { id: 'mgi:weekly.pwHigh', source: 'mgi-other', price: 29750, label: 'PW High' },
]

const BASE: SynthSpec = {
  price: 29350,
  refs: REFS,
  boxes: [{ low: 29200, high: 29600 }],
  weekly: { valueLow: 29292.25, pivot: 29500, valueHigh: 29683.5 },
  daily: { valueLow: 29379.5, pivot: 29393.5, valueHigh: 29407.5 },
  reachPts: 500,
}

const failedLook = { direction: 'below' as const, startedAt: '2026-08-24T08:45:00', endedAt: '2026-08-24T09:05:00', minutes: 20, scope: 'session' as const, outcome: 'failed-look' as const, grade: 'EARLY' as const, extremePrice: 29285 }

const SPECS: Readonly<Record<string, SynthSpec>> = {
  watched: BASE,
  failedLook: { ...BASE, facts: { 'g-line': { latestFailedLook: failedLook } } },
  approach: { ...BASE, facts: { 'daily-pivot': { approachFailure: { from: 'below', closestApproachPts: 30, closestApproachAt: '2026-08-24T09:10:00', closestPrice: 29363.5, retreatPts: 25, minutesSinceClosest: 20, scope: 'session' } } } },
  accepted: { ...BASE, price: 29285, facts: { 'g-line': { acceptance: { state: 'accepted', direction: 'below', sinceAt: '2026-08-24T09:00:00', minutes: 28, scope: 'session' } } } },
  holding: { ...BASE, price: 29360, facts: { 'daily-pivot': { holdingSide: { side: 'BELOW', windowMinutes: 20, closes: 15, scope: 'session', from: '2026-08-24T09:10:00', to: '2026-08-24T09:28:00' } } } },
  edge: { ...BASE, price: 29215 },
  es: { ...BASE, instrument: 'ES', price: 6990, reachPts: 70, refs: REFS.map((r) => ({ ...r, price: 6990 + Math.round(r.price - 29350) / 4 })), boxes: [{ low: 6952.5, high: 7052.5 }], weekly: { valueLow: 6975, pivot: 7027.5, valueHigh: 7073 }, daily: { valueLow: 6997, pivot: 7001, valueHigh: 7004 } },
}

const corpus = (): Array<[string, JobPlan]> => [
  ...Object.entries(SPECS).map(([name, spec]): [string, JobPlan] => [name, buildPlan({ context: synthContext(spec) })]),
  ...Object.entries(SPECS).map(([name, spec]): [string, JobPlan] => [`${name}:mirror`, buildPlan({ context: synthContext(mirror(spec, spec.price)) })]),
  ['real', buildPlan({ context: classify() })],
  ['real:30250', buildPlan({ context: classify({ mgi: { symbol: 'NQU26', current: { time: '09:29:00', price: 30250 } } }) })],
]

const CORPUS = corpus()

function quotedPrices(play: Play): Array<[number, Play['band']['provenance']]> {
  const out: Array<[number, Play['band']['provenance']]> = [
    [play.band.low, play.band.provenance],
    [play.band.high, play.band.provenance],
    [play.invalidation.low, play.invalidation.provenance],
    [play.invalidation.high, play.invalidation.provenance],
  ]
  for (const s of [...play.destinations, ...(play.invalidation.thenSeek ? [play.invalidation.thenSeek] : [])]) {
    out.push([s.low, s.provenance], [s.high, s.provenance])
    if (s.beeline) out.push([s.beeline.destinationLow, s.provenance], [s.beeline.destinationHigh, s.provenance])
  }
  if (play.uncertaintyBand) out.push([play.uncertaintyBand.low, play.uncertaintyBand.provenance], [play.uncertaintyBand.high, play.uncertaintyBand.provenance])
  return out
}

describe('invariants over the corpus', () => {
  it('determinism: same input + revision ⇒ deep-equal output over repeated calls', () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      const a = buildPlan({ context: synthContext(spec) })
      const b = buildPlan({ context: synthContext(spec) })
      expect(b, name).toEqual(a)
      expect(JSON.stringify(b), name).toBe(JSON.stringify(a))
      expect(a.meta.plannerRevision).toBe(PLANNER_REVISION)
    }
    expect(buildPlan({ context: classify() })).toEqual(buildPlan({ context: classify() }))
  })

  it.each(CORPUS)('%s: at most 4 plays, ranks 1..n, at most one primary, every play validates', (_, p) => {
    expect(p.plays.length).toBeLessThanOrEqual(MAX_PLAYS)
    expect(p.plays.map((x) => x.rank)).toEqual(p.plays.map((_x, i) => i + 1))
    expect(p.plays.filter((x) => x.primary).length).toBeLessThanOrEqual(1)
    expect(() => JobPlanSchema.parse(JSON.parse(JSON.stringify(p)))).not.toThrow()
  })

  it.each(CORPUS)('%s: destinations are ordered in play direction and beyond the trigger band', (_, p) => {
    for (const play of p.plays) {
      const lows = play.destinations.map((s) => s.low)
      const sorted = [...lows].sort((a, b) => (play.direction === 'short' ? b - a : a - b))
      expect(lows, play.summary).toEqual(sorted)
      for (const s of play.destinations) {
        if (play.direction === 'long') expect(s.low).toBeGreaterThan(play.band.high)
        if (play.direction === 'short') expect(s.high).toBeLessThan(play.band.low)
      }
      expect(play.destinations.map((s) => s.order)).toEqual(play.destinations.map((_s, i) => i + 1))
      for (const s of play.destinations) expect((s.expect === 'gate-continuation') === (s.beeline !== null), s.text).toBe(true)
    }
  })

  it.each(CORPUS)('%s: invalidation sits on the far side of activation', (_, p) => {
    for (const play of p.plays) {
      switch (play.direction) {
        case 'long':
          expect(play.invalidation.side).toBe('below')
          expect(play.invalidation.high).toBeLessThanOrEqual(play.band.high)
          if (play.invalidation.thenSeek) expect(play.invalidation.thenSeek.high).toBeLessThan(play.band.low)
          break
        case 'short':
          expect(play.invalidation.side).toBe('above')
          expect(play.invalidation.low).toBeGreaterThanOrEqual(play.band.low)
          if (play.invalidation.thenSeek) expect(play.invalidation.thenSeek.low).toBeGreaterThan(play.band.high)
          break
        case 'two-way':
          expect(play.invalidation).toMatchObject({ side: 'either', low: play.band.low, high: play.band.high })
      }
    }
  })

  it.each(CORPUS)('%s: mid-box context never arms an unconditional edge play', (_, p) => {
    const zone = p.context.location.enclosingZone
    if (!zone?.midZone) return
    for (const play of p.plays) {
      const isEdge = play.band.bandId !== null && (play.band.bandId === zone.lowerEdge.bandId || play.band.bandId === zone.upperEdge.bandId)
      if (!isEdge) continue
      if (play.activation.grounding === 'none') expect(play.activation.state, play.summary).toBe('conditional')
      expect(play.activation.grounding, play.summary).not.toBe('holding-side')
    }
    expect(p.plays.some((x) => x.stance === 'stand-down')).toBe(true)
  })

  it.each(CORPUS)('%s: confirmed initiative and a fade at the same band never coexist; one play per band', (_, p) => {
    const bands = p.plays.map((x) => x.band.bandId).filter((id): id is string => id !== null)
    expect(new Set(bands).size).toBe(bands.length)
    for (const play of p.plays.filter((x) => x.condition === 'build-beyond-continuation')) {
      expect(p.plays.filter((x) => x.band.bandId === play.band.bandId && x.stance !== 'continuation')).toEqual([])
    }
  })

  it.each(CORPUS)('%s: no quoted price outside the supplied geometry unless derived and labeled', (_, p) => {
    const known = new Set(p.geometryRefs.references.map((r) => r.price))
    const ids = new Set(p.geometryRefs.references.map((r) => r.id))
    for (const play of p.plays) {
      for (const [price, provenance] of quotedPrices(play)) {
        if (provenance.kind === 'derived') {
          expect(provenance.derivation, play.summary).toBeTruthy()
        } else {
          expect(known.has(price), `${play.summary}: ${price}`).toBe(true)
          expect(provenance.derivation).toBeNull()
        }
        for (const id of provenance.referenceIds) expect(ids.has(id), id).toBe(true)
      }
    }
  })

  it.each(CORPUS)('%s: the response deadline is text on hold/traverse plays only, never evaluated', (_, p) => {
    for (const play of p.plays) {
      expect(play.responseDeadline !== null, play.summary).toBe(play.condition === 'hold-traverse')
      if (play.responseDeadline) expect(play.responseDeadline).toMatchObject({ minutes: 30, evaluatedByPlanner: false })
      expect(play).not.toHaveProperty('confidence')
      expect(play).not.toHaveProperty('appliesWhenOpen')
    }
  })

  it.each(CORPUS)('%s: the lean always names the rank-1 play — frame-based for directional, mid-zone for the stand-down', (_, p) => {
    const first = p.plays[0]
    if (!first) {
      expect(p.lean).toMatchObject({ playId: null, basis: 'none' })
    } else {
      expect(p.lean).toMatchObject({ playId: first.id, basis: first.stance === 'stand-down' ? 'mid-zone' : 'frame' })
      expect(first.primary).toBe(true)
      expect(p.plays.filter((x) => x.primary)).toHaveLength(1)
    }
  })

  it('the schema rejects a fabricated price, an unknown provenance id, and an unlabeled derivation', () => {
    const p = buildPlan({ context: synthContext(SPECS.failedLook) })
    const raw = JSON.parse(JSON.stringify(p)) as JobPlan
    const edit = (fn: (play: Play) => Play) => ({ ...raw, plays: raw.plays.map((play, i) => (i === 0 ? fn(play) : play)) })
    expect(JobPlanSchema.safeParse(raw).success).toBe(true)
    expect(JobPlanSchema.safeParse(edit((x) => ({ ...x, band: { ...x.band, low: x.band.low - 7, high: x.band.high - 7 } }))).success).toBe(false)
    expect(JobPlanSchema.safeParse(edit((x) => ({ ...x, invalidation: { ...x.invalidation, provenance: { ...x.invalidation.provenance, referenceIds: ['made-up'] } } }))).success).toBe(false)
    expect(JobPlanSchema.safeParse(edit((x) => ({ ...x, destinations: x.destinations.map((s, i) => (i === 0 ? { ...s, low: s.low + 1 } : s)) }))).success).toBe(false)
    expect(JobPlanSchema.safeParse(edit((x) => ({ ...x, band: { ...x.band, provenance: { kind: 'derived', referenceIds: x.band.provenance.referenceIds, derivation: null } } }))).success).toBe(false)
    expect(JobPlanSchema.safeParse(edit((x) => ({ ...x, band: { ...x.band, low: x.band.low - 7, provenance: { kind: 'derived', referenceIds: x.band.provenance.referenceIds, derivation: 'edge − 7 (test)' } } }))).success).toBe(true)
  })

  it('missing core geometry / insufficient quality can never yield ready', () => {
    for (const spec of Object.values(SPECS)) {
      expect(buildPlan({ context: synthContext({ ...spec, refs: spec.refs.filter((r) => r.source !== 'weekly-job-pivot') }) }).status).toBe('insufficient')
      expect(buildPlan({ context: synthContext({ ...spec, dataQuality: { sufficient: false, issues: [{ code: 'trading_day_mismatch', severity: 'insufficient', message: 'x' }] } }) }).status).toBe('insufficient')
    }
    const stale = classify({ asOf: '2026-08-25T09:30:00' })
    expect(stale.dataQuality.sufficient).toBe(false)
    expect(buildPlan({ context: stale }).status).toBe('insufficient')
  })
})

describe('long/short symmetry where intended', () => {
  it.each(Object.entries(SPECS).filter(([name]) => name !== 'es'))('%s mirrors', (_, spec) => {
    const a = buildPlan({ context: synthContext(spec) })
    const b = buildPlan({ context: synthContext(mirror(spec, spec.price)) })
    const m = (x: number) => 2 * spec.price - x
    const flip = { long: 'short', short: 'long', 'two-way': 'two-way' } as const
    const flipSide = { above: 'below', below: 'above', either: 'either' } as const
    expect(b.plays.length).toBe(a.plays.length)
    a.plays.forEach((play, i) => {
      const twin = b.plays[i]
      expect(twin.condition).toBe(play.condition)
      expect(twin.direction).toBe(flip[play.direction])
      expect(twin.activation.grounding).toBe(play.activation.grounding)
      expect(twin.activation.state).toBe(play.activation.state)
      expect([twin.band.low, twin.band.high]).toEqual([m(play.band.high), m(play.band.low)])
      expect(twin.invalidation.side).toBe(flipSide[play.invalidation.side])
      const mirrored = play.destinations.map((s) => [m(s.high), m(s.low)])
      expect(twin.destinations.map((s) => [s.low, s.high])).toEqual(play.direction === 'two-way' ? mirrored.reverse() : mirrored)
    })
  })
})
