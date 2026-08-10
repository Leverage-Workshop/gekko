/**
 * MGI (Macro Geography Intelligence) priority engine.
 *
 * Classifies the static MGI levels from `mgi_static_levels.json` into the doctrine's
 * Tier 1/2/3 structural hierarchy, produces the Daily MGI Priority Order sort, and
 * computes the nearest Tier-1 campaign border above/below the current price.
 *
 * Tiering is the `tactical-companion-playbook.md` `<mgi_reference>` "Structural Hierarchy
 * Rule" (the source of truth; the glossary doc only names levels):
 *   - Tier 1 (Campaign Borders): HTF MGI — Weekly/Monthly levels (including the Weekly Job
 *     Pivot, feat-111), VRange extremes, ONH/ONL.
 *     These are the true Acceptance Borders that dictate Primary/Secondary objectives,
 *     targets, and hard invalidations. Doctrine's Tier-1 list does NOT include ATR: the
 *     ATR projected high/low are volatility context, classified Tier 2 (gem-alignment
 *     audit finding A9 — they are not campaign borders or partition anchors).
 *
 *     WHAT THE VRANGE LEVELS ACTUALLY ARE (operator 2026-08-10, from the Sierra study's own
 *     definition — the Implied Vol Ranges study, not a range-width construct). Every level is
 *     the session OPEN plus or minus a multiple of `D`, the expected session move implied by
 *     VIX. Verified against two archived exports, which agree to 4 decimal places:
 *       - `high` / `low`     = O ± 0.25·D — the study's "Upper / Lower Ranges", which behave
 *                              like value-area edges (mean reversion), and flip to S/R when
 *                              broken with conviction. NOT range extremes, despite the export's
 *                              field names — hence the labels here.
 *       - `extPlus2/Minus2`  = O ± 0.90·D — NEAR edge of the study's shaded "1x Range Zone"
 *       - `extPlus3/Minus3`  = O ± 1.00·D — FAR edge: the full expected session move
 *     On both fixtures D was 1.45% of the open (433.5 and 431.5 pts), i.e. an implied VIX of
 *     ~23.0. The ±2/±3 pair is therefore not two levels that happen to sit 0.2·D apart — it is
 *     the two EDGES OF ONE SHADED ZONE, and the zone is the object the operator trades against.
 *     Both edges stay Tier 1; terrain merges them into a single composite border rather than
 *     letting them compete for the partition (see `mergePartitions`' band rule). An earlier
 *     pass demoted the far edge to Tier 2 to break that competition — reverted, because it cost
 *     a real partition wherever the acceptance sat at the far edge, which is where the fixture's
 *     actually was.
 *   - Tier 2 (Intraday Direction): the Rip, the daily Job Pivot (feat-111) and Session VWAPs
 *     plus the other intraday daily reference levels (PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low)
 *     and the ATR projections. These set daily bias.
 *   - Tier 3 (Micro-Timing): Leg VWAP — lives in the exec CSV (see deltaTelemetry), not in
 *     this static JSON, so it never appears here.
 *
 * NOT every level comes from the static JSON (feat-090). The Daily MGI Priority Order's
 * ranks 4–5 — RVAH / RVAL / RPOC, the prior RTH session's value area and point of control —
 * are exported in `daily-value-areas.csv` instead (since feat-048), so the caller passes
 * them through `opts.priorDayValue` and they are synthesized into the same `MgiLevel`
 * shape. That is what makes them tier, sort in `dailyPrioritySort`, and reach terrain
 * (`selectAnchorLevels` takes the whole `daily` group), which in turn makes them
 * anchorable structure an entry may sit on.
 *
 * Pure + immutable; no file I/O (the caller passes the parsed JSON). Plain TypeScript
 * types (engine fact, not a Briefing output — no Zod).
 */

export type MgiTier = 1 | 2 | 3
export type MgiGroup = 'daily' | 'weekly' | 'monthly' | 'vRange' | 'atr'

/** A single classified MGI level. */
export type MgiLevel = {
  code: string // JSON key, e.g. 'onh', 'pwHigh'
  label: string // human label, e.g. 'ONH', 'PW High'
  price: number
  group: MgiGroup
  tier: MgiTier
  dailyRank: number | null // Daily MGI Priority Order rank (1 = highest), null if not ranked
}

/** Nearest Tier-1 border to the current price, with its absolute distance. */
export type NearestBorder = {
  level: MgiLevel
  distance: number // |level.price - currentPrice|, rounded
}

export type MgiPriority = {
  currentPrice: number
  levels: MgiLevel[] // every parsed level, price descending
  tier1: MgiLevel[] // Tier-1 levels only, price descending
  dailyPrioritySort: MgiLevel[] // daily-group levels, Daily MGI Priority Order then price
  nearestTier1Above: NearestBorder | null
  nearestTier1Below: NearestBorder | null
  /**
   * Nearest DAILY-group level each side (feat-109) — the intraday companion to
   * `nearestTier1Above/Below`, which is Tier-1-only and so can never surface the Rip, PDH/PDL,
   * IBH/IBL, RVAH/RVAL/RPOC or the OR levels no matter how close they sit.
   *
   * The whole daily group, not just the ranked members: OR High/Mid/Low carry no Daily MGI
   * Priority rank but are live session structure the doctrine uses as rungs. `level.dailyRank`
   * rides along so a consumer can weigh rank against distance instead of guessing.
   *
   * Distance-aware by design. `dailyPrioritySort` is rank order and is blind to where price
   * is — it prints the Rip first at 200 pts away and OR Mid last with price sitting on it —
   * which is the wrong shape for the entry-first, nearest-first objective contract (feat-086).
   */
  nearestDailyAbove: NearestBorder | null
  nearestDailyBelow: NearestBorder | null
}

/** Shape of the static MGI export. All fields optional — exports may omit levels. */
export type MgiStaticLevels = {
  current?: { time?: string; price?: number }
  daily?: Partial<
    Record<
      | 'orHigh'
      | 'orLow'
      | 'orMid'
      | 'pdh'
      | 'pdl'
      | 'pdc'
      | 'onh'
      | 'onl'
      | 'ibh'
      | 'ibl'
      | 'rip'
      | 'vwap24'
      | 'jobPivot',
      number
    >
  >
  atr?: Partial<Record<'high' | 'low', number>>
  weekly?: Partial<Record<'vwap' | 'pwHigh' | 'pwLow' | 'wkOpen' | 'jobPivot', number>>
  monthly?: Partial<Record<'vwap' | 'pmHigh' | 'pmLow' | 'mthOpen' | 'pmVAH' | 'pmVAL', number>>
  vRange?: Partial<Record<'high' | 'low' | 'extPlus2' | 'extPlus3' | 'extMinus2' | 'extMinus3', number>>
}

type LevelSpec = { label: string; tier: MgiTier; dailyRank?: number }

/**
 * Declarative classification keyed by group → JSON code. The single place tiering and the
 * Daily MGI Priority Order ranks are encoded, so the mapping stays auditable.
 * Daily ranks follow the playbook's "Daily MGI Priority Order":
 *   1 Rip + Job Pivot · 2 ONH/ONL · 3 PDH/PDL · 4 RVAH/RVAL · 5 RPOC · 6 IBH/IBL · 7 VWAP.
 * Ranks 4/5 are NOT in `mgi_static_levels.json` — they arrive from the daily value-area
 * export via `opts.priorDayValue` and are specified in {@link PRIOR_DAY_VALUE_SPECS}.
 * Daily levels without a rank (PDC, OR High/Mid/Low) sort after ranked.
 */
const LEVEL_SPECS: Record<MgiGroup, Record<string, LevelSpec>> = {
  daily: {
    rip: { label: 'Rip', tier: 2, dailyRank: 1 },
    // Job Pivot (feat-111): the auction's line in the sand — the level directional bias flips
    // across depending on which side price can hold, and where large rotations visibly start
    // and stop. Same functional class as the Rip (an intraday bias filter, not a campaign
    // border), so it shares Tier 2 and rank 1 with it rather than displacing anything below.
    jobPivot: { label: 'Job Pivot', tier: 2, dailyRank: 1 },
    onh: { label: 'ONH', tier: 1, dailyRank: 2 },
    onl: { label: 'ONL', tier: 1, dailyRank: 2 },
    pdh: { label: 'PDH', tier: 2, dailyRank: 3 },
    pdl: { label: 'PDL', tier: 2, dailyRank: 3 },
    pdc: { label: 'PDC', tier: 2 },
    ibh: { label: 'IBH', tier: 2, dailyRank: 6 },
    ibl: { label: 'IBL', tier: 2, dailyRank: 6 },
    vwap24: { label: '24 VWAP', tier: 2, dailyRank: 7 },
    orHigh: { label: 'OR High', tier: 2 },
    orLow: { label: 'OR Low', tier: 2 },
    orMid: { label: 'OR Mid', tier: 2 },
  },
  weekly: {
    vwap: { label: 'Weekly VWAP', tier: 1 },
    pwHigh: { label: 'PW High', tier: 1 },
    pwLow: { label: 'PW Low', tier: 1 },
    wkOpen: { label: 'Week Open', tier: 1 },
    // Weekly Job Pivot (feat-111): the prior week's activity distilled into a guide for the
    // current week — the daily pivot's job at a weekly horizon. Tier 1 like every other weekly
    // level, so it can hold a terrain partition and appear in nearestTier1Above/Below.
    jobPivot: { label: 'Weekly Job Pivot', tier: 1 },
  },
  monthly: {
    vwap: { label: 'Monthly VWAP', tier: 1 },
    pmHigh: { label: 'PM High', tier: 1 },
    pmLow: { label: 'PM Low', tier: 1 },
    mthOpen: { label: 'Month Open', tier: 1 },
    pmVAH: { label: 'PM VAH', tier: 1 },
    pmVAL: { label: 'PM VAL', tier: 1 },
  },
  // Labels name what the level IS (O ± a multiple of the VIX-implied session move), not the
  // export's field name: `high`/`low` are the 0.25x mean-reversion lines, NOT range extremes.
  // See the VRange note in the module docstring.
  vRange: {
    high: { label: 'VRange Upper', tier: 1 },
    low: { label: 'VRange Lower', tier: 1 },
    extPlus2: { label: 'VRange 1x Zone near (upper)', tier: 1 },
    extPlus3: { label: 'VRange 1x Zone far (upper)', tier: 1 },
    extMinus2: { label: 'VRange 1x Zone near (lower)', tier: 1 },
    extMinus3: { label: 'VRange 1x Zone far (lower)', tier: 1 },
  },
  atr: {
    high: { label: 'ATR High', tier: 2 },
    low: { label: 'ATR Low', tier: 2 },
  },
}

/**
 * The prior COMPLETED RTH session's value, sourced from `daily-value-areas.csv` rather
 * than the static MGI JSON — shape-compatible with `valueMigration.priorDay` so the caller
 * hands the fact straight through.
 *
 * MUST be the prior *completed* session (feat-089's date partition), never the developing
 * one: before that fix the newest row was TODAY, and promoting it here would have anchored
 * entries on the value area being built around current price.
 */
export type PriorDayValue = {
  poc: number
  vah: number
  val: number
}

/**
 * Daily MGI Priority ranks 4–5 (playbook `<mgi_reference>`): RVAH/RVAL are the prior RTH
 * value area (acceptance zones), RPOC the prior RTH point of control (major magnet/pivot).
 * Tier 2 alongside PDH/PDL/PDC — they are intraday daily reference levels that set bias,
 * not HTF campaign borders (the Tier-1 list is Weekly/Monthly, VRange extremes, ONH/ONL).
 */
const PRIOR_DAY_VALUE_SPECS: Record<keyof PriorDayValue, LevelSpec & { code: string }> = {
  vah: { code: 'rvah', label: 'RVAH', tier: 2, dailyRank: 4 },
  val: { code: 'rval', label: 'RVAL', tier: 2, dailyRank: 4 },
  poc: { code: 'rpoc', label: 'RPOC', tier: 2, dailyRank: 5 },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Flatten the static JSON into the classified levels it actually carries (finite only). */
function extractLevels(mgi: MgiStaticLevels): MgiLevel[] {
  const levels: MgiLevel[] = []
  for (const group of Object.keys(LEVEL_SPECS) as MgiGroup[]) {
    const specs = LEVEL_SPECS[group]
    const source: Record<string, unknown> | undefined = mgi[group]
    if (!source) continue
    for (const code of Object.keys(specs)) {
      const raw = source[code]
      if (!isFiniteNumber(raw)) continue
      const spec = specs[code]
      levels.push({
        code,
        label: spec.label,
        price: raw,
        group,
        tier: spec.tier,
        dailyRank: spec.dailyRank ?? null,
      })
    }
  }
  return levels
}

/**
 * Synthesize the RVAH/RVAL/RPOC levels from the prior completed session's value (feat-090).
 * Non-finite members are skipped one by one, so a partial export still promotes what it has.
 */
function priorDayValueLevels(priorDayValue: PriorDayValue | null | undefined): MgiLevel[] {
  if (!priorDayValue) return []
  const levels: MgiLevel[] = []
  for (const key of Object.keys(PRIOR_DAY_VALUE_SPECS) as (keyof PriorDayValue)[]) {
    const price = priorDayValue[key]
    if (!isFiniteNumber(price)) continue
    const spec = PRIOR_DAY_VALUE_SPECS[key]
    levels.push({
      code: spec.code,
      label: spec.label,
      price,
      group: 'daily',
      tier: spec.tier,
      dailyRank: spec.dailyRank ?? null,
    })
  }
  return levels
}

/**
 * Closest level strictly above/below `price` (strict — a level at `price` is neither).
 *
 * Non-positive prices are UNSET export placeholders, never structure: ONH/ONL export as 0.00
 * when the overnight session carried no data (the analyze prompt's `overnightSession` rule says
 * as much). They pass `isFiniteNumber`, so without this guard a gap-down open with no real
 * level under price would report a 0.00 ONL as "the nearest level below". Same guard the
 * terrain campaign anchors already apply (`terrainZones.ts`).
 */
function nearest(levels: MgiLevel[], price: number, dir: 'above' | 'below'): NearestBorder | null {
  const candidates = levels.filter(
    l => l.price > 0 && (dir === 'above' ? l.price > price : l.price < price),
  )
  if (candidates.length === 0) return null
  const level = candidates.reduce((best, l) =>
    Math.abs(l.price - price) < Math.abs(best.price - price) ? l : best,
  )
  return { level, distance: round2(Math.abs(level.price - price)) }
}

/**
 * Resolve the one live price the whole engine reads from: `mgi.current.price`, or the
 * caller's override when the live price comes from elsewhere in the bundle. Exported so a
 * caller that needs the price BEFORE it can build `computeMgiPriority`'s inputs (feat-090:
 * the prior-day value area is parsed from another export, and that parse wants the price)
 * resolves it exactly once, from the same source, with the same failure.
 *
 * @throws when neither source carries a finite number (malformed MGI export).
 */
export function resolveCurrentPrice(mgi: MgiStaticLevels, override?: number): number {
  const currentPrice = override ?? mgi?.current?.price
  if (!isFiniteNumber(currentPrice)) {
    throw new Error('computeMgiPriority: no finite current price')
  }
  return currentPrice
}

/**
 * Classify the MGI levels and locate the nearest Tier-1 campaign border above and below the
 * current price. Current price defaults to `mgi.current.price`; override via opts (e.g.
 * when the live price comes from elsewhere in the bundle).
 *
 * `opts.priorDayValue` carries the Daily MGI Priority Order's ranks 4–5 (RVAH/RVAL/RPOC),
 * which live in the daily value-area export rather than the static JSON. Pass
 * `valueMigration.priorDay` — the prior COMPLETED session (feat-089), never the developing
 * one. Omit it and the export simply carries no rank-4/5 levels, exactly as before feat-090.
 */
export function computeMgiPriority(
  mgi: MgiStaticLevels,
  opts: { currentPrice?: number; priorDayValue?: PriorDayValue | null } = {},
): MgiPriority {
  const currentPrice = resolveCurrentPrice(mgi, opts.currentPrice)

  const levels = [...extractLevels(mgi), ...priorDayValueLevels(opts.priorDayValue)].sort(
    (a, b) => b.price - a.price,
  )
  const tier1 = levels.filter(l => l.tier === 1)

  const dailyLevels = levels.filter(l => l.group === 'daily')
  // Copy before sorting: `dailyLevels` stays price-descending for the distance reads below.
  const dailyPrioritySort = [...dailyLevels].sort((a, b) => {
    const ra = a.dailyRank ?? Infinity
    const rb = b.dailyRank ?? Infinity
    if (ra !== rb) return ra - rb
    return b.price - a.price // tie-break ranked pairs / order unranked by price
  })

  return {
    currentPrice,
    levels,
    tier1,
    dailyPrioritySort,
    nearestTier1Above: nearest(tier1, currentPrice, 'above'),
    nearestTier1Below: nearest(tier1, currentPrice, 'below'),
    nearestDailyAbove: nearest(dailyLevels, currentPrice, 'above'),
    nearestDailyBelow: nearest(dailyLevels, currentPrice, 'below'),
  }
}
