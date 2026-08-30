import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { TICK_SIZE, type Instrument } from './instrument'
import { NODE_KINDS } from './schema'

/**
 * The Job LVN/HVN golden set (feat-120, docs/job-planning-task-plan.md "Ground
 * truth and validation"). The repo half — operator labels transcribed from
 * lvn-corpus.md A1 and the fewShot/test split — plus a loader that pairs each
 * date's labels with whichever of feat-119's operator-side profile exports have
 * landed (they arrive incrementally; missing files are reported, not thrown).
 *
 * No LLM, no rendering. `chart-data/job-lvn-golden/` is the default root.
 */

export const GOLDEN_ROOT = 'chart-data/job-lvn-golden'

/** Which lookback a label pins. `any` scores leniently (a hit on either profile counts). */
export const GOLDEN_PROFILES = ['5d', '4h', 'overnight', 'any'] as const
export type GoldenProfile = (typeof GOLDEN_PROFILES)[number]

/** The profile files feat-119 exports per date; `any` never has its own file. */
export const PROFILE_FILES: Readonly<Record<Exclude<GoldenProfile, 'any'>, string>> = {
  '5d': 'five-day-rolling.vbp.md',
  '4h': 'four-hour-rolling.vbp.md',
  overnight: 'overnight.vbp.md',
}

/**
 * Where a label's band came from. `corpus` = transcribed straight from the A1 row (the
 * price is spoken in the transcript). `replay` = feat-119: the operator replayed the date
 * and the profile disagreed with the transcript, so the band is the one the replayed
 * profile actually shows. `corpusRef`/`verbatim` still cite the row the read came from —
 * only the price is the operator's, so the A1 price assertions do not apply to it.
 */
export const LABEL_SOURCES = ['corpus', 'replay'] as const
export type LabelSource = (typeof LABEL_SOURCES)[number]

const INSTRUMENTS = ['NQ', 'ES'] as const

const price = z.number().finite()

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A shape-valid ISO date that is also a real calendar date (rejects 2026-99-99, 2026-02-30). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const isoDate = z.string().refine(isCalendarDate, { message: 'must be a real YYYY-MM-DD date' })

export const goldenLabelSchema = z
  .object({
    instrument: z.enum(INSTRUMENTS),
    profile: z.enum(GOLDEN_PROFILES),
    kind: z.enum(NODE_KINDS),
    priceLow: price,
    priceHigh: price,
    primary: z.boolean(),
    corpusRef: z.number().int().positive(),
    verbatim: z.string().min(1),
    /** Defaults to `corpus`; `replay` marks an operator correction from feat-119's replay. */
    source: z.enum(LABEL_SOURCES).default('corpus'),
  })
  .strict()
  .refine((l) => l.priceLow <= l.priceHigh, {
    message: 'priceLow must be <= priceHigh',
    path: ['priceLow'],
  })
  .refine((l) => !l.primary || l.kind === 'lvn', {
    message: 'only an lvn can be primary',
    path: ['primary'],
  })
export type GoldenLabel = z.infer<typeof goldenLabelSchema>

/**
 * A date's labels: non-empty, all one instrument (feat-119 exports one chartbook
 * profile per folder), and at most one primary per profile.
 */
export const labelsSchema = z
  .array(goldenLabelSchema)
  .min(1)
  .refine((ls) => new Set(ls.map((l) => l.instrument)).size === 1, {
    message: 'a date folder must hold a single instrument',
  })
  .refine(
    (ls) => {
      const byProfile = new Map<string, number>()
      for (const l of ls.filter((l) => l.primary)) {
        byProfile.set(l.profile, (byProfile.get(l.profile) ?? 0) + 1)
      }
      return [...byProfile.values()].every((c) => c <= 1)
    },
    { message: 'at most one primary per profile' }
  )

const uniqueDates = (arr: string[]) => new Set(arr).size === arr.length

export const splitSchema = z
  .object({
    fewShot: z.array(isoDate).min(1),
    test: z.array(isoDate),
  })
  .strict()
  .refine((s) => s.fewShot.every((d) => !s.test.includes(d)), {
    message: 'fewShot and test must not overlap',
    path: ['test'],
  })
  .refine((s) => uniqueDates(s.fewShot) && uniqueDates(s.test), {
    message: 'split date lists must not contain duplicates',
  })
export type GoldenSplit = z.infer<typeof splitSchema>

/**
 * feat-119's per-date sidecar (operator-side). Parsed here so the loader validates it when
 * present. `replayAt` is optional: the operator replays to the prep video itself, so the
 * timestamp is provenance only (operator, 2026-08-24). `note` is where the operator records
 * differences between the LVNs the corpus says to look for and what the replayed profile shows.
 */
export const replaySchema = z
  .object({
    replayAt: z.string().datetime({ offset: true }).optional(),
    instrument: z.enum(INSTRUMENTS),
    sessionTemplate: z.string().min(1),
    /** `expects` = what the corpus says to look for (pre-filled from labels.json); `observed` = what the operator actually sees on the replayed profile. */
    note: z.object({ expects: z.string(), observed: z.string() }).strict().optional(),
  })
  .strict()
export type GoldenReplay = z.infer<typeof replaySchema>

export type SplitRole = 'fewShot' | 'test'

export type GoldenDate = {
  readonly date: string
  readonly role: SplitRole
  readonly labels: readonly GoldenLabel[]
  readonly instrument: Instrument
  /** feat-119's replay.json, or null until it lands. */
  readonly replay: GoldenReplay | null
  /** Which of feat-119's profile files are present for this date. */
  readonly profilesPresent: readonly Exclude<GoldenProfile, 'any'>[]
  /** Profile files a label references but that have not landed yet (feat-119 incremental). */
  readonly profilesMissing: readonly Exclude<GoldenProfile, 'any'>[]
  /** False until at least one profile file lands — the date cannot be scored yet. */
  readonly scorable: boolean
}

export type GoldenSet = {
  readonly split: GoldenSplit
  readonly dates: readonly GoldenDate[]
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * The instrument for a date: `replay.json` when present (authoritative — feat-119
 * records what was actually replayed), else the label price magnitude. NQ has
 * traded above 10,000 and ES below it across the corpus window, with no overlap.
 */
export function instrumentOf(
  labels: readonly GoldenLabel[],
  replay: GoldenReplay | null
): Instrument {
  if (replay) return replay.instrument
  const max = Math.max(...labels.map((l) => l.priceHigh))
  return max >= 10_000 ? 'NQ' : 'ES'
}

/** The distinct named profiles a date's labels reference (excludes `any`). */
export function referencedProfiles(
  labels: readonly GoldenLabel[]
): Exclude<GoldenProfile, 'any'>[] {
  const named = new Set(
    labels.map((l) => l.profile).filter((p): p is Exclude<GoldenProfile, 'any'> => p !== 'any')
  )
  return [...named]
}

function loadDate(root: string, date: string, role: SplitRole): GoldenDate {
  const dir = join(root, date)
  const labels = labelsSchema.parse(readJson(join(dir, 'labels.json')))
  const replayPath = join(dir, 'replay.json')
  const replay = existsSync(replayPath) ? replaySchema.parse(readJson(replayPath)) : null

  const byMagnitude = instrumentOf(labels, null)
  if (replay && replay.instrument !== byMagnitude) {
    throw new Error(
      `${date}: replay.json instrument ${replay.instrument} contradicts the labels (${byMagnitude})`
    )
  }

  const present = (Object.keys(PROFILE_FILES) as Exclude<GoldenProfile, 'any'>[]).filter((p) =>
    existsSync(join(dir, PROFILE_FILES[p]))
  )
  // `any` labels can be scored against whichever profile is present, so they do not
  // themselves demand a file; only explicitly named profiles can be "missing".
  const missing = referencedProfiles(labels).filter((p) => !present.includes(p))

  // A date is scorable only when a file exists that some label can be scored against:
  // the named profile for a strict label, or ANY present profile for an `any` label.
  const scorable = labels.some((l) =>
    l.profile === 'any' ? present.length > 0 : present.includes(l.profile)
  )

  return {
    date,
    role,
    labels,
    instrument: instrumentOf(labels, replay),
    replay,
    profilesPresent: present,
    profilesMissing: missing,
    scorable,
  }
}

/**
 * Load the whole golden set. `split.json` drives which dates exist and their
 * role; a date folder holding only `labels.json` loads fine (its profile files
 * are simply reported absent). Throws on a malformed manifest — a corrupt
 * golden set must fail loudly, not silently score fewer dates.
 */
export function loadGoldenSet(root: string = GOLDEN_ROOT): GoldenSet {
  const split = splitSchema.parse(readJson(join(root, 'split.json')))
  const roleOf = (date: string): SplitRole => (split.fewShot.includes(date) ? 'fewShot' : 'test')
  const dates = [...split.fewShot, ...split.test]
    .sort()
    .map((date) => loadDate(root, date, roleOf(date)))
  return { split, dates }
}

/**
 * Every date folder on disk (whether or not it is in the split) — for the coverage test.
 * Only `YYYY-MM-DD` directories count: the operator stages the exporter's live output in
 * sibling scratch folders (`es/`, `nq/`), which are not golden dates and are gitignored.
 */
export function listGoldenDates(root: string = GOLDEN_ROOT): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isCalendarDate(e.name))
    .map((e) => e.name)
    .sort()
}

/** True when a price sits on the instrument's tick grid. */
export function isTickAligned(price: number, _instrument: Instrument): boolean {
  return Math.abs(price / TICK_SIZE - Math.round(price / TICK_SIZE)) < 1e-6
}
