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

const INSTRUMENTS = ['NQ', 'ES'] as const

const price = z.number().finite()

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
  })
  .refine((l) => l.priceLow <= l.priceHigh, {
    message: 'priceLow must be <= priceHigh',
    path: ['priceLow'],
  })
export type GoldenLabel = z.infer<typeof goldenLabelSchema>

export const labelsSchema = z.array(goldenLabelSchema).min(1)

export const splitSchema = z
  .object({
    fewShot: z.array(z.string()).min(1),
    test: z.array(z.string()),
  })
  .refine((s) => s.fewShot.every((d) => !s.test.includes(d)), {
    message: 'fewShot and test must not overlap',
    path: ['test'],
  })
export type GoldenSplit = z.infer<typeof splitSchema>

/** feat-119's per-date sidecar (operator-side). Parsed here so the loader validates it when present. */
export const replaySchema = z.object({
  replayAt: z.string().min(1),
  instrument: z.enum(INSTRUMENTS),
  sessionTemplate: z.string().min(1),
  note: z.string().optional(),
})
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

  const present = (Object.keys(PROFILE_FILES) as Exclude<GoldenProfile, 'any'>[]).filter((p) =>
    existsSync(join(dir, PROFILE_FILES[p]))
  )
  // `any` labels can be scored against whichever profile is present, so they do not
  // themselves demand a file; only explicitly named profiles can be "missing".
  const missing = referencedProfiles(labels).filter((p) => !present.includes(p))

  return {
    date,
    role,
    labels,
    instrument: instrumentOf(labels, replay),
    replay,
    profilesPresent: present,
    profilesMissing: missing,
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

/** Every date folder on disk (whether or not it is in the split) — for the coverage test. */
export function listGoldenDates(root: string = GOLDEN_ROOT): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

/** True when a price sits on the instrument's tick grid. */
export function isTickAligned(price: number, _instrument: Instrument): boolean {
  return Math.abs(price / TICK_SIZE - Math.round(price / TICK_SIZE)) < 1e-6
}
