import { createHash } from 'node:crypto'
import type { VbpProfile } from '@/lib/engine/parseProfile'
import { MAJOR_LABEL_INTERVAL, type Instrument } from './instrument'

/**
 * Profile renderer for the Job planner's vision read (feat-122, first half of
 * docs/job-planning-task-plan.md step 4 — "Rendering (pure, deterministic)").
 *
 * Draws a VbP export the way Job and the operator read it on screen (the
 * `chart-data/lvn-fixtures/*.image.png` screenshots are the reference look):
 * horizontal bars extending LEFT from a right-hand price axis, portrait
 * ~900 x 1400. The perception contract puts NOTHING on the image but the
 * profile itself, the POC / VAH / VAL markers, the value-area shade and the
 * current price — no boxes, no MGI, no pivots. Relating nodes to structure is
 * planner math; showing structure would invite the model to find nodes where
 * the boxes suggest.
 *
 * The render is a PURE function of (rows, meta, options): no Date, no
 * randomness, no I/O, and numbers are formatted through fixed-precision helpers
 * so identical input yields a byte-identical SVG. `sha256` of each tile's SVG
 * is part of feat-128's run fingerprint.
 *
 * Bin convention: a row at price P with step s covers [P, P + s) — Sierra's
 * Volume by Price bins start at the row price and extend one bin upward.
 */

export type RenderTheme = 'light' | 'dark'
export type BarAnchor = 'right' | 'left'

export type RenderOptions = {
  instrument: Instrument
  /** Current price marker; omitted / null draws none. Out-of-range prices are labeled at the nearest edge. */
  currentPrice?: number | null
  /** Bake-off variable: background / ink. Default 'light'. */
  theme?: RenderTheme
  /** Bake-off variable: thin ~9-row moving-average envelope over the raw bars. Default false. */
  envelope?: boolean
  /** Bake-off variable: one image, or two overlapping tiles (>= 10 % overlap, own axis each). Default 1. */
  tiles?: 1 | 2
  /** Bake-off variable: bars grow from the right-hand axis (Sierra) or from the left edge. Default 'right'. */
  barAnchor?: BarAnchor
  /** Row budget after aggregation (the 2-px-per-row target at the default height). Default 660. */
  maxRows?: number
  /** Image size in px. Long edge must stay <= 1568 so no provider downscales the labels. */
  width?: number
  height?: number
}

/** One aggregated row: a price band and the volume inside it. */
export type RenderRow = {
  readonly priceLow: number
  readonly priceHigh: number
  readonly volume: number
}

export type TileSpan = {
  readonly index: number
  readonly of: number
  /** Price span the tile covers (bin edges). */
  readonly priceLow: number
  readonly priceHigh: number
  readonly rows: number
}

export type RenderMeta = {
  readonly instrument: Instrument
  readonly theme: RenderTheme
  readonly envelope: boolean
  readonly barAnchor: BarAnchor
  readonly width: number
  readonly height: number
  /** Source bin step (points) from the export. */
  readonly binStep: number
  /** Effective row step (points) after aggregation — passed to the model as the grid. */
  readonly step: number
  /** Aggregation factor: source bins per rendered row. */
  readonly binsPerRow: number
  readonly sourceRows: number
  readonly rows: number
  /** Full profile span (bin edges). */
  readonly priceLow: number
  readonly priceHigh: number
  readonly totalVolume: number
  readonly majorInterval: number
  readonly minorInterval: number
  readonly poc: number
  readonly vah: number
  readonly val: number
  readonly currentPrice: number | null
  readonly tiles: readonly TileSpan[]
}

export type RenderedTile = {
  readonly tile: TileSpan
  readonly svg: string
  readonly sha256: string
}

export type RenderResult = {
  readonly tiles: readonly RenderedTile[]
  readonly meta: RenderMeta
}

export const DEFAULT_WIDTH = 900
export const DEFAULT_HEIGHT = 1400
export const DEFAULT_MAX_ROWS = 660
/** Longest image edge any provider accepts without downscaling labels. */
export const MAX_LONG_EDGE = 1568
/** Envelope window in rows (odd, centered). */
export const ENVELOPE_WINDOW = 9
/** Fraction of rows shared by the two tiles. */
export const TILE_OVERLAP = 0.1
/** Axis label font size in px (>= 14 so every provider keeps it legible). */
export const LABEL_FONT_PX = 16
export const FONT_FAMILY = 'DejaVu Sans'

const MARGIN_TOP = 40
const MARGIN_BOTTOM = 40
const MARGIN_LEFT = 24
const AXIS_WIDTH = 132
const TICK_MAJOR = 10
const TICK_MINOR = 5

type Palette = {
  bg: string
  bar: string
  envelope: string
  axisText: string
  axisLine: string
  gridMajor: string
  poc: string
  va: string
  vaFill: string
  current: string
}

const PALETTES: Readonly<Record<RenderTheme, Palette>> = {
  light: {
    bg: '#ffffff',
    bar: '#8c8c8c',
    envelope: '#1f1f1f',
    axisText: '#1a1a1a',
    axisLine: '#1a1a1a',
    gridMajor: '#e2e2e2',
    poc: '#1e6fd9',
    va: '#1e6fd9',
    vaFill: 'rgba(30,111,217,0.08)',
    current: '#d9601a',
  },
  dark: {
    bg: '#000000',
    bar: '#b4b4b4',
    envelope: '#ffffff',
    axisText: '#19c8d4',
    axisLine: '#19c8d4',
    gridMajor: '#1e1e1e',
    poc: '#2f7ff0',
    va: '#2f7ff0',
    vaFill: 'rgba(47,127,240,0.14)',
    current: '#ffa733',
  },
}

/** Fixed-precision coordinate so the SVG text is stable across platforms. */
function px(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function price2(n: number): string {
  return n.toFixed(2)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Aggregate the export's bins into <= maxRows rows, top-down in groups of
 * `binsPerRow` consecutive bins. Preserves total volume and the full price
 * span; the last group may be short.
 */
export function aggregateRows(
  profile: VbpProfile,
  maxRows: number,
): { rows: RenderRow[]; binsPerRow: number } {
  const sorted = [...profile.rows].sort((a, b) => b.price - a.price)
  const step = profile.meta.step
  const binsPerRow = Math.max(1, Math.ceil(sorted.length / maxRows))
  const rows: RenderRow[] = []
  for (let i = 0; i < sorted.length; i += binsPerRow) {
    const group = sorted.slice(i, i + binsPerRow)
    const priceHigh = round4(group[0].price + step)
    const priceLow = round4(group[group.length - 1].price)
    const volume = group.reduce((sum, r) => sum + r.volume, 0)
    rows.push({ priceLow, priceHigh, volume })
  }
  return { rows, binsPerRow }
}

/** Centered moving average of row volumes (window ENVELOPE_WINDOW, truncated at the ends). */
export function envelopeVolumes(rows: readonly RenderRow[]): number[] {
  const half = Math.floor(ENVELOPE_WINDOW / 2)
  return rows.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(rows.length - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += rows[j].volume
    return sum / (hi - lo + 1)
  })
}

/**
 * Split rows into tile row-ranges. One tile = everything; two tiles share
 * TILE_OVERLAP of the rows so a node on the seam is fully visible in one of them.
 */
export function tileRanges(rowCount: number, tiles: 1 | 2): { start: number; end: number }[] {
  if (tiles === 1 || rowCount < 4) return [{ start: 0, end: rowCount }]
  const overlap = Math.max(1, Math.ceil(rowCount * TILE_OVERLAP))
  const mid = Math.floor(rowCount / 2)
  const firstEnd = Math.min(rowCount, mid + Math.ceil(overlap / 2))
  const secondStart = Math.max(0, firstEnd - overlap)
  return [
    { start: 0, end: firstEnd },
    { start: secondStart, end: rowCount },
  ]
}

type Geometry = {
  width: number
  height: number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
  priceLow: number
  priceHigh: number
}

function geometry(width: number, height: number, priceLow: number, priceHigh: number): Geometry {
  return {
    width,
    height,
    plotLeft: MARGIN_LEFT,
    plotRight: width - AXIS_WIDTH,
    plotTop: MARGIN_TOP,
    plotBottom: height - MARGIN_BOTTOM,
    priceLow,
    priceHigh,
  }
}

/** Price -> y (higher prices up). Exported so tests can assert marker placement. */
export function priceToY(g: Geometry, price: number): number {
  const span = g.priceHigh - g.priceLow
  const frac = span === 0 ? 0 : (g.priceHigh - price) / span
  return g.plotTop + frac * (g.plotBottom - g.plotTop)
}

function axisSvg(g: Geometry, major: number, minor: number, pal: Palette): string {
  const parts: string[] = []
  const x0 = g.plotRight
  parts.push(
    `<line x1="${px(x0)}" y1="${px(g.plotTop)}" x2="${px(x0)}" y2="${px(g.plotBottom)}" stroke="${pal.axisLine}" stroke-width="1"/>`,
  )
  // Top-down, so the SVG's label order is the reading order.
  const topMinor = Math.floor(g.priceHigh / minor) * minor
  for (let p = topMinor; p >= g.priceLow - 1e-9; p = round4(p - minor)) {
    const y = priceToY(g, p)
    const isMajor = Math.abs(p / major - Math.round(p / major)) < 1e-9
    if (isMajor) {
      parts.push(
        `<line x1="${px(g.plotLeft)}" y1="${px(y)}" x2="${px(x0)}" y2="${px(y)}" stroke="${pal.gridMajor}" stroke-width="1"/>`,
      )
      parts.push(
        `<line x1="${px(x0)}" y1="${px(y)}" x2="${px(x0 + TICK_MAJOR)}" y2="${px(y)}" stroke="${pal.axisLine}" stroke-width="1"/>`,
      )
      parts.push(
        `<text x="${px(x0 + TICK_MAJOR + 4)}" y="${px(y)}" fill="${pal.axisText}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="${LABEL_FONT_PX}" dominant-baseline="middle">${price2(p)}</text>`,
      )
    } else {
      parts.push(
        `<line x1="${px(x0)}" y1="${px(y)}" x2="${px(x0 + TICK_MINOR)}" y2="${px(y)}" stroke="${pal.axisLine}" stroke-width="1"/>`,
      )
    }
  }
  return parts.join('\n')
}

function barsSvg(
  g: Geometry,
  rows: readonly RenderRow[],
  maxVolume: number,
  anchor: BarAnchor,
  pal: Palette,
): string {
  const plotWidth = g.plotRight - g.plotLeft
  const parts: string[] = []
  for (const row of rows) {
    const w = maxVolume === 0 ? 0 : (row.volume / maxVolume) * plotWidth
    if (w <= 0) continue
    const yTop = priceToY(g, row.priceHigh)
    const yBot = priceToY(g, row.priceLow)
    const x = anchor === 'right' ? g.plotRight - w : g.plotLeft
    parts.push(
      `<rect x="${px(x)}" y="${px(yTop)}" width="${px(w)}" height="${px(yBot - yTop)}" fill="${pal.bar}"/>`,
    )
  }
  return parts.join('\n')
}

function envelopeSvg(
  g: Geometry,
  rows: readonly RenderRow[],
  maxVolume: number,
  anchor: BarAnchor,
  pal: Palette,
): string {
  if (rows.length === 0 || maxVolume === 0) return ''
  const plotWidth = g.plotRight - g.plotLeft
  const smoothed = envelopeVolumes(rows)
  const points = rows.map((row, i) => {
    const w = (smoothed[i] / maxVolume) * plotWidth
    const x = anchor === 'right' ? g.plotRight - w : g.plotLeft + w
    const y = (priceToY(g, row.priceHigh) + priceToY(g, row.priceLow)) / 2
    return `${px(x)},${px(y)}`
  })
  return `<polyline points="${points.join(' ')}" fill="none" stroke="${pal.envelope}" stroke-width="1.5" stroke-linejoin="round"/>`
}

function hLine(g: Geometry, y: number, color: string, dashed: boolean): string {
  const dash = dashed ? ' stroke-dasharray="8 6"' : ''
  return `<line x1="${px(g.plotLeft)}" y1="${px(y)}" x2="${px(g.plotRight)}" y2="${px(y)}" stroke="${color}" stroke-width="2"${dash}/>`
}

/** Marker label with a background-colored halo so it stays legible over long bars. */
function markerLabel(
  g: Geometry,
  y: number,
  text: string,
  color: string,
  above: boolean,
  pal: Palette,
): string {
  const yText = above ? y - 5 : y + LABEL_FONT_PX
  return `<text x="${px(g.plotLeft + 4)}" y="${px(yText)}" fill="${color}" stroke="${pal.bg}" stroke-width="3" paint-order="stroke" font-family="${FONT_FAMILY}" font-weight="bold" font-size="${LABEL_FONT_PX}">${esc(text)}</text>`
}

function inSpan(g: Geometry, price: number): boolean {
  return price >= g.priceLow && price <= g.priceHigh
}

/** Value-area shade, clipped to the tile's span. Drawn BELOW the bars. */
function valueAreaShadeSvg(g: Geometry, vah: number, val: number, pal: Palette): string {
  const vaTop = Math.min(vah, g.priceHigh)
  const vaBot = Math.max(val, g.priceLow)
  if (vaTop <= vaBot) return ''
  const y1 = priceToY(g, vaTop)
  const y2 = priceToY(g, vaBot)
  return `<rect x="${px(g.plotLeft)}" y="${px(y1)}" width="${px(g.plotRight - g.plotLeft)}" height="${px(y2 - y1)}" fill="${pal.vaFill}"/>`
}

/** POC / VAH / VAL / current-price lines and labels. Drawn ABOVE the bars. */
function markerLinesSvg(
  g: Geometry,
  poc: number,
  vah: number,
  val: number,
  current: number | null,
  pal: Palette,
): string {
  const parts: string[] = []
  if (inSpan(g, vah)) {
    const y = priceToY(g, vah)
    parts.push(hLine(g, y, pal.va, true), markerLabel(g, y, `VAH ${price2(vah)}`, pal.va, true, pal))
  }
  if (inSpan(g, val)) {
    const y = priceToY(g, val)
    parts.push(hLine(g, y, pal.va, true), markerLabel(g, y, `VAL ${price2(val)}`, pal.va, false, pal))
  }
  if (inSpan(g, poc)) {
    const y = priceToY(g, poc)
    parts.push(hLine(g, y, pal.poc, false), markerLabel(g, y, `POC ${price2(poc)}`, pal.poc, true, pal))
  }
  if (current === null) return parts.join('\n')
  if (inSpan(g, current)) {
    const y = priceToY(g, current)
    parts.push(
      hLine(g, y, pal.current, false),
      markerLabel(g, y, `current ${price2(current)}`, pal.current, current < poc, pal),
    )
  } else {
    const above = current > g.priceHigh
    const y = above ? g.plotTop : g.plotBottom
    const text = `current ${price2(current)} (${above ? 'above' : 'below'} this image)`
    parts.push(markerLabel(g, y, text, pal.current, !above, pal))
  }
  return parts.join('\n')
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function renderTile(
  rows: readonly RenderRow[],
  tile: TileSpan,
  meta: RenderMeta,
  pal: Palette,
  maxVolume: number,
): RenderedTile {
  const g = geometry(meta.width, meta.height, tile.priceLow, tile.priceHigh)
  const body = [
    `<rect x="0" y="0" width="${meta.width}" height="${meta.height}" fill="${pal.bg}"/>`,
    axisSvg(g, meta.majorInterval, meta.minorInterval, pal),
    valueAreaShadeSvg(g, meta.vah, meta.val, pal),
    barsSvg(g, rows, maxVolume, meta.barAnchor, pal),
    meta.envelope ? envelopeSvg(g, rows, maxVolume, meta.barAnchor, pal) : '',
    markerLinesSvg(g, meta.poc, meta.vah, meta.val, meta.currentPrice, pal),
  ]
    .filter((s) => s.length > 0)
    .join('\n')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}" shape-rendering="crispEdges">\n` +
    body +
    '\n</svg>'
  return { tile, svg, sha256: sha256Hex(svg) }
}

function validate(profile: VbpProfile, width: number, height: number, maxRows: number): void {
  if (profile.rows.length === 0) throw new Error('renderProfile: profile has no rows')
  if (!(profile.meta.step > 0)) throw new Error('renderProfile: profile step must be > 0')
  if (Math.max(width, height) > MAX_LONG_EDGE) {
    throw new Error(`renderProfile: long edge ${Math.max(width, height)} exceeds ${MAX_LONG_EDGE}`)
  }
  if (!(maxRows >= 1)) throw new Error('renderProfile: maxRows must be >= 1')
}

/**
 * Render a VbP profile to one or two SVG tiles plus the metadata the prompt
 * text needs (effective step, span, markers). Pure: identical input + options
 * yield byte-identical SVG and the same sha256 per tile.
 */
export function renderProfile(profile: VbpProfile, opts: RenderOptions): RenderResult {
  const width = opts.width ?? DEFAULT_WIDTH
  const height = opts.height ?? DEFAULT_HEIGHT
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS
  validate(profile, width, height, maxRows)

  const theme = opts.theme ?? 'light'
  const pal = PALETTES[theme]
  const { rows, binsPerRow } = aggregateRows(profile, maxRows)
  const majorInterval = MAJOR_LABEL_INTERVAL[opts.instrument]
  const minorInterval = majorInterval / 2
  const maxVolume = rows.reduce((m, r) => Math.max(m, r.volume), 0)
  const totalVolume = rows.reduce((s, r) => s + r.volume, 0)
  const tileCount = opts.tiles ?? 1
  const ranges = tileRanges(rows.length, tileCount)
  const tileSpans: TileSpan[] = ranges.map((r, i) => ({
    index: i,
    of: ranges.length,
    priceLow: rows[r.end - 1].priceLow,
    priceHigh: rows[r.start].priceHigh,
    rows: r.end - r.start,
  }))

  const meta: RenderMeta = {
    instrument: opts.instrument,
    theme,
    envelope: opts.envelope ?? false,
    barAnchor: opts.barAnchor ?? 'right',
    width,
    height,
    binStep: profile.meta.step,
    step: round4(profile.meta.step * binsPerRow),
    binsPerRow,
    sourceRows: profile.rows.length,
    rows: rows.length,
    priceLow: rows[rows.length - 1].priceLow,
    priceHigh: rows[0].priceHigh,
    totalVolume,
    majorInterval,
    minorInterval,
    poc: profile.meta.pocPrice,
    vah: profile.meta.valueAreaHigh,
    val: profile.meta.valueAreaLow,
    currentPrice: opts.currentPrice ?? null,
    tiles: tileSpans,
  }

  const tiles = ranges.map((r, i) =>
    renderTile(rows.slice(r.start, r.end), tileSpans[i], meta, pal, maxVolume),
  )
  return { tiles, meta }
}

/** Single-image convenience: the whole profile as one SVG (tiles forced to 1). */
export function renderProfileSvg(
  profile: VbpProfile,
  opts: RenderOptions,
): { svg: string; sha256: string; meta: RenderMeta } {
  const result = renderProfile(profile, { ...opts, tiles: 1 })
  const [tile] = result.tiles
  return { svg: tile.svg, sha256: tile.sha256, meta: result.meta }
}
