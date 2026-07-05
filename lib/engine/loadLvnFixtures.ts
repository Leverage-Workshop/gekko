import { readFileSync } from 'fs'
import { join } from 'path'
import { parseVbpProfile } from './parseProfile'
import type { ProfileMeta } from './parseProfile'

export const FIXTURE_DIR = join(process.cwd(), 'chart-data/lvn-fixtures')

export type FixtureSplit = 'train' | 'holdout'
export type LvnType = 'valley' | 'taper-edge'

export type LvnLabels = {
  lvn: number[]
  hvn: number[]
}

export type ManifestEntry = {
  id: string
  split: FixtureSplit
  shape: string
  primaryLvnType: LvnType
}

export type LabelIssue = {
  fixtureId: string
  kind: 'lvn' | 'hvn'
  price: number
  problem: 'out-of-range' | 'off-bin'
  nearestBin: number
}

export type LvnFixture = {
  id: string
  split: FixtureSplit
  shape: string
  primaryLvnType: LvnType
  rows: { price: number; volume: number }[]
  meta: ProfileMeta
  priceRange: { min: number; max: number }
  labels: LvnLabels
}

export type LoadResult = {
  fixtures: LvnFixture[]
  issues: LabelIssue[]
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function loadManifest(dir: string = FIXTURE_DIR): ManifestEntry[] {
  const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as {
    fixtures: ManifestEntry[]
  }
  if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) {
    throw new Error('manifest.json has no fixtures')
  }
  return raw.fixtures
}

/**
 * Validate that every labeled price exists as a bin in the profile: within the
 * price range (else `out-of-range`) and snapped to an actual bin (else `off-bin`).
 * This is the guard feat-033 requires — it catches copy-paste / typo labels
 * before the feat-014 eval harness computes precision/recall against them.
 */
export function validateLabels(
  fixtureId: string,
  rows: { price: number }[],
  labels: LvnLabels,
): LabelIssue[] {
  const prices = rows.map(r => round4(r.price))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const binSet = new Set(prices)

  const checkOne = (kind: 'lvn' | 'hvn', price: number): LabelIssue | null => {
    const p = round4(price)
    const nearestBin = prices.reduce((best, b) =>
      Math.abs(b - p) < Math.abs(best - p) ? b : best,
    )
    if (p < min || p > max) {
      return { fixtureId, kind, price, problem: 'out-of-range', nearestBin }
    }
    if (!binSet.has(p)) {
      return { fixtureId, kind, price, problem: 'off-bin', nearestBin }
    }
    return null
  }

  return [
    ...labels.lvn.map(p => checkOne('lvn', p)),
    ...labels.hvn.map(p => checkOne('hvn', p)),
  ].filter((i): i is LabelIssue => i !== null)
}

function loadOne(entry: ManifestEntry, dir: string): { fixture: LvnFixture; issues: LabelIssue[] } {
  const vbp = parseVbpProfile(readFileSync(join(dir, `${entry.id}.vbp.md`), 'utf-8'))
  const labels = JSON.parse(
    readFileSync(join(dir, `${entry.id}.labels.json`), 'utf-8'),
  ) as LvnLabels

  const prices = vbp.rows.map(r => r.price)
  const fixture: LvnFixture = {
    id: entry.id,
    split: entry.split,
    shape: entry.shape,
    primaryLvnType: entry.primaryLvnType,
    rows: vbp.rows,
    meta: vbp.meta,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    labels,
  }
  return { fixture, issues: validateLabels(entry.id, vbp.rows, labels) }
}

export function formatIssues(issues: LabelIssue[]): string {
  return issues
    .map(
      i =>
        `  ${i.fixtureId}: ${i.kind} ${i.price} is ${i.problem} (nearest bin ${i.nearestBin})`,
    )
    .join('\n')
}

/**
 * Load every fixture named in manifest.json with its labels, validating each.
 * With `strict: true`, throws if any label is out-of-range or off-bin.
 */
export function loadLvnFixtures(opts: { dir?: string; strict?: boolean } = {}): LoadResult {
  const dir = opts.dir ?? FIXTURE_DIR
  const loaded = loadManifest(dir).map(entry => loadOne(entry, dir))
  const fixtures = loaded.map(l => l.fixture)
  const issues = loaded.flatMap(l => l.issues)

  if (opts.strict && issues.length > 0) {
    throw new Error(`LVN fixture label validation failed:\n${formatIssues(issues)}`)
  }
  return { fixtures, issues }
}
