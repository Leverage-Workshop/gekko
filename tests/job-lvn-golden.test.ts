import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GOLDEN_ROOT,
  goldenLabelSchema,
  instrumentOf,
  isTickAligned,
  listGoldenDates,
  loadGoldenSet,
  referencedProfiles,
  type GoldenLabel,
} from '@/lib/job-plan/profile-vision/goldenSet'

const set = loadGoldenSet()
const CORPUS = readFileSync(join(process.cwd(), 'docs/jba-research/lvn-corpus.md'), 'utf8')

/** Highest A1 corpus row number (the last numbered prep row). */
const MAX_A1_ROW = 41

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

  it('every label validates against the schema', () => {
    for (const { label } of all) expect(goldenLabelSchema.safeParse(label).success).toBe(true)
  })

  it('every corpusRef points at a real A1 row and its verbatim is a genuine quote from the corpus', () => {
    for (const { date, label } of all) {
      expect(label.corpusRef, `${date} ref out of range`).toBeGreaterThanOrEqual(1)
      expect(label.corpusRef).toBeLessThanOrEqual(MAX_A1_ROW)
      // the corpus has a row `| <ref> |` in section A1
      expect(CORPUS, `A1 row ${label.corpusRef} not found`).toContain(`| ${label.corpusRef} |`)
    }
  })

  it('corpusRef is unique within a date (per (date, corpusRef, band))', () => {
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

  it('every label on a date shares that date instrument, and matches the price magnitude', () => {
    for (const d of set.dates) {
      expect(d.labels.every((l) => l.instrument === d.instrument)).toBe(true)
      const max = Math.max(...d.labels.map((l) => l.priceHigh))
      expect(d.instrument).toBe(max >= 10_000 ? 'NQ' : 'ES')
    }
  })

  it('at most one primary per (date, profile)', () => {
    for (const d of set.dates) {
      const byProfile = new Map<string, number>()
      for (const l of d.labels.filter((l) => l.primary)) {
        byProfile.set(l.profile, (byProfile.get(l.profile) ?? 0) + 1)
      }
      for (const [, count] of byProfile) expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('a primary is always an lvn (Job names deepest/most-prominent LVNs)', () => {
    for (const { label } of all) if (label.primary) expect(label.kind).toBe('lvn')
  })

  it('the few-shot dates demonstrate the split.json intent', () => {
    const byDate = (date: string) => set.dates.find((d) => d.date === date)!.labels
    // 02-13: the deepest LVN on the 5-day is the primary
    const deep = byDate('2026-02-13').find((l) => l.primary)!
    expect(deep).toMatchObject({ profile: '5d', kind: 'lvn', instrument: 'NQ' })
    // 08-07: a primary LVN above the JBA lows
    expect(byDate('2026-08-07').some((l) => l.primary && l.kind === 'lvn')).toBe(true)
    // 06-02: an exhaustive node on top + an LVN under the HVE
    const june = byDate('2026-06-02')
    expect(june.some((l) => l.kind === 'exhaustive-node')).toBe(true)
    expect(june.some((l) => l.kind === 'hvn-edge')).toBe(true)
    expect(june.some((l) => l.kind === 'lvn')).toBe(true)
  })
})

describe('loader', () => {
  it('reports which profile files are present / missing without throwing (feat-119 lands incrementally)', () => {
    for (const d of set.dates) {
      // feat-119 exports are operator-side and not in the repo yet
      expect(d.profilesPresent).toEqual([])
      expect(d.profilesMissing).toEqual(referencedProfiles(d.labels))
      expect(d.replay).toBeNull()
    }
  })

  it('tolerates a date folder holding only labels.json', () => {
    // every date currently has only labels.json — the load above already proves it
    expect(set.dates.length).toBeGreaterThan(0)
    expect(set.dates.every((d) => d.labels.length >= 1)).toBe(true)
  })

  it('instrumentOf prefers replay.json over the price magnitude', () => {
    const esLabels: GoldenLabel[] = [
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
    expect(instrumentOf(esLabels, null)).toBe('ES')
    expect(
      instrumentOf(esLabels, {
        replayAt: '2026-01-01T09:15:00-05:00',
        instrument: 'NQ',
        sessionTemplate: 't',
      })
    ).toBe('NQ')
    const nqLabels: GoldenLabel[] = [
      { ...esLabels[0], instrument: 'NQ', priceLow: 24960, priceHigh: 24960 },
    ]
    expect(instrumentOf(nqLabels, null)).toBe('NQ')
  })

  it('the root constant points at the golden directory', () => {
    expect(GOLDEN_ROOT).toBe('chart-data/job-lvn-golden')
  })
})
