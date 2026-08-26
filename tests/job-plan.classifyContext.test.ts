import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyContext } from '@/lib/job-plan/classifyContext'
import { buildConfluenceBands } from '@/lib/job-plan/confluenceBands'
import type { ConfluenceBand, Reference } from '@/lib/job-plan/contextTypes'
import { enclosingZone, readBox, readValueZone } from '@/lib/job-plan/locationDimensions'
import { htfBarsAsOf } from '@/lib/job-plan/observedBars'
import { assignBandRoles } from '@/lib/job-plan/referenceRoles'
import { PLANNER_REVISION, r2Significance, type ReferenceSource } from '@/lib/job-plan/rules'
import {
  AS_OF,
  classify,
  defaultInput,
  execBars,
  flatBars,
  htfSessions,
  HTF_DATES,
  mgiAt,
  node,
  profileNodes,
  studyAt,
} from './helpers/jobContext'

const ref = (id: string, source: ReferenceSource, price: number, extra: Partial<Reference> = {}): Reference => ({
  id,
  source,
  significance: r2Significance(source),
  subRank: 0,
  label: id,
  price,
  priceLow: price,
  priceHigh: price,
  destinationOnly: source === 'weekly-rung' || source === 'daily-rung',
  origin: 'mgi',
  boxIndex: null,
  node: null,
  pivot: null,
  mgiCode: null,
  ...extra,
})

const NQ = { merge: 20, cap: 40 }
const ES = { merge: 5, cap: 10 }

const byId = (ctx: ReturnType<typeof classify>, id: string) => ctx.references.find((r) => r.id === id)
const bandOf = (ctx: ReturnType<typeof classify>, memberId: string) => ctx.bands.find((b) => b.members.some((m) => m.id === memberId))!
const roleOf = (ctx: ReturnType<typeof classify>, memberId: string) => ctx.roles.find((r) => r.bandId === bandOf(ctx, memberId).id)!

describe('classifyContext: the happy path on the real geometry', () => {
  const ctx = classify()

  it('is pure and deterministic — identical output for identical input', () => {
    expect(JSON.stringify(classify())).toBe(JSON.stringify(ctx))
    const sources = readdirSync(join(process.cwd(), 'lib/job-plan')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of sources) {
      const text = readFileSync(join(process.cwd(), 'lib/job-plan', file), 'utf8')
      expect(text, file).not.toMatch(/Date\.now\(|new Date\(\)/)
      expect(text, file).not.toMatch(/console\.log/)
    }
  })

  it('stamps the revision, asOf, the instrument from the MGI symbol root and the NQ tolerances', () => {
    expect(ctx.plannerRevision).toBe(PLANNER_REVISION)
    expect(ctx.asOf).toBe(AS_OF)
    expect(ctx.instrument).toBe('NQ')
    expect(ctx.symbol).toBe('NQU26')
    expect(ctx.tolerance).toEqual({ merge: 20, cap: 40 })
    expect(ctx.price).toEqual({ value: 29350, source: 'mgi' })
  })

  it('takes the R4 reach from computeVolatilityScale over the HTF bars', () => {
    expect(ctx.scale.source).toBe('session-sigma')
    expect(ctx.scale.sessionsAnalyzed).toBe(5)
    expect(ctx.scale.sessionSigmaPts).toBeGreaterThan(100)
    expect(ctx.scale.reachPts).toBe(ctx.scale.sessionSigmaPts)
  })

  it('is sufficient with only informational warnings', () => {
    expect(ctx.dataQuality.sufficient).toBe(true)
    expect(ctx.dataQuality.issues.map((i) => i.code)).toEqual(['profile_nodes_unavailable'])
    expect(ctx.dataQuality.maxSkewSeconds).toBe(60)
    expect(ctx.dataQuality.tradingDay).toEqual({ study: '2026-08-24', bundle: '2026-08-24', match: true })
    expect(ctx.dataQuality.boxesProvisional).toBe(false)
    expect(ctx.warnings).toHaveLength(1)
  })

  it('computes origin facts for every band, stamped asOf', () => {
    expect(ctx.origin.bands.map((b) => b.bandId)).toEqual(ctx.bands.map((b) => b.id))
    expect(ctx.origin.bands.every((b) => b.asOf === AS_OF)).toBe(true)
    expect(ctx.origin.coverage).toMatchObject({ tradingDay: '2026-08-24', sessionStarted: true, minutesSinceOpen: 60, earlyWindow: true, overnightBars: 30, sessionBars: 59 })
  })
})

describe('reference inventory (R2)', () => {
  const ctx = classify()

  it('lists every source tier with its significance, the G line first and the daily rungs last', () => {
    expect(byId(ctx, 'g-line')).toMatchObject({ source: 'g-line', significance: 0, price: 29300, origin: 'mgi', mgiCode: 'weekly.wkOpen' })
    expect(byId(ctx, 'weekly-pivot')).toMatchObject({ source: 'weekly-job-pivot', price: 29488, origin: 'job-study' })
    expect(byId(ctx, 'daily-pivot')).toMatchObject({ source: 'daily-job-pivot', price: 29393.5, subRank: 0, pivot: { role: 'current', sessionDate: '2026-08-24', testedStatus: null } })
    expect(byId(ctx, 'jba:0:low')).toMatchObject({ source: 'jba-edge', price: 29240, boxIndex: 0 })
    expect(byId(ctx, 'jba:1:high')).toMatchObject({ source: 'jba-edge', price: 30334, boxIndex: 1 })
    expect(byId(ctx, 'rip')).toMatchObject({ source: 'rip', price: 29420 })
    expect(byId(ctx, 'onh')).toMatchObject({ source: 'overnight-extreme', price: 29460, origin: 'mgi' })
    expect(byId(ctx, 'pdl')).toMatchObject({ source: 'previous-day-extreme', price: 29230 })
    expect(byId(ctx, 'autoplot:high')).toMatchObject({ source: 'autoplot', price: 30287.5 })
    expect(byId(ctx, 'mgi:weekly.pwHigh')).toMatchObject({ source: 'mgi-other', price: 29800, label: 'PW High' })
    expect(byId(ctx, 'mgi:weekly.pwVAH')).toMatchObject({ source: 'mgi-other', price: 29650 })
    expect(byId(ctx, 'mgi:daily.pdc')).toMatchObject({ source: 'mgi-other' })
    expect(byId(ctx, 'rung:weekly:1B')).toMatchObject({ source: 'weekly-rung', price: 28901, destinationOnly: true })
    expect(byId(ctx, 'rung:daily:6A')).toMatchObject({ source: 'daily-rung', price: 29575.5, destinationOnly: true })
    expect(ctx.references.filter((r) => r.source === 'weekly-rung')).toHaveLength(6)
    expect(ctx.references.filter((r) => r.source === 'daily-rung')).toHaveLength(12)
    expect(ctx.references.map((r) => r.significance)).toEqual([...ctx.references.map((r) => r.significance)].sort((a, b) => a - b))
  })

  it('never re-lists a named-tier MGI level under mgi-other, and drops 0.00 placeholders', () => {
    const ids = ctx.references.map((r) => r.id)
    for (const code of ['daily.rip', 'daily.onh', 'daily.pdh', 'daily.jobPivot', 'weekly.wkOpen', 'weekly.jobPivot']) {
      expect(ids).not.toContain(`mgi:${code}`)
    }
    expect(ids).not.toContain('mgi:daily.ibh')
    expect(ids).not.toContain('mgi:daily.orHigh')
  })

  it('excludes a sentinel Rip and a missing G line, with the reason', () => {
    const noRip = classify({ mgi: mgiAt('09:29:00', 29350, { daily: { rip: 0 }, weekly: { wkOpen: undefined } }) })
    expect(byId(noRip, 'rip')).toBeUndefined()
    expect(byId(noRip, 'g-line')).toBeUndefined()
    expect(noRip.excludedReferences).toContainEqual({ label: 'Rip', price: 0, reason: 'sentinel' })
    expect(noRip.excludedReferences).toContainEqual({ label: 'G line (week open)', price: null, reason: 'missing' })
  })

  it('never lets HTF bars after asOf into the snapshot: the overnight fallback and the scale see only what asOf could', () => {
    const rolling = htfSessions([...HTF_DATES, '2026-08-24', '2026-08-25'], 29400, 100)
    const noOn = mgiAt('09:29:00', 29350, { daily: { onh: 0, onl: 0 } })
    const ctx = classify({ mgi: noOn, htfBars: rolling })
    // 08-24's own overnight bar (03:00) is the fallback source, never 08-25's.
    expect(byId(ctx, 'onh')).toMatchObject({ price: 29450, origin: 'htf-bars' })
    expect(ctx.scale.sessionsAnalyzed).toBe(5)
    expect(htfBarsAsOf(rolling, Date.UTC(2026, 7, 24, 9, 30)).every((b) => b.dateTime.getDate() <= 24)).toBe(true)
    expect(htfBarsAsOf(rolling, Date.UTC(2026, 7, 24, 9, 30), '2026-08-24').map((b) => b.dateTime.getHours())).toEqual([3, 8, 9, 9])

    // With an asOf before this day's overnight there is no fallback source at all.
    const early = classify({ mgi: noOn, htfBars: rolling, asOf: '2026-08-24T02:00:00', execBars: [] })
    expect(byId(early, 'onh')).toBeUndefined()
    expect(early.dataQuality.issues.map((i) => i.code)).toContain('overnight_levels_missing')
  })

  it('falls back to the HTF bars for ONH/ONL when the MGI carries 0.00, and says so', () => {
    const fromHtf = classify({ mgi: mgiAt('09:29:00', 29350, { daily: { onh: 0, onl: 0 } }) })
    expect(byId(fromHtf, 'onh')).toMatchObject({ price: 29450, origin: 'htf-bars', label: 'ONH (HTF bars)' })
    expect(byId(fromHtf, 'onl')).toMatchObject({ price: 29350, origin: 'htf-bars' })
    expect(fromHtf.dataQuality.issues.map((i) => i.code)).toContain('overnight_levels_from_htf')

    const none = classify({ mgi: mgiAt('09:29:00', 29350, { daily: { onh: 0, onl: 0 } }), htfBars: [] })
    expect(byId(none, 'onh')).toBeUndefined()
    expect(none.dataQuality.issues.map((i) => i.code)).toContain('overnight_levels_missing')
    expect(none.dataQuality.sufficient).toBe(true)
  })

  describe('historical daily pivots (deep-dive rule: untested stays relevant)', () => {
    it('keeps history as unknown when the bars do not reach back to its session', () => {
      const h = byId(ctx, 'daily-pivot:2026-08-21')
      expect(h).toMatchObject({ source: 'daily-job-pivot', subRank: 1, price: 29488.25, pivot: { role: 'historical', testedStatus: 'unknown' } })
      expect(h?.label).toContain('(unknown)')
      expect(ctx.references.filter((r) => r.pivot?.role === 'historical')).toHaveLength(4)
    })

    it('drops a pivot the bars traded through since its session and keeps one they never reached', () => {
      const covered = [...flatBars('2026-08-21T08:30:00', 10, 30, 29300), ['2026-08-21T14:00:00', 29500, 29480, 29490] as const]
      const input = defaultInput()
      const bars = execBars([...covered, ...flatBars('2026-08-23T17:00:00', 30, 30, 29350), ...flatBars('2026-08-24T08:30:00', 59, 1, 29350)], ['2026-08-24T09:29:00', 29351, 29349, 29350])
      const withHistory = classifyContext({ ...input, execBars: bars })
      expect(byId(withHistory, 'daily-pivot:2026-08-21')).toBeUndefined()
      expect(withHistory.excludedReferences).toContainEqual({ label: 'Daily Job Pivot 2026-08-21', price: 29488.25, reason: 'historical_pivot_tested' })
      // 08-20's pivot (29372.5): bars since 08-20 never traded through it, but coverage starts on 08-21 → unknown.
      expect(byId(withHistory, 'daily-pivot:2026-08-20')?.pivot?.testedStatus).toBe('unknown')
    })

    it('reads untested when coverage starts at that session open and price never touched it', () => {
      const bars = execBars([...flatBars('2026-08-21T08:30:00', 10, 30, 29300), ...flatBars('2026-08-24T08:30:00', 59, 1, 29350)], ['2026-08-24T09:29:00', 29351, 29349, 29350])
      const ctx2 = classifyContext({ ...defaultInput(), execBars: bars })
      expect(byId(ctx2, 'daily-pivot:2026-08-21')?.pivot?.testedStatus).toBe('untested')
    })
  })

  describe('profile nodes (taken AS-IS from the vision read)', () => {
    it('lists 5-day nodes at tier 8 and 4-hour nodes at tier 9 with prominence/primary untouched', () => {
      const nodes = profileNodes(
        [node({ priceLow: 29280, priceHigh: 29284, prominence: 1, primary: true }), node({ kind: 'hvn-edge', priceLow: 29600, priceHigh: 29604, prominence: 2, shape: 'shelf-edge' })],
        [node({ priceLow: 29520, priceHigh: 29530, prominence: 4, agreement: 2 })],
      )
      const withNodes = classify({ profileNodes: nodes })
      expect(byId(withNodes, 'node:5d:0')).toMatchObject({
        source: 'profile-5d',
        price: 29282,
        priceLow: 29280,
        priceHigh: 29284,
        origin: 'profile-nodes',
        node: { profile: '5d', kind: 'lvn', prominence: 1, primary: true, agreement: 3, samples: 3 },
      })
      expect(byId(withNodes, 'node:5d:0')?.label).toBe('5-day lvn (primary) #1')
      expect(byId(withNodes, 'node:5d:1')).toMatchObject({ source: 'profile-5d', node: { kind: 'hvn-edge', shape: 'shelf-edge' } })
      expect(byId(withNodes, 'node:4h:0')).toMatchObject({ source: 'profile-4h', price: 29525, node: { prominence: 4, agreement: 2 } })
      expect(r2Significance('profile-5d')).toBe(7)
      expect(r2Significance('profile-4h')).toBe(8)
      expect(withNodes.dataQuality.profileNodes).toBe('present')
      expect(withNodes.dataQuality.issues.map((i) => i.code)).not.toContain('profile_nodes_unavailable')
    })

    it('ProfileNodes = null: tiers 8/9 empty, one warning, still sufficient', () => {
      const ctxNull = classify({ profileNodes: null })
      expect(ctxNull.references.some((r) => r.source === 'profile-5d' || r.source === 'profile-4h')).toBe(false)
      expect(ctxNull.dataQuality.profileNodes).toBe('null')
      expect(ctxNull.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'profile_nodes_unavailable', severity: 'warning' }))
      expect(ctxNull.dataQuality.sufficient).toBe(true)
    })

    it('a profile without consensus is partial and named in the warning', () => {
      const partial = classify({ profileNodes: profileNodes([node({ priceLow: 29280, priceHigh: 29284, primary: true })], null) })
      expect(partial.dataQuality.profileNodes).toBe('partial')
      expect(partial.references.some((r) => r.source === 'profile-5d')).toBe(true)
      expect(partial.references.some((r) => r.source === 'profile-4h')).toBe(false)
      expect(partial.dataQuality.issues.find((i) => i.code === 'profile_nodes_unavailable')?.message).toContain('4h')
    })
  })
})

describe('confluence bands (R1 / R1b)', () => {
  it('chains transitively within the merge tolerance and quotes [lowest member, highest member]', () => {
    const bands = buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'previous-day-extreme', 118), ref('c', 'autoplot', 136)], NQ)
    expect(bands).toHaveLength(1)
    expect(bands[0]).toMatchObject({ id: 'band-01', low: 100, high: 136, memberCount: 3, confluence: true, anchorId: 'a', anchorSource: 'rip' })
  })

  it('boundary: exactly the tolerance chains, a tick more does not', () => {
    expect(buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'rip', 120)], NQ)).toHaveLength(1)
    expect(buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'rip', 120.25)], NQ)).toHaveLength(2)
  })

  it('splits a chain wider than the cap at its largest internal gap (first on a tie), recursively', () => {
    const bands = buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'rip', 118), ref('c', 'rip', 136), ref('d', 'rip', 154)], NQ)
    expect(bands.map((b) => [b.low, b.high])).toEqual([[100, 100], [118, 154]])
    const uneven = buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'rip', 110), ref('c', 'rip', 129), ref('d', 'rip', 140), ref('e', 'rip', 160), ref('f', 'rip', 180)], NQ)
    expect(uneven.map((b) => [b.low, b.high])).toEqual([[100, 140], [160, 180]])
    const twice = buildConfluenceBands([ref('a', 'rip', 100), ref('b', 'rip', 118), ref('c', 'rip', 136), ref('d', 'rip', 154), ref('e', 'rip', 172)], NQ)
    expect(twice.map((b) => [b.low, b.high])).toEqual([[100, 100], [118, 118], [136, 172]])
    expect(twice.every((b) => b.high - b.low <= 40)).toBe(true)
  })

  it('anchors on the highest-significance member, not the lowest price', () => {
    const [band] = buildConfluenceBands([ref('rung', 'daily-rung', 100), ref('g', 'g-line', 112), ref('pdh', 'previous-day-extreme', 105)], NQ)
    expect(band).toMatchObject({ anchorId: 'g', anchorPrice: 112, significance: 0, low: 100, high: 112, destinationOnly: false })
    expect(band.members.map((m) => m.id)).toEqual(['g', 'pdh', 'rung'])
  })

  it('breaks same-tier ties by within-tier order, then profile prominence, then closeness to the midpoint, then id', () => {
    const n = (id: string, price: number, prominence: number) =>
      ref(id, 'profile-5d', price, { node: { profile: '5d', kind: 'lvn', prominence, primary: false, position: 'mid', shape: 'valley', agreement: 3, samples: 3 } })
    expect(buildConfluenceBands([n('x', 100, 3), n('y', 110, 1)], NQ)[0]).toMatchObject({ anchorId: 'y', prominence: 1 })
    const hist = ref('h', 'daily-job-pivot', 100, { subRank: 1 })
    const cur = ref('c', 'daily-job-pivot', 110, { subRank: 0 })
    expect(buildConfluenceBands([hist, cur], NQ)[0].anchorId).toBe('c')
    expect(buildConfluenceBands([ref('p', 'rip', 100), ref('q', 'rip', 104), ref('r', 'rip', 110)], NQ)[0].anchorId).toBe('q')
    expect(buildConfluenceBands([ref('b', 'rip', 100), ref('a', 'rip', 100)], NQ)[0].anchorId).toBe('a')
  })

  it('a band of nothing but rungs is destination-only', () => {
    const [band] = buildConfluenceBands([ref('r1', 'weekly-rung', 100), ref('r2', 'daily-rung', 105)], NQ)
    expect(band.destinationOnly).toBe(true)
  })

  it('resolves ES tolerances (5 / 10) from the instrument', () => {
    expect(buildConfluenceBands([ref('a', 'rip', 6500), ref('b', 'rip', 6505), ref('c', 'rip', 6510), ref('d', 'rip', 6515)], ES).map((b) => [b.low, b.high])).toEqual([[6500, 6500], [6505, 6515]])
    expect(buildConfluenceBands([ref('a', 'rip', 6500), ref('b', 'rip', 6505.25)], ES)).toHaveLength(2)
  })

  it('on the real geometry: the G line band is [3B 29295.5 … 2B 29323.5] anchored on the G line, and ONL 29280 is cut off by the cap split', () => {
    const ctx = classify()
    const band = bandOf(ctx, 'g-line')
    expect(band).toMatchObject({ anchorId: 'g-line', low: 29295.5, high: 29323.5, confluence: true, destinationOnly: false })
    expect(band.members.map((m) => m.id)).toEqual(['g-line', 'mgi:weekly.pwVAL', 'rung:daily:2B', 'rung:daily:3B'])
    expect(bandOf(ctx, 'onl')).toMatchObject({ anchorId: 'onl', low: 29267.5, high: 29280, memberCount: 2 })
    expect(band.high - band.low).toBeLessThanOrEqual(40)
    expect(ctx.bands.map((b) => b.low)).toEqual([...ctx.bands.map((b) => b.low)].sort((a, b) => a - b))
  })
})

describe('band roles (R3 / R4, nearest-first gated by structural quality)', () => {
  const band = (id: string, low: number, high: number, extra: Partial<ConfluenceBand> = {}): ConfluenceBand => ({
    id,
    low,
    high,
    anchorId: `${id}:a`,
    anchorPrice: low,
    anchorSource: 'rip',
    significance: r2Significance('rip'),
    members: [ref(`${id}:a`, 'rip', low)],
    memberCount: 1,
    confluence: false,
    destinationOnly: false,
    prominence: null,
    ...extra,
  })
  const roles = (bands: ConfluenceBand[], price = 29350, reachPts = 120, sigma: number | null = 120) =>
    assignBandRoles({ bands, price, merge: 20, reachPts, sessionSigmaPts: sigma })

  it('the nearest strong band on each side is actionable-now; further ones within reach are if-reached; beyond reach is destination', () => {
    const r = roles([band('b1', 29400, 29420), band('b2', 29450, 29455), band('b3', 29300, 29305), band('b4', 29200, 29200), band('b5', 29900, 29900)])
    const byBand = Object.fromEntries(r.map((x) => [x.bandId, x]))
    expect(byBand.b1).toMatchObject({ role: 'actionable-now', side: 'above', distancePts: 50, distanceSigma: 0.42, nearestRank: 1, withinReach: true })
    expect(byBand.b2).toMatchObject({ role: 'actionable-if-reached', side: 'above', nearestRank: 2 })
    expect(byBand.b3).toMatchObject({ role: 'actionable-now', side: 'below', nearestRank: 1 })
    expect(byBand.b4).toMatchObject({ role: 'destination', withinReach: false, distancePts: 150 })
    expect(byBand.b5).toMatchObject({ role: 'destination', withinReach: false })
  })

  it('boundary: exactly one sigma away is within reach; a tick more is a destination', () => {
    expect(roles([band('b', 29470, 29480)])[0]).toMatchObject({ role: 'actionable-now', distancePts: 120, withinReach: true })
    expect(roles([band('b', 29470.25, 29480)])[0]).toMatchObject({ role: 'destination', withinReach: false })
  })

  it('a band price is AT (R3) is actionable-now even when a nearer band exists', () => {
    const r = roles([band('inside', 29340, 29360), band('near', 29365, 29370), band('far', 29380, 29385)])
    expect(r.find((x) => x.bandId === 'inside')).toMatchObject({ role: 'actionable-now', side: 'inside', at: true, distancePts: 0, nearestRank: null })
    expect(r.find((x) => x.bandId === 'near')).toMatchObject({ role: 'actionable-now', at: true })
    expect(r.find((x) => x.bandId === 'far')).toMatchObject({ role: 'actionable-if-reached', at: false })
  })

  it('skips a poorly formed nearest band (lone low-prominence node / lone lowest-tier MGI) for the next strong one', () => {
    const weakNode = band('weak', 29380, 29385, {
      anchorSource: 'profile-4h',
      significance: r2Significance('profile-4h'),
      members: [ref('weak:a', 'profile-4h', 29382, { node: { profile: '4h', kind: 'lvn', prominence: 4, primary: false, position: 'mid', shape: 'valley', agreement: 2, samples: 3 } })],
      prominence: 4,
    })
    const weakMgi = band('other', 29390, 29390, { anchorSource: 'mgi-other', significance: r2Significance('mgi-other'), members: [ref('other:a', 'mgi-other', 29390)] })
    const r = roles([weakNode, weakMgi, band('strong', 29420, 29425)])
    expect(r.find((x) => x.bandId === 'weak')).toMatchObject({ role: 'actionable-if-reached', structuralQuality: 'weak', nearestRank: 1 })
    expect(r.find((x) => x.bandId === 'other')).toMatchObject({ role: 'actionable-if-reached', structuralQuality: 'weak', nearestRank: 2 })
    expect(r.find((x) => x.bandId === 'strong')).toMatchObject({ role: 'actionable-now', structuralQuality: 'strong', nearestRank: 3 })
    const strongNode = { ...weakNode, memberCount: 2, confluence: true }
    expect(roles([strongNode, band('strong', 29420, 29425)]).find((x) => x.bandId === 'weak')).toMatchObject({ role: 'actionable-now', structuralQuality: 'strong' })
  })

  it('rungs are destination-only however close, and a fallback scale reports no sigma', () => {
    const r = roles([band('rung', 29355, 29355, { destinationOnly: true, anchorSource: 'daily-rung' })], 29350, 283, null)
    expect(r[0]).toMatchObject({ role: 'destination', destinationOnly: true, at: true, distanceSigma: null })
  })

  it('on the real geometry every band gets exactly one role and rungs never arm', () => {
    const ctx = classify()
    expect(ctx.roles.map((r) => r.bandId)).toEqual(ctx.bands.map((b) => b.id))
    for (const role of ctx.roles) {
      const b = ctx.bands.find((x) => x.id === role.bandId)!
      if (b.destinationOnly) expect(role.role).toBe('destination')
      if (!role.withinReach) expect(role.role).toBe('destination')
    }
    expect(roleOf(ctx, 'daily-pivot').role).toBe('actionable-now')
  })
})

describe('location dimensions', () => {
  const weekly = { valueLow: 29292.25, pivot: 29488, valueHigh: 29683.5 }

  it.each([
    ['below the value low', 29292, 'below'],
    ['boundary: on the value low is inside (lower-half)', 29292.25, 'lower-half'],
    ['lower half', 29400, 'lower-half'],
    ['boundary: one tolerance under the pivot is at-pivot', 29468, 'at-pivot'],
    ['a tick further is lower-half', 29467.75, 'lower-half'],
    ['on the pivot', 29488, 'at-pivot'],
    ['boundary: one tolerance over the pivot is at-pivot', 29508, 'at-pivot'],
    ['upper half', 29600, 'upper-half'],
    ['boundary: on the value high is inside (upper-half)', 29683.5, 'upper-half'],
    ['above the value high', 29683.75, 'above'],
  ])('vs weekly value: %s', (_, price, expected) => {
    expect(readValueZone(price, weekly, 20).read).toBe(expected)
  })

  it('carries the evidence, including the signed distance from the pivot', () => {
    expect(readValueZone(29400, weekly, 20).evidence).toEqual({ price: 29400, valueLow: 29292.25, pivot: 29488, valueHigh: 29683.5, fromPivotPts: -88, mergeTolerancePts: 20 })
  })

  const box = { low: 29240, high: 29696.25, drawingId: -297193, source: 'user', anchorBegin: { wall: '', epochMs: 0, iso: '' }, anchorEnd: { wall: '', epochMs: 0, iso: '' }, color: '', text: '' }

  it.each([
    ['inside, far from both edges', 29400, 'inside-middle', 'inside'],
    ['boundary: one tolerance inside the low edge is at-lower-edge', 29260, 'at-lower-edge', 'inside'],
    ['a tick further inside is inside-middle', 29260.25, 'inside-middle', 'inside'],
    ['boundary: one tolerance outside the low edge is still at-lower-edge', 29220, 'at-lower-edge', 'below'],
    ['a tick further outside is outside-near', 29219.75, 'outside-near', 'below'],
    ['boundary: 2× tolerance outside is outside-near', 29200, 'outside-near', 'below'],
    ['a tick further is outside-extended', 29199.75, 'outside-extended', 'below'],
    ['at the upper edge from inside', 29680, 'at-upper-edge', 'inside'],
    ['at the upper edge from outside', 29716.25, 'at-upper-edge', 'above'],
    ['outside-extended above', 29800, 'outside-extended', 'above'],
  ])('vs a JBA box: %s', (_, price, read, side) => {
    expect(readBox(price, box, 0, 20)).toMatchObject({ read, side, boxIndex: 0, drawingId: -297193 })
  })

  it('a box narrower than two tolerances resolves the nearer edge, lower on a tie', () => {
    const tiny = { ...box, low: 29300, high: 29320 }
    expect(readBox(29310, tiny, 0, 20).read).toBe('at-lower-edge')
    expect(readBox(29311, tiny, 0, 20).read).toBe('at-upper-edge')
  })

  it('reads EVERY box (multiple boxes) and the enclosing one', () => {
    const inFirst = classify()
    expect(inFirst.location.vsBoxes.map((b) => [b.boxIndex, b.read])).toEqual([[0, 'inside-middle'], [1, 'outside-extended']])
    expect(inFirst.location.enclosingZone).toMatchObject({ kind: 'jba-box', lowerEdge: { label: 'JBA 1 low', price: 29240 }, upperEdge: { label: 'JBA 1 high', price: 29696.25 }, fromLowerPts: 110, fromUpperPts: 346.25, midZone: true, midZoneLimitPts: 40 })
    expect(inFirst.location.enclosingZone?.lowerEdge.bandId).toBe(bandOf(inFirst, 'jba:0:low').id)

    const inSecond = classify({ mgi: mgiAt('09:29:00', 30250) })
    expect(inSecond.location.vsBoxes.map((b) => b.read)).toEqual(['outside-extended', 'inside-middle'])
    expect(inSecond.location.enclosingZone?.lowerEdge.label).toBe('JBA 2 low')
  })

  it('R10: within 2× tolerance of an edge is an edge play, not purgatory', () => {
    const edge = classify({ mgi: mgiAt('09:29:00', 29280) })
    expect(edge.location.enclosingZone).toMatchObject({ midZone: false, fromLowerPts: 40 })
    expect(classify({ mgi: mgiAt('09:29:00', 29280.25) }).location.enclosingZone?.midZone).toBe(true)
  })

  it('between the boxes the enclosing zone is the nearest armable band on each side; above everything it is null', () => {
    const between = classify({ mgi: mgiAt('09:29:00', 29950) })
    expect(between.location.enclosingZone?.kind).toBe('between-bands')
    expect(between.location.enclosingZone?.lowerEdge.price).toBeLessThan(29950)
    expect(between.location.enclosingZone?.upperEdge.price).toBeGreaterThan(29950)
    expect(between.bands.find((b) => b.id === between.location.enclosingZone?.lowerEdge.bandId)?.destinationOnly).toBe(false)

    const above = classify({ mgi: mgiAt('09:29:00', 30400, { monthly: { pmHigh: 0 } }) })
    expect(above.location.enclosingZone).toBeNull()
    expect(above.location.crossRead.jba).toBe('above-all')
  })

  it('uses the narrowest containing box when boxes nest', () => {
    const nested = studyAt(AS_OF)
    const study = { ...nested, balanceAreas: [nested.balanceAreas[0], { ...nested.balanceAreas[0], low: 29330, high: 29380, drawingId: -1 }] }
    const zone = enclosingZone(29350, study.balanceAreas, [], 20)
    expect(zone).toMatchObject({ lowerEdge: { label: 'JBA 2 low', price: 29330 }, midZone: false })
  })

  it('exposes weekly / daily / JBA disagreements instead of collapsing them', () => {
    const ctx = classify()
    expect(ctx.location.vsWeeklyValue.read).toBe('lower-half')
    expect(ctx.location.vsDailyValue.read).toBe('below')
    expect(ctx.location.crossRead).toEqual({
      weekly: 'inside',
      daily: 'below',
      jba: 'inside',
      unanimous: false,
      disagreements: ['weekly value reads inside while daily value reads below', 'daily value reads below while JBA boxes reads inside'],
    })
    const agreed = classify({ mgi: mgiAt('09:29:00', 29395) })
    expect(agreed.location.vsDailyValue.read).toBe('at-pivot')
    expect(agreed.location.crossRead).toMatchObject({ unanimous: true, disagreements: [] })
    const betweenBoxes = classify({ mgi: mgiAt('09:29:00', 29950) })
    expect(betweenBoxes.location.crossRead).toMatchObject({ weekly: 'above', daily: 'above', jba: 'between', unanimous: true })
  })
})

describe('data quality (R13) — a separate field, never a pseudo-state', () => {
  it('fails closed on export skew strictly over 5 min between ANY two exports', () => {
    const skewed = classify({ jobStudy: { ...studyAt('2026-08-24T09:30:00'), sources: { ...studyAt().sources, weekly: { ...studyAt().sources.weekly, exportedAt: { wall: '2026-08-24T09:34:01', epochMs: 0, iso: '' } } } } })
    expect(skewed.dataQuality.maxSkewSeconds).toBe(301)
    expect(skewed.dataQuality.sufficient).toBe(false)
    expect(skewed.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'export_skew', severity: 'insufficient' }))
    expect(skewed.dataQuality.issues.find((i) => i.code === 'export_skew')?.message).toContain('request a fresh bundle')

    const boundary = classify({ jobStudy: { ...studyAt(), sources: { ...studyAt().sources, weekly: { ...studyAt().sources.weekly, exportedAt: { wall: '2026-08-24T09:34:00', epochMs: 0, iso: '' } } } } })
    expect(boundary.dataQuality.maxSkewSeconds).toBe(300)
    expect(boundary.dataQuality.sufficient).toBe(true)
  })

  it('reports the export-time proxies for the MGI (current.time) and the bars (last row)', () => {
    const ctx = classify()
    expect(ctx.dataQuality.exportTimes).toEqual({ daily: AS_OF, weekly: AS_OF, mgi: '2026-08-24T09:29:00', bars: '2026-08-24T09:29:00' })
  })

  it('places an MGI time across midnight on the right day', () => {
    const bars = execBars(flatBars('2026-08-23T23:30:00', 29, 1, 29350), ['2026-08-23T23:59:00', 29351, 29349, 29350])
    const ctx = classifyContext({ ...defaultInput(), execBars: bars, mgi: mgiAt('00:01:00', 29350), asOf: '2026-08-24T00:02:00', jobStudy: studyAt('2026-08-24T00:01:30') })
    expect(ctx.dataQuality.exportTimes.mgi).toBe('2026-08-24T00:01:00')
    expect(ctx.dataQuality.maxSkewSeconds).toBe(150)
  })

  it('flags unknown export times as a warning, not insufficient', () => {
    const noTime = classify({ mgi: mgiAt('09:29:00', 29350, { current: { price: 29350 } }) })
    expect(noTime.dataQuality.exportTimes.mgi).toBeNull()
    expect(noTime.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'export_time_unknown', severity: 'warning' }))
    expect(noTime.dataQuality.sufficient).toBe(true)
  })

  it('does not flag a correctly dated study right after the Globex reopen (session comes from asOf)', () => {
    const bars = execBars(flatBars('2026-08-24T15:30:00', 60, 1, 29350), ['2026-08-24T17:03:00', 29351, 29349, 29350])
    const ctx = classifyContext({ ...defaultInput(), execBars: bars, asOf: '2026-08-24T17:05:00', mgi: mgiAt('17:04:00', 29350), jobStudy: studyAt('2026-08-24T17:04:30', { tradingDay: '2026-08-25' }) })
    expect(ctx.dataQuality.tradingDay).toEqual({ study: '2026-08-25', bundle: '2026-08-25', match: true })
    expect(ctx.dataQuality.sufficient).toBe(true)
    expect(ctx.dataQuality.issues.map((i) => i.code)).not.toContain('trading_day_mismatch')
    // The only completed bars are the prior session's: this session has no coverage at all.
    expect(ctx.dataQuality.issues.map((i) => i.code)).toContain('no_observed_bars')
    expect(ctx.origin.coverage.lastCompletedBarAt).toBeNull()
    expect(ctx.origin.coverage).toMatchObject({ tradingDay: '2026-08-25', sessionBars: 0, overnightBars: 0 })
    expect(ctx.origin.coverage.excludedBars.priorTradingDays).toBe(60)
  })

  it('fails closed when the study trading day is not the bundle session', () => {
    const ctx = classify({ jobStudy: studyAt(AS_OF, { tradingDay: '2026-08-25' }) })
    expect(ctx.dataQuality.tradingDay).toEqual({ study: '2026-08-25', bundle: '2026-08-24', match: false })
    expect(ctx.dataQuality.sufficient).toBe(false)
    expect(ctx.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'trading_day_mismatch', severity: 'insufficient' }))
  })

  it('flags provisional boxes when the daily export precedes the RTH open', () => {
    const pre = classify({ jobStudy: studyAt('2026-08-24T08:29:59') })
    expect(pre.dataQuality.boxesProvisional).toBe(true)
    expect(pre.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'boxes_provisional', severity: 'warning' }))
    expect(classify({ jobStudy: studyAt('2026-08-24T08:30:00') }).dataQuality.boxesProvisional).toBe(false)
  })

  it('warns when the bars are behind asOf, when there are none, and before the open', () => {
    // The last completed bar is 09:28 (09:29 is the in-progress row).
    const behind = classify({ asOf: '2026-08-24T09:33:01' })
    expect(behind.dataQuality.issues.map((i) => i.code)).toContain('bars_behind_asof')
    expect(classify({ asOf: '2026-08-24T09:33:00' }).dataQuality.issues.map((i) => i.code)).not.toContain('bars_behind_asof')

    const none = classify({ execBars: [] })
    expect(none.dataQuality.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['no_observed_bars', 'export_time_unknown']))
    expect(none.dataQuality.exportTimes.bars).toBeNull()
    expect(none.origin.bands.every((b) => b.holdingSide === null && b.excursions.length === 0)).toBe(true)

    const preOpen = classify({ execBars: execBars(flatBars('2026-08-23T17:00:00', 20, 30, 29350), ['2026-08-24T07:59:00', 29351, 29349, 29350]), asOf: '2026-08-24T08:00:00', jobStudy: studyAt('2026-08-24T08:00:00'), mgi: mgiAt('07:59:00', 29350) })
    expect(preOpen.dataQuality.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['session_not_started', 'boxes_provisional']))
    expect(preOpen.origin.coverage).toMatchObject({ sessionStarted: false, sessionBars: 0 })
    expect(preOpen.dataQuality.sufficient).toBe(true)
  })

  it('surfaces the MGI pivot cross-check as a warning (the study is the source)', () => {
    const mismatch = classify({ mgi: mgiAt('09:29:00', 29350, { daily: { jobPivot: 29400 } }) })
    expect(mismatch.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'mgi_pivot_mismatch', severity: 'warning' }))
    const missing = classify({ mgi: mgiAt('09:29:00', 29350, { weekly: { jobPivot: 0 } }) })
    expect(missing.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'mgi_pivot_missing' }))
    expect(missing.dataQuality.sufficient).toBe(true)
  })

  it('uses the plain-points fallback and flags it when the scale is unavailable', () => {
    const ctx = classify({ htfBars: htfSessions(HTF_DATES.slice(0, 2), 29400, 100) })
    expect(ctx.scale).toEqual({ source: 'fallback-points', sessionSigmaPts: null, reachPts: 283, sessionsAnalyzed: null })
    expect(ctx.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'volatility_scale_unavailable' }))
    expect(ctx.roles.every((r) => r.distanceSigma === null)).toBe(true)
  })
})

describe('instrument resolution (one instrument, per-symbol points)', () => {
  it('resolves ES from the MGI symbol root with 5 / 10 tolerances and the ES reach fallback', () => {
    const base = studyAt()
    const es = { ...base, instrument: 'ES' as const, symbol: 'ESU6.CME', contractKey: 'ESU6' }
    const ctx = classifyContext({ ...defaultInput(), jobStudy: es, mgi: mgiAt('09:29:00', 29350, { symbol: 'ESU26' }), htfBars: [] })
    expect(ctx.instrument).toBe('ES')
    expect(ctx.tolerance).toEqual({ merge: 5, cap: 10 })
    expect(ctx.scale.reachPts).toBe(70)
    expect(ctx.bands.every((b) => b.high - b.low <= 10)).toBe(true)
    expect(ctx.location.vsBoxes[0].evidence.mergeTolerancePts).toBe(5)
  })

  it('falls back to the study instrument with a warning when the MGI symbol is missing', () => {
    const ctx = classify({ mgi: mgiAt('09:29:00', 29350, { symbol: '' }) })
    expect(ctx.instrument).toBe('NQ')
    expect(ctx.symbol).toBe('NQU6.CME')
    expect(ctx.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'mgi_symbol_missing', severity: 'warning' }))
    expect(ctx.dataQuality.sufficient).toBe(true)
  })

  it('fails closed when the MGI and the study disagree on the instrument', () => {
    const ctx = classify({ mgi: mgiAt('09:29:00', 29350, { symbol: 'ESU26' }) })
    expect(ctx.instrument).toBe('ES')
    expect(ctx.dataQuality.sufficient).toBe(false)
    expect(ctx.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'instrument_mismatch', severity: 'insufficient' }))
  })

  it('takes the price from the study when the MGI has none', () => {
    const ctx = classify({ mgi: mgiAt('09:29:00', 29350, { current: { time: '09:29:00' } }) })
    expect(ctx.price).toEqual({ value: 29298.5, source: 'job-study' })
  })
})

describe('input boundary (Zod)', () => {
  it('rejects a malformed or impossible asOf', () => {
    expect(() => classify({ asOf: '2026-08-24 09:30:00' })).toThrow(/asOf/)
    expect(() => classify({ asOf: '2026-02-30T09:30:00' })).toThrow(/asOf/)
    expect(() => classify({ asOf: '2026-08-24T25:00:00' })).toThrow(/asOf/)
  })

  it('rejects bars without a Date or with non-finite prices', () => {
    const bad = execBars(flatBars('2026-08-24T09:00:00', 2, 1, 29350))
    expect(() => classify({ execBars: [{ ...bad[0], close: Number.NaN }] })).toThrow()
    expect(() => classify({ execBars: [{ ...bad[0], dateTime: '2026-08-24' as unknown as Date }] })).toThrow()
  })
})
