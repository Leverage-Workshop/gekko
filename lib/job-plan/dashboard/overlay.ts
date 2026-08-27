import { priceToY, tileGeometry } from '../profile-vision/renderProfile'
import type { NodeKind } from '../profile-vision/schema'
import type { PersistedProfileNodesEntry } from './schema'

/**
 * Consensus nodes mapped onto the stored profile tiles (feat-129 step 7:
 * "each rendered profile with its nodes overlaid, and agreement k/S"). Pure
 * geometry: the persisted `render` meta + each `TileSpan` give the plot the
 * PNG was drawn with (`tileGeometry` / `priceToY` are the renderer's own), so
 * a band lands exactly where the model saw it. The image itself is served by
 * hash from the private bucket via /api/job-plans/images/[hash].
 */

export type OverlayKind = NodeKind | 'thin-zone'

export type OverlayBox = {
  readonly key: string
  readonly kind: OverlayKind
  /** e.g. "LVN 29400.00–29404.00" */
  readonly label: string
  readonly primary: boolean
  /** "k/S" — samples that reported the node out of samples taken. */
  readonly agreement: string
  readonly prominence: number | null
  readonly priceLow: number
  readonly priceHigh: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type TileOverlay = {
  readonly hash: string
  readonly index: number
  readonly of: number
  readonly width: number
  readonly height: number
  readonly priceLow: number
  readonly priceHigh: number
  readonly boxes: readonly OverlayBox[]
}

/** A point node still needs a visible stroke. */
export const MIN_BOX_HEIGHT_PX = 2

export const KIND_LABELS: Readonly<Record<OverlayKind, string>> = {
  lvn: 'LVN',
  'hvn-edge': 'HVN edge',
  'hvn-core': 'HVN core',
  'exhaustive-node': 'Exhaustive',
  'taper-tail': 'Taper tail',
  'thin-zone': 'Thin zone',
}

type BandSpec = {
  readonly key: string
  readonly kind: OverlayKind
  readonly priceLow: number
  readonly priceHigh: number
  readonly primary: boolean
  readonly agreement: number
  readonly samples: number
  readonly prominence: number | null
}

const price2 = (n: number) => n.toFixed(2)

function bandsOf(entry: PersistedProfileNodesEntry): BandSpec[] {
  const consensus = entry.consensus
  if (!consensus) return []
  return [
    ...consensus.nodes.map((n, i) => ({
      key: `node-${i}`,
      kind: n.kind,
      priceLow: n.priceLow,
      priceHigh: n.priceHigh,
      primary: n.primary,
      agreement: n.agreement,
      samples: n.samples,
      prominence: n.prominence,
    })),
    ...consensus.thinZones.map((z, i) => ({
      key: `thin-${i}`,
      kind: 'thin-zone' as const,
      priceLow: z.low,
      priceHigh: z.high,
      primary: false,
      agreement: z.agreement,
      samples: z.samples,
      prominence: null,
    })),
  ]
}

function boxFor(
  band: BandSpec,
  tile: TileOverlay,
  plot: ReturnType<typeof tileGeometry>
): OverlayBox | null {
  // Skip bands entirely outside this tile; clip the rest to the plot.
  if (band.priceHigh < tile.priceLow || band.priceLow > tile.priceHigh) return null
  const top = priceToY(plot, Math.min(band.priceHigh, tile.priceHigh))
  const bottom = priceToY(plot, Math.max(band.priceLow, tile.priceLow))
  return {
    key: band.key,
    kind: band.kind,
    label: `${KIND_LABELS[band.kind]} ${price2(band.priceLow)}–${price2(band.priceHigh)}`,
    primary: band.primary,
    agreement: `${band.agreement}/${band.samples}`,
    prominence: band.prominence,
    priceLow: band.priceLow,
    priceHigh: band.priceHigh,
    x: plot.plotLeft,
    y: top,
    width: plot.plotRight - plot.plotLeft,
    height: Math.max(MIN_BOX_HEIGHT_PX, bottom - top),
  }
}

/** One overlay per persisted tile (image hash ↔ tile span, same order). */
export function profileOverlays(entry: PersistedProfileNodesEntry): TileOverlay[] {
  const bands = bandsOf(entry)
  return entry.render.tiles.flatMap((tile, i) => {
    const hash = entry.imageHashes[i]
    if (hash === undefined) return []
    const base: TileOverlay = {
      hash,
      index: tile.index,
      of: tile.of,
      width: entry.render.width,
      height: entry.render.height,
      priceLow: tile.priceLow,
      priceHigh: tile.priceHigh,
      boxes: [],
    }
    const plot = tileGeometry(entry.render, tile)
    const boxes = bands.flatMap((band) => {
      const box = boxFor(band, base, plot)
      return box ? [box] : []
    })
    return [{ ...base, boxes }]
  })
}
