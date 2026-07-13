/**
 * MGI (Macro Geography Intelligence) priority engine.
 *
 * Classifies the static MGI levels from `mgi_static_levels.json` into the doctrine's
 * Tier 1/2/3 structural hierarchy, produces the Daily MGI Priority Order sort, and
 * computes the nearest Tier-1 campaign border above/below the current price.
 *
 * Tiering is the `tactical-companion-playbook.md` `<mgi_reference>` "Structural Hierarchy
 * Rule" (the source of truth; the glossary doc only names levels):
 *   - Tier 1 (Campaign Borders): HTF MGI — Weekly/Monthly levels, VRange extremes, ONH/ONL.
 *     These are the true Acceptance Borders that dictate Primary/Secondary objectives,
 *     targets, and hard invalidations. Doctrine's Tier-1 list does NOT include ATR: the
 *     ATR projected high/low are volatility context, classified Tier 2 (gem-alignment
 *     audit finding A9 — they are not campaign borders or partition anchors).
 *   - Tier 2 (Intraday Direction): the Rip and Session VWAPs plus the other intraday daily
 *     reference levels (PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low) and the ATR projections.
 *     These set daily bias.
 *   - Tier 3 (Micro-Timing): Leg VWAP — lives in the exec CSV (see deltaTelemetry), not in
 *     this static JSON, so it never appears here.
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
}

/** Shape of the static MGI export. All fields optional — exports may omit levels. */
export type MgiStaticLevels = {
  current?: { time?: string; price?: number }
  daily?: Partial<
    Record<
      'orHigh' | 'orLow' | 'orMid' | 'pdh' | 'pdl' | 'pdc' | 'onh' | 'onl' | 'ibh' | 'ibl' | 'rip' | 'vwap24',
      number
    >
  >
  atr?: Partial<Record<'high' | 'low', number>>
  weekly?: Partial<Record<'vwap' | 'pwHigh' | 'pwLow' | 'wkOpen', number>>
  monthly?: Partial<Record<'vwap' | 'pmHigh' | 'pmLow' | 'mthOpen' | 'pmVAH' | 'pmVAL', number>>
  vRange?: Partial<Record<'high' | 'low' | 'extPlus2' | 'extPlus3' | 'extMinus2' | 'extMinus3', number>>
}

type LevelSpec = { label: string; tier: MgiTier; dailyRank?: number }

/**
 * Declarative classification keyed by group → JSON code. The single place tiering and the
 * Daily MGI Priority Order ranks are encoded, so the mapping stays auditable.
 * Daily ranks follow the playbook's "Daily MGI Priority Order":
 *   1 Rip · 2 ONH/ONL · 3 PDH/PDL · 6 IBH/IBL · 7 VWAP. (Ranks 4/5 = RVAH/RVAL/RPOC are
 * not in this export.) Daily levels without a rank (PDC, OR High/Mid/Low) sort after ranked.
 */
const LEVEL_SPECS: Record<MgiGroup, Record<string, LevelSpec>> = {
  daily: {
    rip: { label: 'Rip', tier: 2, dailyRank: 1 },
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
  },
  monthly: {
    vwap: { label: 'Monthly VWAP', tier: 1 },
    pmHigh: { label: 'PM High', tier: 1 },
    pmLow: { label: 'PM Low', tier: 1 },
    mthOpen: { label: 'Month Open', tier: 1 },
    pmVAH: { label: 'PM VAH', tier: 1 },
    pmVAL: { label: 'PM VAL', tier: 1 },
  },
  vRange: {
    high: { label: 'VRange High', tier: 1 },
    low: { label: 'VRange Low', tier: 1 },
    extPlus2: { label: 'VRange +2', tier: 1 },
    extPlus3: { label: 'VRange +3', tier: 1 },
    extMinus2: { label: 'VRange -2', tier: 1 },
    extMinus3: { label: 'VRange -3', tier: 1 },
  },
  atr: {
    high: { label: 'ATR High', tier: 2 },
    low: { label: 'ATR Low', tier: 2 },
  },
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
    const source = mgi[group] as Record<string, unknown> | undefined
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

/** Closest level strictly above/below `price` (strict — a level at `price` is neither). */
function nearest(levels: MgiLevel[], price: number, dir: 'above' | 'below'): NearestBorder | null {
  const candidates = levels.filter(l => (dir === 'above' ? l.price > price : l.price < price))
  if (candidates.length === 0) return null
  const level = candidates.reduce((best, l) =>
    Math.abs(l.price - price) < Math.abs(best.price - price) ? l : best,
  )
  return { level, distance: round2(Math.abs(level.price - price)) }
}

/**
 * Classify the static MGI levels and locate the nearest Tier-1 campaign border above and
 * below the current price. Current price defaults to `mgi.current.price`; override via opts
 * (e.g. when the live price comes from elsewhere in the bundle).
 */
export function computeMgiPriority(
  mgi: MgiStaticLevels,
  opts: { currentPrice?: number } = {},
): MgiPriority {
  const currentPrice = opts.currentPrice ?? mgi?.current?.price
  if (!isFiniteNumber(currentPrice)) {
    throw new Error('computeMgiPriority: no finite current price')
  }

  const levels = extractLevels(mgi).sort((a, b) => b.price - a.price)
  const tier1 = levels.filter(l => l.tier === 1)

  const dailyPrioritySort = levels
    .filter(l => l.group === 'daily')
    .sort((a, b) => {
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
  }
}
