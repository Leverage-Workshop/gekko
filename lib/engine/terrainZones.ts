/**
 * Terrain Zones (feat-016).
 *
 * Assembles the doctrine's **vertical campaign map** — a contiguous Stratosphere→Abyss stack of
 * acceptance/void zones — and classifies the structural borders that partition it. This is the
 * engine's terrain fact for the analyze-task (feat-018); the model reads it for judgment but is
 * never asked to add or move a border (detection is code-owned).
 *
 * Two jobs:
 *
 * 1. MGI-ANCHORED BORDER PROMOTION (the heart). For each MAJOR MGI level we inspect the LOCAL
 *    volume profile around it and classify it (`knowledge/doctrine/chart-reading.md`, "Internal
 *    partitioning", strict priority Trench > Wall > Magnet):
 *      - **Trench** (Valley + MGI): a volume dip flanked by blocks on BOTH sides — the deepest
 *        valley between two distributions. Strongest partition.
 *      - **Wall** (Shelf + MGI): a block dropping off sharply into a void with the MGI at the
 *        shelf edge. Overrides the bell-curve read — an MGI at a block *edge* is a Wall, not a
 *        Magnet — so this is checked BEFORE the Magnet branch.
 *      - **Magnet** (Peak + MGI): the MGI sits in thick, roughly-equal volume with no distinct
 *        dip AND aligns with a magnet (POC/VAH/VAL/HVN via feat-015). This is an INVALIDATION —
 *        a Magnet can be neither a structural border nor a Target 3.
 *      - otherwise the level stays a plain **mgi** coordinate (not promoted to a hard partition).
 *
 *    DUAL-PROFILE CONFLUENCE (operator doctrine 2026-07-22, superseding feat-040 G1): every
 *    anchor classifies against BOTH profiles. The BALANCE-AREA profile is the SENIOR read —
 *    fewer levels resolve on it (more volume has transacted, so it is often a blob), but the
 *    ones that do are the most important structure on the map ("AAA" vs the rotation
 *    profile's "A", like PM-H vs PW-H). The senior profile decides when it is decisive (a
 *    hard promotion or a Magnet invalidation); the rotation profile fills in otherwise, so
 *    rotation-only structure still counts. A bare MGI coordinate with NO volume confluence on
 *    either profile is NEVER a zone border — MGI in the middle of a void is a waypoint (it
 *    stays in `levels` for target rungs), not a partition. The feat-040 "void-splitter"
 *    borders are retired: they flooded the stack with micro-zones (16 zones on the
 *    2026-07-20 trace, 10 of them bare-MGI slices of one traversal). A border minted at a
 *    bare data edge of the COMBINED profile coverage is tagged in `dataEdges` (a data
 *    artifact the model must not trade) — and is only minted when no real structure
 *    partitions the extension.
 *
 *    This is THE HOME FOR HARD-LEDGE DETECTION. The standalone LVN detector (feat-014/035)
 *    deliberately does NOT chase tall/shallow ledges — a whole-profile ledge scan is inseparable
 *    from ordinary distribution flanks by any threshold (investigated + rejected in feat-035, net
 *    negative). Anchoring the local shelf/valley test on the FEW major MGI prices avoids that
 *    false-positive explosion, so the test here deliberately FAVORS RECALL: the MGI cross-
 *    reference can only PRUNE a spurious border, never CREATE a missing one, and a missed
 *    shelf-at-MGI is unrecoverable downstream (the LLM cannot add node prices) while an extra
 *    flagged shelf is cheap (it is dropped unless it sits on an MGI). The magnet set and the
 *    "is this price a Magnet" question are SINGLE-SOURCED from feat-015 magnetCheck.
 *
 * 2. ZONE ASSEMBLY with the No-Gap invariant. The hard partitions (Trenches + Walls) plus the
 *    campaign extremes divide the range into contiguous zones where each zone's bottom equals the
 *    next zone's top (Price[N] === Price2[N+1]). Hard partitions within `mergeTolerancePts` of
 *    each other first MERGE into one COMPOSITE border (the Gem treats level clusters like
 *    PDH / OR Mid / Rip / Monthly VWAP as a single border band — gem-comparison F1; clustering
 *    makes the band MORE significant, so member count feeds the ranking), so the stack never
 *    carries sliver zones a few points wide. Merged borders then CONSOLIDATE by significance
 *    class (operator doctrine 2026-07-22 — the terrain maps the ~5-6 zones where MAJOR moves
 *    start and end, not every micro rotation): an A-class (rotation-promoted) border within
 *    `aTierMinSpanPts` of a stronger border is demoted to a plain level (kept in `demoted` for
 *    transparency); AAA-class (balance-area-promoted) borders are exempt from the span floor —
 *    they only ever merge within `mergeTolerancePts`. The campaign ceiling (Stratosphere top)
 *    and floor (Abyss bottom) anchor to the INNERMOST Tier-1 HTF level at-or-beyond each edge of
 *    the HTF reference extent (`campaignExtent`, production: the outermost span of the rotation +
 *    balance-area profiles) — the smallest Tier-1 envelope that still covers the visible HTF
 *    structure. This is the doctrine's "highest/lowest RELEVANT HTF structure"; anchoring to the
 *    outermost Tier-1 level (the pre-F3 behavior) inflated the map ~2.3x with off-profile void
 *    (gem-comparison F3). A zone extending beyond the profile has no volume data and classifies
 *    as void. Every zone is classified by volume (acceptance/HVN vs void/rejection — zone mean
 *    against the PROFILE MEAN, gem-comparison F4) and given a vertical-map position relative to
 *    the current price (Stratosphere/Attic/Kill Box/Elevator Shaft/Foundation/Abyss). Order-flow
 *    character is NOT read here: the delta exports live on their own bin grid, so absorption is
 *    detected separately (lib/engine/absorption.ts) and confirmed by the model against price
 *    behavior on the execution chart.
 *
 * NOTE ON TUNING: unlike the LVN detector there is no labeled MGI-terrain fixture set, so the
 * local-profile thresholds are doctrine heuristics (recall-favoring), not eval-fitted numbers.
 * They are all in {@link DEFAULT_TERRAIN_PARAMS} and overridable per call.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a Briefing output —
 * no Zod), mirroring the other lib/engine modules. `BorderKind` intentionally matches the
 * Briefing schema's `LevelKind` ('trench' | 'wall' | 'magnet' | 'mgi').
 */

import type { LvnDetectionResult } from './lvnDetection'
import type { MgiLevel, MgiPriority } from './mgiPriority'
import { classifyMagnet, DEFAULT_MAGNET_TOLERANCE, type Magnet, type MagnetHit } from './magnetCheck'

/** VbP row (feat-002 parseVbpProfile rows structurally satisfy this). */
export type TerrainProfileRow = { price: number; volume: number }

/** Border classification — matches the Briefing schema `LevelKind`. */
export type BorderKind = 'trench' | 'wall' | 'magnet' | 'mgi'

export type ZonePosition =
  | 'stratosphere'
  | 'attic'
  | 'killbox'
  | 'foundation'
  | 'elevator-shaft'
  | 'abyss'
  | 'zone'

export type ZoneVolumeClass = 'acceptance' | 'void'

/** Local volume shape around an anchor, all ratios normalised to the local peak. */
export type LocalProfile = {
  centerVol: number
  leftMax: number
  rightMax: number
  localPeak: number
  centerRatio: number
  leftRatio: number
  rightRatio: number
}

/** A detector LVN/HVN node corroborating an anchor (feat-014). */
export type DetectorNodeRef = {
  kind: 'valley' | 'taper-edge' | 'hvn'
  price: number
  distance: number
}

/** Verdict for one MGI anchor: its promoted border kind and the evidence behind it. */
export type BorderVerdict = {
  level: MgiLevel
  kind: BorderKind
  /** true for Trench/Wall — a structural hard partition that divides the zone stack. */
  hard: boolean
  /**
   * Which profile supplied the local volume read: the anchoring rotation profile, the
   * balance-area fallback (feat-040 — anchors beyond the rotation range, e.g. the structural
   * floor when price sits at the session low), or null when neither covers the anchor.
   */
  source: 'rotation' | 'balance-area' | null
  /** Local volume shape, or null when the anchor is outside the profile range. */
  local: LocalProfile | null
  /** Nearest magnet (feat-015), for the Magnet branch and transparency. */
  magnet: MagnetHit | null
  /** Nearest detector LVN/HVN node within tolerance, or null. */
  detectorNode: DetectorNodeRef | null
  reason: string
}

export type TerrainZoneFact = {
  top: number
  bottom: number
  position: ZonePosition
  volumeClass: ZoneVolumeClass
  meanVolume: number
  label: string
}

/**
 * Border significance class (operator doctrine 2026-07-22): AAA = promoted on the balance-area
 * profile (the senior, long-term read — fewer levels resolve there, but the ones that do are
 * the most important on the map); A = promoted on the rotation profile only.
 */
export type BorderSignificance = 'AAA' | 'A'

/**
 * A merged zone divider: one or more hard partitions within `mergeTolerancePts` collapsed into
 * a single composite border (gem-comparison F1). `price` is the representative member's price
 * (the deepest local dip); `label` names every member, e.g. "Rip / Monthly VWAP". Clustered
 * MGI raise the band's significance — member count feeds the consolidation ranking.
 */
export type CompositeBorder = {
  price: number
  /** Trench wins over Wall when a cluster mixes kinds (doctrine priority). */
  kind: 'trench' | 'wall'
  label: string
  /** AAA when any member promoted on the balance-area profile. */
  significance: BorderSignificance
  /** Best (lowest) MGI tier among members. */
  tier: number
  members: BorderVerdict[]
}

/** A border demoted during class-aware consolidation — still structure, no longer a zone divider. */
export type DemotedBorder = {
  price: number
  kind: 'trench' | 'wall'
  label: string
  significance: BorderSignificance
  /** Which stronger border absorbed it, and at what distance. */
  reason: string
}

export type TerrainZonesResult = {
  currentPrice: number
  /** Contiguous zone stack, top zone first (price-descending). */
  zones: TerrainZoneFact[]
  /** Every anchor classified, price-descending. Maps onto Briefing terrain.levels. */
  levels: BorderVerdict[]
  /** Hard partitions only (Trench/Wall), pre-merge — the raw promotion verdicts. */
  partitions: BorderVerdict[]
  /** Merged + consolidated hard partitions actually used as zone dividers (composite borders). */
  borders: CompositeBorder[]
  /**
   * Borders demoted by class-aware consolidation (within `aTierMinSpanPts` of a stronger
   * border). Real structure, valid as levels — just not zone dividers.
   */
  demoted: DemotedBorder[]
  /** The magnet set (single-sourced from feat-015), for the model + transparency. */
  magnets: Magnet[]
  /**
   * Zone borders that are PROFILE DATA EDGES (feat-040, G2): the anchoring profile's first/last
   * bin, inserted only to bookkeep the transition into an unsplit extension void. A data edge is
   * a data-availability artifact, NOT market structure — the analyze prompt forbids anchoring
   * entries/stops/targets on these prices. Empty when real structure splits the extension.
   */
  dataEdges: number[]
  /** No-Gap invariant held on assembly. */
  contiguityValid: boolean
  issues: string[]
}

export type TerrainParams = {
  /** Half-width (NQ points) of the center band sampled around an anchor. */
  centerHalfPts: number
  /** How far out (NQ points) to scan each flank for its dominant block. */
  flankWindowPts: number
  /** A flank/center counts as a "block" at >= this fraction of the local peak. */
  blockFrac: number
  /** A flank counts as a "void" at <= this fraction of the local peak. */
  voidFrac: number
  /** The center counts as a "dip" at <= this fraction of the local peak. */
  valleyFrac: number
  /** A zone is "acceptance" when its mean volume is >= this fraction of the PROFILE MEAN volume (F4). */
  acceptanceFrac: number
  /**
   * Proximity (NQ points) serving double duty: magnet alignment (against the
   * balance-area magnet set) and detector-node corroboration (rotation nodes).
   */
  magnetTolerance: number
  /**
   * Hard partitions within this distance (NQ points) merge into ONE composite border, and
   * profile-edge/extreme borders within it of a partition are deduped (F1). The Gem composes
   * clusters this wide (Weekly VWAP 29624.62 / 24h VWAP 29640.52 read as one border band).
   */
  mergeTolerancePts: number
  /**
   * Trench/Wall promotion additionally requires the flanking block(s) to reach this fraction
   * of the profile mean volume (F5) — kills "structure" found in a profile's thin tails, where
   * the normalised ratios are pure noise, without touching real distribution edges.
   */
  promoteMinVolFrac: number
  /**
   * Minimum spacing (NQ points) between zone borders when at least one of a pair is A-class
   * (rotation-promoted). The weaker border of a closer pair demotes to a plain level — the
   * terrain maps the zones where MAJOR moves start and end, not every micro rotation. AAA
   * pairs are exempt (balance-area structure is kept even when tight).
   */
  aTierMinSpanPts: number
}

/**
 * Recall-favoring doctrine heuristics (no MGI-terrain eval fixtures exist — see the module
 * header). `blockFrac`/`voidFrac` leave a small ambiguity band so a flank must be clearly a
 * block or clearly a void to force a promotion; `valleyFrac` fires a Trench on a modest dip.
 * `acceptanceFrac`/`mergeTolerancePts`/`promoteMinVolFrac` were sanity-checked against the
 * 2026-07-14 comparison bundle (docs/gem-comparison-2026-07-14.md).
 */
export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  centerHalfPts: 5,
  flankWindowPts: 40,
  blockFrac: 0.55,
  voidFrac: 0.5,
  valleyFrac: 0.6,
  acceptanceFrac: 0.75,
  magnetTolerance: DEFAULT_MAGNET_TOLERANCE,
  mergeTolerancePts: 16,
  promoteMinVolFrac: 0.5,
  aTierMinSpanPts: 60,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Major MGI anchors: Tier-1 campaign borders plus the intraday session structure (the whole
 * `daily` group — Rip, PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low, 24h VWAP). The Gem's working
 * partitions and target rungs live on the session levels (Kill Box = IBL→IBH, T1 = OR Low,
 * T3 = IB Low); anchoring Tier-1 only erased them from the terrain entirely (gem-comparison
 * F2). Promotion still requires local volume geometry, so a noise level stays a plain `mgi`
 * coordinate. ATR projections stay excluded (volatility context, not structure — audit A9).
 */
export function selectAnchorLevels(mgi: MgiPriority): MgiLevel[] {
  const chosen = mgi.levels.filter(l => l.tier === 1 || l.group === 'daily' || l.code === 'rip')
  const seen = new Set<number>()
  const unique: MgiLevel[] = []
  for (const l of chosen.sort((a, b) => b.price - a.price)) {
    if (!seen.has(l.price)) {
      seen.add(l.price)
      unique.push(l)
    }
  }
  return unique
}

type SliceStats = {
  mean: number
  max: number
  count: number
}

/** Volume stats over bins whose price is within [loPrice, hiPrice] (inclusive). */
function sliceStats(rowsAsc: TerrainProfileRow[], loPrice: number, hiPrice: number): SliceStats {
  let sum = 0
  let max = 0
  let count = 0
  for (const r of rowsAsc) {
    if (r.price < loPrice || r.price > hiPrice) continue
    count++
    sum += r.volume
    if (r.volume > max) max = r.volume
  }
  return { mean: count > 0 ? sum / count : 0, max, count }
}

/** Sample the local volume shape around an anchor price, or null if there is nothing to read. */
function localProfileAt(
  rowsAsc: TerrainProfileRow[],
  m: number,
  params: TerrainParams,
): LocalProfile | null {
  if (rowsAsc.length === 0) return null
  const minP = rowsAsc[0].price
  const maxP = rowsAsc[rowsAsc.length - 1].price
  if (m < minP || m > maxP) return null

  const ch = params.centerHalfPts
  const w = params.flankWindowPts
  const center = sliceStats(rowsAsc, m - ch, m + ch)
  const left = sliceStats(rowsAsc, m - w, m - ch - 0.0001) // below the anchor
  const right = sliceStats(rowsAsc, m + ch + 0.0001, m + w) // above the anchor

  const centerVol = center.mean
  const leftMax = left.max
  const rightMax = right.max
  const localPeak = Math.max(centerVol, leftMax, rightMax)
  if (localPeak <= 0) return null

  return {
    centerVol: round2(centerVol),
    leftMax: round2(leftMax),
    rightMax: round2(rightMax),
    localPeak: round2(localPeak),
    centerRatio: round2(centerVol / localPeak),
    leftRatio: round2(leftMax / localPeak),
    rightRatio: round2(rightMax / localPeak),
  }
}

/** Nearest detector LVN/HVN node to `price` within `tolerance`, or null. */
function nearestDetectorNode(
  price: number,
  lvn: LvnDetectionResult,
  tolerance: number,
): DetectorNodeRef | null {
  const candidates: DetectorNodeRef[] = [
    ...lvn.lvn.map(n => ({ kind: n.type, price: n.price, distance: Math.abs(n.price - price) })),
    ...lvn.hvn.map(n => ({ kind: 'hvn' as const, price: n.price, distance: Math.abs(n.price - price) })),
  ].filter(n => n.distance <= tolerance)
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (b.distance < a.distance ? b : a))
  return { ...best, distance: round2(best.distance) }
}

/** One profile's rows + stats, as a classification context (feat-040 fallback support). */
type ProfileContext = {
  rowsAsc: TerrainProfileRow[]
  meanVol: number
  lvn: LvnDetectionResult
  source: 'rotation' | 'balance-area'
}

/** One profile's classification of an anchor, before cross-profile arbitration. */
type ProfileRead = {
  kind: BorderKind
  hard: boolean
  reason: string
  local: LocalProfile
}

/**
 * Classify one anchor against ONE profile's local volume geometry (recall-favoring),
 * single-sourcing the Magnet question from feat-015. Priority: Trench > Wall > Magnet >
 * plain mgi. Trench/Wall additionally require the flanking block(s) to clear
 * `promoteMinVolFrac` of that profile's mean volume (F5) — normalised ratios in a profile's
 * thin tail look like structure but aren't. Null when the anchor is outside the profile.
 */
function readProfile(
  level: MgiLevel,
  ctx: ProfileContext,
  magnet: ReturnType<typeof classifyMagnet>,
  params: TerrainParams,
): ProfileRead | null {
  const local = localProfileAt(ctx.rowsAsc, level.price, params)
  if (!local) return null

  const { leftRatio: L, rightRatio: R, centerRatio: C } = local
  const leftBlock = L >= params.blockFrac
  const rightBlock = R >= params.blockFrac
  const leftVoid = L <= params.voidFrac
  const rightVoid = R <= params.voidFrac
  const centerDip = C <= params.valleyFrac
  const centerBlock = C >= params.blockFrac
  // F5: the absolute-volume floor a flanking "block" must clear to promote.
  const promoteFloor = params.promoteMinVolFrac * ctx.meanVol
  const tooThin = (blockVol: number): ProfileRead => ({
    kind: 'mgi',
    hard: false,
    local,
    reason: `structure-shaped but too thin to promote (block ${blockVol} < floor ${round2(promoteFloor)})`,
  })

  // 1. Trench — a dip flanked by blocks on both sides (Valley + MGI).
  if (centerDip && leftBlock && rightBlock) {
    const thinner = Math.min(local.leftMax, local.rightMax)
    if (thinner < promoteFloor) return tooThin(thinner)
    return {
      kind: 'trench',
      hard: true,
      local,
      reason: `valley (center ${C} of local peak) between blocks (L ${L}, R ${R})`,
    }
  }

  // 2. Wall — a block on one side dropping into a void on the other, MGI at the edge (Shelf +
  //    MGI). Checked before Magnet: an MGI at a block EDGE is a Wall, not a Magnet.
  if (!centerBlock && leftBlock && rightVoid) {
    if (local.leftMax < promoteFloor) return tooThin(local.leftMax)
    return { kind: 'wall', hard: true, local, reason: `block below (L ${L}) drops into void above (R ${R})` }
  }
  if (!centerBlock && rightBlock && leftVoid) {
    if (local.rightMax < promoteFloor) return tooThin(local.rightMax)
    return { kind: 'wall', hard: true, local, reason: `block above (R ${R}) drops into void below (L ${L})` }
  }

  // 3. Magnet — thick, roughly-equal volume with no dip AND aligned with a POC/VAH/VAL/HVN.
  //    An invalidation: not a structural border. (Single-sourced from feat-015.)
  if (centerBlock && leftBlock && rightBlock && magnet.isMagnet) {
    const near = magnet.nearest
    return {
      kind: 'magnet',
      hard: false,
      local,
      reason: `thick both sides, no dip; on ${near?.magnet.label} (${near?.distance} pts) — invalidation`,
    }
  }

  // 4. Plain coordinate — no volume-structure promotion.
  return { kind: 'mgi', hard: false, local, reason: 'no local block/void structure to promote' }
}

/**
 * Classify one MGI anchor against BOTH profiles (operator doctrine 2026-07-22). The
 * balance-area profile is the SENIOR read: it decides whenever it is decisive — a hard
 * promotion (AAA structure) or a Magnet invalidation (never border the long-term center of
 * gravity). The rotation profile fills in otherwise, so rotation-only structure still
 * promotes (A class); plain-mgi outcomes prefer the rotation read's reason when both are
 * indecisive (it is the anchoring profile).
 */
function classifyBorder(
  level: MgiLevel,
  rotation: ProfileContext,
  balanceArea: ProfileContext | null,
  magnets: Magnet[],
  params: TerrainParams,
): BorderVerdict {
  const magnet = classifyMagnet(level.price, magnets, params.magnetTolerance)
  const balanceRead = balanceArea ? readProfile(level, balanceArea, magnet, params) : null
  const rotationRead = readProfile(level, rotation, magnet, params)

  const decisive = (read: ProfileRead | null): boolean =>
    read !== null && (read.hard || read.kind === 'magnet')
  const pick = decisive(balanceRead)
    ? { read: balanceRead!, ctx: balanceArea! }
    : decisive(rotationRead)
      ? { read: rotationRead!, ctx: rotation }
      : rotationRead
        ? { read: rotationRead, ctx: rotation }
        : balanceRead
          ? { read: balanceRead, ctx: balanceArea! }
          : null

  if (!pick) {
    return {
      level,
      kind: 'mgi',
      hard: false,
      source: null,
      local: null,
      magnet: magnet.nearest,
      detectorNode: null,
      reason: 'anchor outside the volume profile range',
    }
  }

  const via = pick.ctx.source === 'balance-area' ? ' [balance-area]' : ''
  return {
    level,
    kind: pick.read.kind,
    hard: pick.read.hard,
    source: pick.ctx.source,
    local: pick.read.local,
    magnet: magnet.nearest,
    detectorNode: nearestDetectorNode(level.price, pick.ctx.lvn, params.magnetTolerance),
    reason: pick.read.reason + via,
  }
}

/**
 * Chain-merge hard partitions within `tolerance` of each other into composite borders (F1).
 * Input must be price-descending. The representative price is the member with the deepest
 * local dip (lowest centerRatio) — the actual valley of the cluster; the label names every
 * member. Adjacent composites stay > tolerance apart by construction (chain clustering).
 */
function mergePartitions(partitions: BorderVerdict[], tolerance: number): CompositeBorder[] {
  const clusters: BorderVerdict[][] = []
  for (const p of partitions) {
    const last = clusters[clusters.length - 1]
    if (last && last[last.length - 1].level.price - p.level.price <= tolerance) {
      last.push(p)
    } else {
      clusters.push([p])
    }
  }
  return clusters.map(members => {
    const rep = members.reduce((a, b) =>
      (b.local?.centerRatio ?? Infinity) < (a.local?.centerRatio ?? Infinity) ? b : a,
    )
    const kind = members.some(m => m.kind === 'trench') ? ('trench' as const) : ('wall' as const)
    return {
      price: rep.level.price,
      kind,
      label: [...new Set(members.map(m => m.level.label))].join(' / '),
      significance: members.some(m => m.source === 'balance-area')
        ? ('AAA' as const)
        : ('A' as const),
      tier: Math.min(...members.map(m => m.level.tier)),
      members,
    }
  })
}

/**
 * Strength ordering for consolidation (lower rank wins): significance class (AAA before A),
 * MGI tier, composite member count (clustering = significance), kind (Trench before Wall),
 * then the deepest local dip.
 */
function borderRank(border: CompositeBorder): number[] {
  return [
    border.significance === 'AAA' ? 0 : 1,
    border.tier,
    -border.members.length,
    border.kind === 'trench' ? 0 : 1,
    Math.min(...border.members.map(m => m.local?.centerRatio ?? 1)),
  ]
}

/** The weaker of two borders by {@link borderRank}; full ties demote the lower price (stable). */
function weakerOf(a: CompositeBorder, b: CompositeBorder): CompositeBorder {
  const ra = borderRank(a)
  const rb = borderRank(b)
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b
  }
  return a.price < b.price ? a : b
}

/**
 * Class-aware spacing consolidation (operator doctrine 2026-07-22): the terrain maps the
 * handful of zones where MAJOR moves start and end. Any pair of zone dividers closer than
 * `aTierMinSpanPts` where at least one is A-class loses its weaker member — demoted to a
 * plain level (still structure, never deleted from `levels`). An AAA border always survives
 * against an A border; AAA pairs are exempt (balance-area structure is kept even when tight —
 * it only merges within `mergeTolerancePts`). Input must be price-descending.
 */
function consolidateBorders(
  merged: CompositeBorder[],
  params: TerrainParams,
): { kept: CompositeBorder[]; demoted: DemotedBorder[] } {
  const kept = [...merged]
  const demoted: DemotedBorder[] = []
  for (;;) {
    let out: CompositeBorder | null = null
    let survivor: CompositeBorder | null = null
    for (let i = 0; i + 1 < kept.length; i++) {
      const hi = kept[i]
      const lo = kept[i + 1]
      if (hi.price - lo.price >= params.aTierMinSpanPts) continue
      if (hi.significance === 'AAA' && lo.significance === 'AAA') continue
      out =
        hi.significance === 'AAA' ? lo : lo.significance === 'AAA' ? hi : weakerOf(hi, lo)
      survivor = out === hi ? lo : hi
      break
    }
    if (out === null || survivor === null) break
    kept.splice(kept.indexOf(out), 1)
    demoted.push({
      price: out.price,
      kind: out.kind,
      label: out.label,
      significance: out.significance,
      reason: `within ${round2(Math.abs(out.price - survivor.price))} pts of the stronger ${survivor.label} border at ${survivor.price}`,
    })
  }
  return { kept, demoted: demoted.sort((a, b) => b.price - a.price) }
}

/**
 * Assign each zone a vertical-map position relative to the current price. The zone containing
 * the price is the Kill Box; the top zone is the Stratosphere and the bottom the Abyss; the
 * zone just above the Kill Box is the Attic and the one just below is the Foundation — either
 * becomes an Elevator Shaft when it is a void (doctrine: a steep void immediately below support
 * OR above resistance). Extremes win over Attic/Foundation when they coincide.
 */
function positionZones(
  zones: Omit<TerrainZoneFact, 'position' | 'label'>[],
  currentPrice: number,
): ZonePosition[] {
  const n = zones.length
  let k = zones.findIndex(z => currentPrice <= z.top && currentPrice >= z.bottom)
  if (k === -1) k = currentPrice > zones[0].top ? 0 : n - 1 // above the stack → top; below → bottom

  return zones.map((z, i) => {
    if (i === k) return 'killbox'
    if (i === 0) return 'stratosphere'
    if (i === n - 1) return 'abyss'
    if (i === k - 1) return z.volumeClass === 'void' ? 'elevator-shaft' : 'attic'
    if (i === k + 1) return z.volumeClass === 'void' ? 'elevator-shaft' : 'foundation'
    return 'zone'
  })
}

function positionLabel(position: ZonePosition): string {
  switch (position) {
    case 'stratosphere':
      return 'Stratosphere'
    case 'attic':
      return 'Attic'
    case 'killbox':
      return 'Kill Box'
    case 'foundation':
      return 'Foundation'
    case 'elevator-shaft':
      return 'Elevator Shaft'
    case 'abyss':
      return 'Abyss'
    default:
      return 'Zone'
  }
}

/**
 * Build the contiguous zone stack from the campaign extremes + merged-border prices, classify
 * each zone, and assign vertical positions. Borders are shared values, so the No-Gap invariant
 * (zone[N].bottom === zone[N+1].top) holds by construction.
 *
 * When the campaign reaches beyond the COMBINED profile coverage (rotation + balance-area),
 * the coverage edge itself becomes a border and the extension zone carries no volume data —
 * it classifies as void. Sliver-zone guards (F1): a border within `mergeTolerancePts` of a
 * campaign extreme is dropped, the coverage edge is NOT added when a partition already marks
 * that shelf or when it would form a sliver against the extreme, and (G2) when real structure
 * already partitions the extension beyond an edge, the edge itself is NOT added — the nearest
 * real border absorbs the transition. An edge that IS added is reported as a data edge so the
 * prompt can forbid trading it. Zone slices beyond the rotation profile's coverage classify
 * against the balance-area profile (vs its own mean) — the long-term read is real volume
 * data, not automatically "void".
 */
function assembleZones(
  rowsAsc: TerrainProfileRow[],
  balanceRowsAsc: TerrainProfileRow[],
  borderPrices: number[],
  currentPrice: number,
  params: TerrainParams,
  campaign?: { top: number; bottom: number },
): { zones: TerrainZoneFact[]; dataEdges: number[] } {
  const minP = rowsAsc[0].price
  const maxP = rowsAsc[rowsAsc.length - 1].price
  // The COMBINED data coverage: where either profile still has volume data.
  const dataMax =
    balanceRowsAsc.length > 0 ? Math.max(maxP, balanceRowsAsc[balanceRowsAsc.length - 1].price) : maxP
  const dataMin = balanceRowsAsc.length > 0 ? Math.min(minP, balanceRowsAsc[0].price) : minP
  const top = Math.max(dataMax, campaign?.top ?? dataMax)
  const bottom = Math.min(dataMin, campaign?.bottom ?? dataMin)
  // F4: acceptance is judged against the profile MEAN (a robust whole-profile baseline), not
  // the single peak bin — mean-vs-peak marked even the value area void on real exports.
  const profileMean = rowsAsc.reduce((sum, r) => sum + r.volume, 0) / rowsAsc.length
  const balanceMean =
    balanceRowsAsc.length > 0
      ? balanceRowsAsc.reduce((sum, r) => sum + r.volume, 0) / balanceRowsAsc.length
      : 0

  const tol = params.mergeTolerancePts
  // Interior borders only (extremes are the campaign ceiling/floor), kept clear of the
  // extremes so no sliver zone forms against them.
  const interior = borderPrices.filter(p => p - bottom > tol && top - p > tol)
  // The combined-coverage edges join the border set when the campaign extends beyond them —
  // unless a border already partitions the extension on that side (G2), marks the same shelf
  // within tolerance, or the edge would form a sliver against the campaign extreme itself.
  // An added edge is a DATA EDGE, not structure.
  const dataEdges: number[] = []
  if (
    top > dataMax &&
    top - dataMax > tol &&
    !interior.some(p => p > dataMax) &&
    !interior.some(p => Math.abs(p - dataMax) <= tol)
  ) {
    interior.push(dataMax)
    dataEdges.push(dataMax)
  }
  if (
    bottom < dataMin &&
    dataMin - bottom > tol &&
    !interior.some(p => p < dataMin) &&
    !interior.some(p => Math.abs(p - dataMin) <= tol)
  ) {
    interior.push(dataMin)
    dataEdges.push(dataMin)
  }
  const borders = [top, ...new Set(interior), bottom].sort((a, b) => b - a)

  const bare = borders.slice(0, -1).map((top, i) => {
    const bottom = borders[i + 1]
    let stats = sliceStats(rowsAsc, bottom, top)
    let baseline = profileMean
    // No rotation coverage in this slice → read the balance-area profile against ITS mean.
    if (stats.count === 0 && balanceRowsAsc.length > 0) {
      stats = sliceStats(balanceRowsAsc, bottom, top)
      baseline = balanceMean
    }
    const volumeClass: ZoneVolumeClass =
      baseline > 0 && stats.mean >= params.acceptanceFrac * baseline ? 'acceptance' : 'void'
    return {
      top: round2(top),
      bottom: round2(bottom),
      volumeClass,
      meanVolume: round2(stats.mean),
    }
  })

  const positions = positionZones(bare, currentPrice)
  const zones = bare.map((z, i) => ({
    ...z,
    position: positions[i],
    label: `${positionLabel(positions[i])} (${z.volumeClass})`,
  }))
  return { zones, dataEdges }
}

/** Verify the No-Gap invariant and basic ordering; returns human-readable issues (empty = ok). */
function validateContiguity(zones: TerrainZoneFact[]): string[] {
  const issues: string[] = []
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].top <= zones[i].bottom) {
      issues.push(`zone ${i} has top ${zones[i].top} <= bottom ${zones[i].bottom}`)
    }
    if (i > 0 && zones[i - 1].bottom !== zones[i].top) {
      issues.push(`gap between zone ${i - 1} (bottom ${zones[i - 1].bottom}) and zone ${i} (top ${zones[i].top})`)
    }
  }
  return issues
}

/**
 * Assemble the terrain: classify every major MGI anchor, promote Trench/Wall hard partitions,
 * merge partition clusters into composite borders, and build the contiguous, classified
 * Stratosphere→Abyss zone stack.
 *
 * @param input.profile  VbP rows (feat-002; the 400-pt rotation profile in production).
 * @param input.lvn      Detected LVN/HVN nodes (feat-014).
 * @param input.balanceAreaProfile  Balance-area VbP rows — the SENIOR classification read
 *   (operator doctrine 2026-07-22): every anchor classifies against both profiles, and a
 *   balance-area promotion (AAA) outranks a rotation promotion (A). Also covers anchors
 *   beyond the rotation range (the structural floor below the session low has no rotation
 *   data by construction). Optional; omitting it restores rotation-only classification.
 * @param input.balanceAreaLvn  Balance-area LVN/HVN nodes, corroborating balance-area
 *   classified anchors. Optional.
 * @param input.magnets  Prebuilt magnet set (feat-015 collectMagnets; built once in
 *   engineFacts from the balance-area profile in production — feat-037).
 * @param input.mgi      Classified MGI levels + current price (feat-012).
 * @param input.campaignExtent  HTF reference extent for the campaign envelope (production: the
 *   outermost span of the rotation + balance-area profiles). The ceiling/floor anchor to the
 *   INNERMOST Tier-1 level at-or-beyond each extent edge — the smallest Tier-1 envelope still
 *   covering the visible HTF structure (doctrine's "highest/lowest RELEVANT HTF structure",
 *   gem-comparison F3). Defaults to the anchoring profile's own extent.
 * @param input.params   Optional overrides for the doctrine heuristics.
 */
export function assembleTerrain(input: {
  profile: TerrainProfileRow[]
  lvn: LvnDetectionResult
  balanceAreaProfile?: TerrainProfileRow[]
  balanceAreaLvn?: LvnDetectionResult
  magnets: Magnet[]
  mgi: MgiPriority
  campaignExtent?: { top: number; bottom: number }
  params?: Partial<TerrainParams>
}): TerrainZonesResult {
  const params = { ...DEFAULT_TERRAIN_PARAMS, ...input.params }
  const currentPrice = input.mgi.currentPrice
  const { magnets } = input

  const cleanRows = (rows: TerrainProfileRow[]) =>
    rows.filter(r => isFiniteNumber(r.price) && isFiniteNumber(r.volume)).sort((a, b) => a.price - b.price)
  const meanVolOf = (rows: TerrainProfileRow[]) =>
    rows.length > 0 ? rows.reduce((sum, r) => sum + r.volume, 0) / rows.length : 0

  const rowsAsc = cleanRows(input.profile)
  const rotationCtx: ProfileContext = {
    rowsAsc,
    meanVol: meanVolOf(rowsAsc),
    lvn: input.lvn,
    source: 'rotation',
  }
  const balanceRows = input.balanceAreaProfile ? cleanRows(input.balanceAreaProfile) : []
  const balanceCtx: ProfileContext | null =
    balanceRows.length > 0
      ? {
          rowsAsc: balanceRows,
          meanVol: meanVolOf(balanceRows),
          lvn: input.balanceAreaLvn ?? { hvn: [], lvn: [], peakVolume: 0 },
          source: 'balance-area',
        }
      : null

  const anchors = selectAnchorLevels(input.mgi)
  const levels = anchors
    .map(level => classifyBorder(level, rotationCtx, balanceCtx, magnets, params))
    .sort((a, b) => b.level.price - a.level.price)
  const partitions = levels.filter(v => v.hard)
  const merged = mergePartitions(partitions, params.mergeTolerancePts)
  const { kept: borders, demoted } = consolidateBorders(merged, params)

  // Campaign extremes (F3, superseding audit A8's outermost rule): the Stratosphere ceiling /
  // Abyss floor anchor to the INNERMOST Tier-1 level at-or-beyond each edge of the HTF
  // reference extent. Non-positive prices are unset placeholders in the export (e.g. ONH/ONL
  // as 0.00) and never anchor.
  const tier1Prices = input.mgi.tier1
    .map(l => l.price)
    .filter(p => isFiniteNumber(p) && p > 0)
  let campaign: { top: number; bottom: number } | undefined
  if (rowsAsc.length >= 2) {
    const extentTop = Math.max(rowsAsc[rowsAsc.length - 1].price, input.campaignExtent?.top ?? -Infinity)
    const extentBottom = Math.min(rowsAsc[0].price, input.campaignExtent?.bottom ?? Infinity)
    const above = tier1Prices.filter(p => p >= extentTop)
    const below = tier1Prices.filter(p => p <= extentBottom)
    campaign = {
      top: above.length > 0 ? Math.min(...above) : extentTop,
      bottom: below.length > 0 ? Math.max(...below) : extentBottom,
    }
  }

  // Bare MGI coordinates are NEVER zone borders (operator doctrine 2026-07-22): an MGI in the
  // middle of a void is a waypoint for target rungs, not a partition. They remain in `levels`.

  // Need at least a 2-point profile to form a zone; otherwise return borders only.
  const assembled =
    rowsAsc.length >= 2
      ? assembleZones(rowsAsc, balanceRows, borders.map(b => b.price), currentPrice, params, campaign)
      : { zones: [], dataEdges: [] }
  const issues = validateContiguity(assembled.zones)

  return {
    currentPrice,
    zones: assembled.zones,
    levels,
    partitions,
    borders,
    demoted,
    magnets,
    dataEdges: assembled.dataEdges,
    contiguityValid: issues.length === 0,
    issues,
  }
}
