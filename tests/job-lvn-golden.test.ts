import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  GOLDEN_ROOT,
  goldenLabelSchema,
  instrumentOf,
  isTickAligned,
  labelsSchema,
  listGoldenDates,
  loadGoldenSet,
  referencedProfiles,
  replaySchema,
  splitSchema,
  type GoldenLabel,
} from '@/lib/job-plan/profile-vision/goldenSet'

const set = loadGoldenSet()
const CORPUS = readFileSync(join(process.cwd(), 'docs/jba-research/lvn-corpus.md'), 'utf8')

/** Section A1 parsed to {row number -> its line}, so a corpusRef is checked against the RIGHT row. */
const A1_ROWS = (() => {
  const section = CORPUS.split('### A1')[1]?.split('### A2')[0] ?? ''
  const rows = new Map<number, string>()
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|/)
    if (m) rows.set(Number(m[1]), line)
  }
  return rows
})()

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('golden split', () => {
  it('the three few-shot dates are fixed and disjoint from test', () => {
    expect(set.split.fewShot).toEqual(['2026-02-13', '2026-08-07', '2026-06-02'])
    for (const d of set.split.fewShot) expect(set.split.test).not.toContain(d)
  })

  it('covers every labeled date with no overlap and no orphan folder', () => {
    const inSplit = [...set.split.fewShot, ...set.split.test].sort()
    expect(inSplit).toEqual(listGoldenDates())
    expect(new Set(inSplit).size).toBe(inSplit.length)
  })

  it('marks each date with its split role', () => {
    for (const d of set.dates) {
      expect(d.role).toBe(set.split.fewShot.includes(d.date) ? 'fewShot' : 'test')
    }
  })
})

describe('golden labels', () => {
  const all = set.dates.flatMap((d) => d.labels.map((l) => ({ date: d.date, label: l })))

  it('parsed A1 into rows (guards the corpus-quote test below)', () => {
    expect(A1_ROWS.size).toBeGreaterThan(30)
    expect(A1_ROWS.get(3)).toContain('deepest LVN on the 5day rolling')
  })

  it('every label validates against the schema', () => {
    for (const { label } of all) expect(goldenLabelSchema.safeParse(label).success).toBe(true)
  })

  it('every corpusRef resolves to its A1 row and the verbatim is a contiguous quote FROM THAT ROW', () => {
    for (const { date, label } of all) {
      const row = A1_ROWS.get(label.corpusRef)
      expect(row, `${date}: A1 row ${label.corpusRef} not found`).toBeDefined()
      expect(norm(row!), `${date} ref ${label.corpusRef}: verbatim not in that row`).toContain(
        norm(label.verbatim)
      )
    }
  })

  it('the A1 row names priceLow as its full price, and priceHigh as full or a colloquial short form', () => {
    // priceLow is the strict anchor: the A1 Price column carries the fully-expanded low
    // endpoint, so requiring the boundary-delimited full price catches a wrong-row citation
    // AND a wrong thousands digit — ES "45" alone cannot tell 6745 from 7745, "6745" can.
    // No last-N fallback for the low (that is exactly the false-pass). priceHigh of a band is
    // often spoken colloquially ("68 to 72"), so it is a softer full/last3/last2 check.
    const boundary = (n: number, s: string) => new RegExp(`\\b${n}s?\\b`).test(s)
    for (const { date, label } of all) {
      const row = A1_ROWS.get(label.corpusRef)!
      const low = Math.floor(label.priceLow)
      expect(
        boundary(low, row),
        `${date} ref ${label.corpusRef}: row does not name the full priceLow ${label.priceLow}`
      ).toBe(true)

      // a fractional tick must be spoken in the row ("24485 half" = .5), so an accidental
      // .25/.75 edit is caught rather than hidden by the integer floor.
      const FRACTION_WORDS: Record<string, RegExp> = {
        '0.25': /quarter/i,
        '0.5': /\bhalf\b/i,
        '0.75': /(three|3)[\s-]*quarter/i,
      }
      const frac = label.priceLow - low
      if (frac !== 0) {
        expect(
          FRACTION_WORDS[String(frac)]?.test(row),
          `${date} ref ${label.corpusRef}: fractional priceLow ${label.priceLow} not spoken in the row`
        ).toBe(true)
      }

      const high = Math.floor(label.priceHigh)
      const highOk =
        boundary(high, row) ||
        boundary(high % 1000, row) ||
        new RegExp(`\\b${String(high % 100).padStart(2, '0')}\\b`).test(row)
      expect(
        highOk,
        `${date} ref ${label.corpusRef}: row does not name priceHigh ${label.priceHigh}`
      ).toBe(true)
    }
  })

  it('(corpusRef, band) is unique within a date (one A1 row may yield >1 node)', () => {
    for (const d of set.dates) {
      const keys = d.labels.map((l) => `${l.corpusRef}:${l.priceLow}-${l.priceHigh}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('bands satisfy low <= high and every price is tick-aligned for the date instrument', () => {
    for (const d of set.dates) {
      for (const l of d.labels) {
        expect(l.priceLow).toBeLessThanOrEqual(l.priceHigh)
        expect(isTickAligned(l.priceLow, d.instrument), `${d.date} ${l.priceLow} off-grid`).toBe(
          true
        )
        expect(isTickAligned(l.priceHigh, d.instrument)).toBe(true)
      }
    }
  })

  it('every label on a date shares that date instrument, matching the price magnitude', () => {
    for (const d of set.dates) {
      expect(d.labels.every((l) => l.instrument === d.instrument)).toBe(true)
      const max = Math.max(...d.labels.map((l) => l.priceHigh))
      expect(d.instrument).toBe(max >= 10_000 ? 'NQ' : 'ES')
    }
  })

  it('at most one primary per (date, profile), and a primary is always an lvn', () => {
    for (const d of set.dates) {
      const byProfile = new Map<string, number>()
      for (const l of d.labels.filter((l) => l.primary)) {
        expect(l.kind).toBe('lvn')
        byProfile.set(l.profile, (byProfile.get(l.profile) ?? 0) + 1)
      }
      for (const [, count] of byProfile) expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('the few-shot dates demonstrate the split.json intent', () => {
    const byDate = (date: string) => set.dates.find((d) => d.date === date)!.labels
    const deep = byDate('2026-02-13').find((l) => l.primary)!
    expect(deep).toMatchObject({ profile: '5d', kind: 'lvn', instrument: 'NQ' })
    expect(byDate('2026-08-07').some((l) => l.primary && l.kind === 'lvn')).toBe(true)
    const june = byDate('2026-06-02')
    expect(june.some((l) => l.kind === 'exhaustive-node')).toBe(true)
    expect(june.some((l) => l.kind === 'hvn-edge')).toBe(true)
    expect(june.some((l) => l.kind === 'lvn')).toBe(true)
  })
})

describe('schemas reject malformed input', () => {
  const good: GoldenLabel = {
    instrument: 'ES',
    profile: 'any',
    kind: 'lvn',
    priceLow: 6800,
    priceHigh: 6800,
    primary: false,
    corpusRef: 1,
    verbatim: 'x',
  }

  it('goldenLabelSchema is strict and enforces band + primary-is-lvn', () => {
    expect(goldenLabelSchema.safeParse({ ...good, extra: 1 }).success).toBe(false)
    expect(goldenLabelSchema.safeParse({ ...good, priceLow: 10, priceHigh: 5 }).success).toBe(false)
    expect(goldenLabelSchema.safeParse({ ...good, kind: 'hvn-core', primary: true }).success).toBe(
      false
    )
    expect(goldenLabelSchema.safeParse({ ...good, kind: 'lvn', primary: true }).success).toBe(true)
  })

  it('labelsSchema rejects an empty array, mixed instruments, and two primaries in one profile', () => {
    expect(labelsSchema.safeParse([]).success).toBe(false)
    expect(
      labelsSchema.safeParse([
        good,
        { ...good, instrument: 'NQ', priceLow: 24000, priceHigh: 24000 },
      ]).success
    ).toBe(false)
    const p1 = { ...good, kind: 'lvn' as const, primary: true }
    expect(labelsSchema.safeParse([p1, { ...p1, priceLow: 6810, priceHigh: 6810 }]).success).toBe(
      false
    )
    // two primaries on DIFFERENT profiles are allowed
    expect(
      labelsSchema.safeParse([p1, { ...p1, profile: '4h', priceLow: 6810, priceHigh: 6810 }])
        .success
    ).toBe(true)
  })

  it('splitSchema requires ISO dates, no overlap, no duplicates', () => {
    expect(splitSchema.safeParse({ fewShot: ['2026-01-01'], test: ['2026-01-02'] }).success).toBe(
      true
    )
    expect(splitSchema.safeParse({ fewShot: ['2026-01-01'], test: ['2026-01-01'] }).success).toBe(
      false
    )
    expect(splitSchema.safeParse({ fewShot: ['2026-01-01', '2026-01-01'], test: [] }).success).toBe(
      false
    )
    expect(splitSchema.safeParse({ fewShot: ['01/01/2026'], test: [] }).success).toBe(false)
    expect(splitSchema.safeParse({ fewShot: ['2026-99-99'], test: [] }).success).toBe(false)
    expect(splitSchema.safeParse({ fewShot: ['2026-02-30'], test: [] }).success).toBe(false)
    expect(splitSchema.safeParse({ fewShot: ['2026-01-01'], test: [], extra: 1 }).success).toBe(
      false
    )
  })

  it('replaySchema requires an offset datetime and a known instrument', () => {
    expect(
      replaySchema.safeParse({
        replayAt: '2026-01-01T09:15:00-05:00',
        instrument: 'NQ',
        sessionTemplate: 't',
      }).success
    ).toBe(true)
    expect(
      replaySchema.safeParse({ replayAt: '2026-01-01', instrument: 'NQ', sessionTemplate: 't' })
        .success
    ).toBe(false)
    expect(
      replaySchema.safeParse({
        replayAt: '2026-01-01T09:15:00-05:00',
        instrument: 'CL',
        sessionTemplate: 't',
      }).success
    ).toBe(false)
  })
})

describe('loader', () => {
  it('reports present/missing profiles + scorable without throwing (feat-119 lands incrementally)', () => {
    for (const d of set.dates) {
      expect(d.profilesPresent).toEqual([])
      expect(d.profilesMissing).toEqual(referencedProfiles(d.labels))
      expect(d.replay).toBeNull()
      expect(d.scorable).toBe(false)
    }
  })

  it('instrumentOf prefers replay.json over the price magnitude', () => {
    const es: GoldenLabel[] = [
      {
        instrument: 'ES',
        profile: 'any',
        kind: 'lvn',
        priceLow: 6800,
        priceHigh: 6800,
        primary: false,
        corpusRef: 1,
        verbatim: 'x',
      },
    ]
    expect(instrumentOf(es, null)).toBe('ES')
    expect(
      instrumentOf(es, {
        replayAt: '2026-01-01T09:15:00-05:00',
        instrument: 'NQ',
        sessionTemplate: 't',
      })
    ).toBe('NQ')
    expect(
      instrumentOf([{ ...es[0], instrument: 'NQ', priceLow: 24960, priceHigh: 24960 }], null)
    ).toBe('NQ')
  })

  describe('with temp fixtures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golden-'))
    afterAll(() => rmSync(dir, { recursive: true, force: true }))
    const writeDate = (date: string, labels: unknown, extra: Record<string, string> = {}) => {
      // fresh folder each time — no profile file leaks between tests that reuse the date
      rmSync(join(dir, date), { recursive: true, force: true })
      mkdirSync(join(dir, date), { recursive: true })
      writeFileSync(join(dir, date, 'labels.json'), JSON.stringify(labels))
      for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, date, name), body)
    }
    const label = (over: Partial<GoldenLabel> = {}): GoldenLabel => ({
      instrument: 'ES',
      profile: '5d',
      kind: 'lvn',
      priceLow: 6800,
      priceHigh: 6800,
      primary: false,
      corpusRef: 1,
      verbatim: 'x',
      ...over,
    })

    it('tolerates a date folder holding only labels.json, and marks it unscorable', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [label()])
      const g = loadGoldenSet(dir)
      expect(g.dates).toHaveLength(1)
      expect(g.dates[0]).toMatchObject({
        scorable: false,
        profilesMissing: ['5d'],
        instrument: 'ES',
      })
    })

    it('reports the named profile file as scorable', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [label()], { 'five-day-rolling.vbp.md': '# profile' })
      const d = loadGoldenSet(dir).dates[0]
      expect(d).toMatchObject({ scorable: true, profilesPresent: ['5d'], profilesMissing: [] })
    })

    it('is NOT scorable when only an unrelated profile file exists for a strict label', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [label({ profile: '5d' })], { 'overnight.vbp.md': '# profile' })
      const d = loadGoldenSet(dir).dates[0]
      expect(d).toMatchObject({
        scorable: false,
        profilesPresent: ['overnight'],
        profilesMissing: ['5d'],
      })
    })

    it('an `any` label is scorable against whichever profile is present', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [label({ profile: 'any' })], { 'overnight.vbp.md': '# profile' })
      expect(loadGoldenSet(dir).dates[0].scorable).toBe(true)
    })

    it('throws when replay.json contradicts the label instrument', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [label({ instrument: 'ES', priceLow: 6800, priceHigh: 6800 })], {
        'replay.json': JSON.stringify({
          replayAt: '2026-01-01T09:15:00-05:00',
          instrument: 'NQ',
          sessionTemplate: 't',
        }),
      })
      expect(() => loadGoldenSet(dir)).toThrow(/contradicts the labels/)
    })

    it('throws on a malformed labels.json', () => {
      writeFileSync(join(dir, 'split.json'), JSON.stringify({ fewShot: ['2026-01-01'], test: [] }))
      writeDate('2026-01-01', [{ ...label(), priceLow: 'nope' }])
      expect(() => loadGoldenSet(dir)).toThrow()
    })
  })

  it('the root constant points at the golden directory', () => {
    expect(GOLDEN_ROOT).toBe('chart-data/job-lvn-golden')
  })
})
