import { scanAbsorption } from '@/lib/engine/absorption'
import type { AbsorptionScanResult } from '@/lib/engine/absorption'
import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { detectLvnHvn } from '@/lib/engine/lvnDetection'
import type { LvnDetectionResult } from '@/lib/engine/lvnDetection'
import { collectMagnets, evaluateMagnetCheck } from '@/lib/engine/magnetCheck'
import type { MagnetCheck, ProfileSummary } from '@/lib/engine/magnetCheck'
import { computeMgiPriority } from '@/lib/engine/mgiPriority'
import type { MgiPriority, MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { parseDeltaProfile, parseVbpProfile } from '@/lib/engine/parseProfile'
import { computeRipStatus } from '@/lib/engine/ripStatus'
import type { RipStatus } from '@/lib/engine/ripStatus'
import { assessStaleness } from '@/lib/engine/staleness'
import type { StalenessAssessment } from '@/lib/engine/staleness'
import { assembleTerrain } from '@/lib/engine/terrainZones'
import type { TerrainZonesResult } from '@/lib/engine/terrainZones'

/**
 * Deterministic engine pass over one export bundle: every computed fact the
 * model receives (and must not re-derive) in the analyze-task prompt.
 * LVN/HVN node prices (per volume profile), terrain borders, magnet set,
 * absorption-candidate stacks, MGI tiering, Rip condition and staleness are
 * all code-owned — the model supplies perception/judgment.
 */

export interface EngineFactsInput {
  /** HTF volume profile anchored to the current 400-pt rotation (`four-hundred-rotation.vbp.md`). */
  rotationVbpContent: string
  /** HTF volume profile anchored to the current Balance Area (`balance-area.vbp.md`). */
  balanceAreaVbpContent: string
  /** Execution delta profile, ~35-pt / half-rotation anchor (`half-rotation-delta.vbp.md`). */
  halfRotationDeltaContent: string
  /** Execution delta profile, ~75-pt / full-rotation anchor (`full-rotation-delta.vbp.md`). */
  fullRotationDeltaContent: string
  /** Execution-bar CSV export (`execution_bar_data.rolling.csv`). */
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
  /**
   * LVN/HVN nodes per volume profile. The balance-area nodes are structurally
   * MORE significant than rotation nodes (longer-term acceptance). The terrain
   * zone stack stays anchored to the rotation profile's geometry; the magnet
   * set is anchored to the balance-area profile (feat-037).
   */
  lvn: { rotation: LvnDetectionResult; balanceArea: LvnDetectionResult }
  /**
   * Absorption-candidate stacks from the half/full-rotation delta exports.
   * Candidates only — the model must confirm price stalled at each stack on
   * the execution chart before calling absorption.
   */
  absorption: AbsorptionScanResult
  magnetCheck: MagnetCheck
  terrain: TerrainZonesResult
  /** POC/VAH/VAL per volume profile. */
  profileSummary: { rotation: ProfileSummary; balanceArea: ProfileSummary }
  /** Non-fatal degradations (missing rip, terrain issues, ...). */
  warnings: string[]
}

/** Every engine zone border price (deduped, price-descending). */
export function engineZoneBorders(terrain: TerrainZonesResult): number[] {
  const borders = terrain.zones.flatMap((zone) => [zone.top, zone.bottom])
  return [...new Set(borders)].sort((a, b) => b - a)
}

/**
 * Every engine price an entry may legitimately anchor on: zone borders, level
 * verdicts and composite border band members — minus profile data edges, which
 * are data artifacts the doctrine forbids trading (feat-040 G2). Deduped,
 * price-descending. Feeds `ValidateOptions.anchorPrices`.
 */
export function engineAnchorPrices(terrain: TerrainZonesResult): number[] {
  const anchors = [
    ...terrain.zones.flatMap((zone) => [zone.top, zone.bottom]),
    ...terrain.levels.map((verdict) => verdict.level.price),
    ...terrain.borders.flatMap((border) =>
      border.members.map((member) => member.level.price),
    ),
  ].filter((price) => !terrain.dataEdges.includes(price))
  return [...new Set(anchors)].sort((a, b) => b - a)
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

  const rotationVbp = parseVbpProfile(input.rotationVbpContent)
  const balanceAreaVbp = parseVbpProfile(input.balanceAreaVbpContent)
  const halfRotationDelta = parseDeltaProfile(input.halfRotationDeltaContent)
  const fullRotationDelta = parseDeltaProfile(input.fullRotationDeltaContent)

  const bars = parseExecBars(input.execCsvContent)
  const deltaTelemetry = computeDeltaTelemetry(bars)
  const mgi = computeMgiPriority(input.mgi)
  const lvn = {
    rotation: detectLvnHvn(rotationVbp.rows),
    balanceArea: detectLvnHvn(balanceAreaVbp.rows),
  }
  const absorption = scanAbsorption({
    halfRotation: halfRotationDelta.rows,
    fullRotation: fullRotationDelta.rows,
  })
  const staleness = assessStaleness({ receivedAt: input.receivedAt, now: input.now })

  const summaryOf = (meta: {
    pocPrice: number
    valueAreaHigh: number
    valueAreaLow: number
  }): ProfileSummary => ({
    pocPrice: meta.pocPrice,
    valueAreaHigh: meta.valueAreaHigh,
    valueAreaLow: meta.valueAreaLow,
  })
  const profileSummary = {
    rotation: summaryOf(rotationVbp.meta),
    balanceArea: summaryOf(balanceAreaVbp.meta),
  }

  const rip = input.mgi.daily?.rip
  let ripStatus: RipStatus | null = null
  if (typeof rip === 'number' && Number.isFinite(rip)) {
    // Red flip is count-based: the mean is display context only; the flip needs
    // RED_BUILDING_MIN_BARS red-extreme prints clustered in the recent window.
    ripStatus = computeRipStatus({
      currentPrice: mgi.currentPrice,
      rip,
      deltaIntensity: deltaTelemetry.recentMeanDelta,
      redExtremeCount: deltaTelemetry.recentRedExtremeCount,
    })
  } else {
    warnings.push('mgi.daily.rip missing — Rip/Vanguard condition not computed')
  }

  // Magnet set: built ONCE from the BALANCE-AREA profile (feat-037 — the Gem's
  // Magnet Check reads the HTF chart's balance-area VbP) and shared by the
  // magnetCheck fact and terrain border classification, so there is exactly one
  // magnet definition. The terrain zone stack itself stays anchored to the
  // rotation profile's geometry (it must partition one profile's range).
  const magnets = collectMagnets({
    summary: profileSummary.balanceArea,
    hvn: lvn.balanceArea.hvn,
  })
  const magnetCheck = evaluateMagnetCheck({
    magnets,
    levels: mgi.tier1,
  })

  // Campaign extent (gem-comparison F3): the outermost span of BOTH volume profiles is the
  // "visible HTF structure" the campaign envelope must cover; assembleTerrain then anchors the
  // ceiling/floor to the innermost Tier-1 level at-or-beyond each edge.
  const extentOf = (rows: readonly { price: number }[]) => {
    let top = -Infinity
    let bottom = Infinity
    for (const r of rows) {
      if (r.price > top) top = r.price
      if (r.price < bottom) bottom = r.price
    }
    return top >= bottom ? { top, bottom } : null
  }
  const rotationExtent = extentOf(rotationVbp.rows)
  const balanceExtent = extentOf(balanceAreaVbp.rows)
  const campaignExtent =
    rotationExtent && balanceExtent
      ? {
          top: Math.max(rotationExtent.top, balanceExtent.top),
          bottom: Math.min(rotationExtent.bottom, balanceExtent.bottom),
        }
      : (rotationExtent ?? balanceExtent ?? undefined)

  const terrain = assembleTerrain({
    profile: rotationVbp.rows,
    lvn: lvn.rotation,
    // The balance-area profile is the SENIOR classification read (operator doctrine
    // 2026-07-22): a balance-area promotion (AAA) outranks a rotation promotion (A), and it
    // covers anchors beyond the rotation range (e.g. the structural floor when price sits at
    // the session low).
    balanceAreaProfile: balanceAreaVbp.rows,
    balanceAreaLvn: lvn.balanceArea,
    magnets,
    mgi,
    campaignExtent,
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
    absorption,
    magnetCheck,
    terrain,
    profileSummary,
    warnings,
  }
}
