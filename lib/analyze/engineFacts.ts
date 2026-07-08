import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { detectLvnHvn } from '@/lib/engine/lvnDetection'
import type { LvnDetectionResult } from '@/lib/engine/lvnDetection'
import { evaluateMagnetCheck } from '@/lib/engine/magnetCheck'
import type { MagnetCheck, ProfileSummary } from '@/lib/engine/magnetCheck'
import { computeMgiPriority } from '@/lib/engine/mgiPriority'
import type { MgiPriority, MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { parseProfiles } from '@/lib/engine/parseProfile'
import { computeRipStatus } from '@/lib/engine/ripStatus'
import type { RipStatus } from '@/lib/engine/ripStatus'
import { assessStaleness } from '@/lib/engine/staleness'
import type { StalenessAssessment } from '@/lib/engine/staleness'
import { assembleTerrain } from '@/lib/engine/terrainZones'
import type { TerrainZonesResult } from '@/lib/engine/terrainZones'

/**
 * Deterministic engine pass over one export bundle: every computed fact the
 * model receives (and must not re-derive) in the analyze-task prompt.
 * LVN/HVN node prices, terrain borders, magnet set, MGI tiering, Rip condition
 * and staleness are all code-owned — the model supplies perception/judgment.
 */

export interface EngineFactsInput {
  /** Sierra VbP volume profile export (`vbp_export.md`). */
  vbpContent: string
  /** Sierra delta profile export (`delta_vbp_export.md`). */
  deltaContent: string
  /** Execution-bar CSV export (`execution_bars.csv`). */
  execCsvContent: string
  /** Parsed `mgi_json` from the bundle row. */
  mgi: MgiStaticLevels
  /** `raw_bundles.received_at` — feeds the staleness assessment. */
  receivedAt: string | null
  /** Evaluation instant; defaults to the wall clock. */
  now?: string | number | Date
}

export interface EngineFacts {
  currentPrice: number
  staleness: StalenessAssessment
  deltaTelemetry: DeltaTelemetry
  mgi: MgiPriority
  /** Resolved Vanguard condition, or null when `mgi.daily.rip` is absent. */
  ripStatus: RipStatus | null
  lvn: LvnDetectionResult
  magnetCheck: MagnetCheck
  terrain: TerrainZonesResult
  profileSummary: ProfileSummary
  /** Non-fatal degradations (missing rip, terrain issues, ...). */
  warnings: string[]
}

/** Every engine zone border price (deduped, price-descending). */
export function engineZoneBorders(terrain: TerrainZonesResult): number[] {
  const borders = terrain.zones.flatMap((zone) => [zone.top, zone.bottom])
  return [...new Set(borders)].sort((a, b) => b - a)
}

/**
 * Run the full deterministic engine over one bundle's raw exports.
 *
 * @throws when a required input fails to parse (malformed bundle) — the
 *   trigger.dev retry policy handles transient cases; a malformed bundle fails
 *   every attempt by design rather than producing a briefing from bad facts.
 */
export function computeEngineFacts(input: EngineFactsInput): EngineFacts {
  const warnings: string[] = []

  const profiles = parseProfiles(input.vbpContent, input.deltaContent)
  // A VbP/Delta join is by exact bin price: if the two exports' bin grids
  // drift apart, every joined row gets delta:null and terrain silently loses
  // the order-flow read — surface that instead of failing quietly.
  if (profiles.rows.length > 0 && profiles.rows.every((row) => row.delta === null)) {
    warnings.push(
      'VbP/Delta join matched no bins (delta is null on every row) — likely a bin-grid/step mismatch between the two exports; terrain loses the order-flow read',
    )
  }
  const bars = parseExecBars(input.execCsvContent)
  const deltaTelemetry = computeDeltaTelemetry(bars)
  const mgi = computeMgiPriority(input.mgi)
  const lvn = detectLvnHvn(profiles.rows)
  const staleness = assessStaleness({ receivedAt: input.receivedAt, now: input.now })

  const profileSummary: ProfileSummary = {
    pocPrice: profiles.vbpMeta.pocPrice,
    valueAreaHigh: profiles.vbpMeta.valueAreaHigh,
    valueAreaLow: profiles.vbpMeta.valueAreaLow,
  }

  const rip = input.mgi.daily?.rip
  let ripStatus: RipStatus | null = null
  if (typeof rip === 'number' && Number.isFinite(rip)) {
    ripStatus = computeRipStatus({
      currentPrice: mgi.currentPrice,
      rip,
      deltaIntensity: deltaTelemetry.recentMeanDelta,
    })
  } else {
    warnings.push('mgi.daily.rip missing — Rip/Vanguard condition not computed')
  }

  const magnetCheck = evaluateMagnetCheck({
    summary: profileSummary,
    hvn: lvn.hvn,
    levels: mgi.tier1,
  })

  const terrain = assembleTerrain({
    profile: profiles.rows,
    lvn,
    summary: profileSummary,
    mgi,
  })
  if (!terrain.contiguityValid) {
    warnings.push(`terrain contiguity invalid: ${terrain.issues.join('; ')}`)
  }
  if (staleness.isStale) {
    warnings.push(staleness.warning ?? 'bundle is stale')
  }

  return {
    currentPrice: mgi.currentPrice,
    staleness,
    deltaTelemetry,
    mgi,
    ripStatus,
    lvn,
    magnetCheck,
    terrain,
    profileSummary,
    warnings,
  }
}
