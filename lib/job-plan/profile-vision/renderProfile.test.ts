import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import {
  aggregateRows,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_ROWS,
  DEFAULT_WIDTH,
  envelopeVolumes,
  LABEL_FONT_PX,
  MAX_LONG_EDGE,
  renderProfile,
  renderProfileSvg,
  tileRanges,
  TILE_OVERLAP,
} from './renderProfile'

/** A tiny synthetic profile: 12 one-point bins, 100..112, bell-ish with a valley at 106. */
function synthetic(overrides: Partial<VbpProfile['meta']> = {}): VbpProfile {
  const volumes = [5, 20, 60, 90, 40, 10, 3, 15, 70, 95, 35, 8]
  const rows = volumes.map((volume, i) => ({ price: 111 - i, volume }))
  return {
    rows,
    meta: {
      tickSize: 0.25,
      binSize: 4,
      step: 1,
      pocPrice: 101,
      valueAreaHigh: 109,
      valueAreaLow: 100,
      ...overrides,
    },
  }
}

const FIXTURE = join(process.cwd(), 'chart-data/four-hundred-rotation.vbp.md')
const realProfile = () => parseVbpProfile(readFileSync(FIXTURE, 'utf8'))

/** Parses `<text ... y="Y">LABEL</text>` pairs from an SVG. */
function textNodes(svg: string): { y: number; text: string }[] {
  return [...svg.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({
    y: Number(m[1]),
    text: m[2],
  }))
}

/** Parses the marker `<line>`s (full-plot-width, stroke-width 2) as {y, color, dashed}. */
function markerLines(svg: string): { y: number; color: string; dashed: boolean }[] {
  return [...svg.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="(#[0-9a-f]{6})" stroke-width="2"( stroke-dasharray="[^"]+")?\/>/g)].map(
    (m) => ({ y: Number(m[1]), color: m[2], dashed: m[3] !== undefined }),
  )
}

describe('renderProfile — determinism', () => {
  it('is byte-identical for identical input + options, and the sha256 is stable', () => {
    const a = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    const b = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    expect(a.svg).toBe(b.svg)
    expect(a.sha256).toBe(b.sha256)
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('renders the synthetic ES profile exactly (snapshot)', () => {
    const { svg } = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    expect(svg).toMatchSnapshot()
  })

  it('changes the sha256 when any option changes', () => {
    const base = renderProfileSvg(synthetic(), { instrument: 'ES' }).sha256
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', theme: 'dark' }).sha256).not.toBe(base)
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', envelope: true }).sha256).not.toBe(base)
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', barAnchor: 'left' }).sha256).not.toBe(
      base,
    )
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 105 }).sha256).not.toBe(
      base,
    )
  })

  it('does not depend on the input row order', () => {
    const shuffled: VbpProfile = {
      ...synthetic(),
      rows: [...synthetic().rows].reverse(),
    }
    expect(renderProfileSvg(shuffled, { instrument: 'ES' }).svg).toBe(
      renderProfileSvg(synthetic(), { instrument: 'ES' }).svg,
    )
  })

  it('does not mutate the input profile', () => {
    const profile = synthetic()
    const snapshot = JSON.stringify(profile)
    renderProfile(profile, { instrument: 'ES', tiles: 2, envelope: true })
    expect(JSON.stringify(profile)).toBe(snapshot)
  })

  it('renders the real 400-pt rotation export identically twice', () => {
    const a = renderProfileSvg(realProfile(), { instrument: 'NQ', currentPrice: 29945.75 })
    const b = renderProfileSvg(realProfile(), { instrument: 'NQ', currentPrice: 29945.75 })
    expect(a.sha256).toBe(b.sha256)
  })
})

describe('renderProfile — aggregation', () => {
  it('keeps 1 bin per row when the export fits the row budget', () => {
    const { rows, binsPerRow } = aggregateRows(synthetic(), DEFAULT_MAX_ROWS)
    expect(binsPerRow).toBe(1)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual({ priceLow: 111, priceHigh: 112, volume: 5 })
    expect(rows[11]).toEqual({ priceLow: 100, priceHigh: 101, volume: 8 })
  })

  it('aggregates a 1163-bin NQ export to 2-pt rows under the default budget', () => {
    const profile = realProfile()
    const { meta } = renderProfileSvg(profile, { instrument: 'NQ' })
    expect(meta.binStep).toBe(1)
    expect(meta.binsPerRow).toBe(2)
    expect(meta.step).toBe(2)
    expect(meta.sourceRows).toBe(1163)
    expect(meta.rows).toBe(582)
    expect(meta.rows).toBeLessThanOrEqual(DEFAULT_MAX_ROWS)
  })

  it('preserves total volume and the full price span under aggregation', () => {
    const profile = realProfile()
    const { rows } = aggregateRows(profile, 100)
    const total = profile.rows.reduce((s, r) => s + r.volume, 0)
    expect(rows.reduce((s, r) => s + r.volume, 0)).toBe(total)
    const top = Math.max(...profile.rows.map((r) => r.price))
    const bottom = Math.min(...profile.rows.map((r) => r.price))
    expect(rows[0].priceHigh).toBe(top + profile.meta.step)
    expect(rows[rows.length - 1].priceLow).toBe(bottom)
    // rows tile the span with no gaps
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].priceHigh).toBe(rows[i - 1].priceLow)
    }
  })

  it('lets a short last group through rather than dropping bins', () => {
    const { rows, binsPerRow } = aggregateRows(synthetic(), 5)
    expect(binsPerRow).toBe(3)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.volume)).toEqual([85, 140, 88, 138])
  })
})

describe('renderProfile — axis', () => {
  it('labels every 5 pts on ES and every 20 pts on NQ', () => {
    const es = renderProfileSvg(synthetic(), { instrument: 'ES' })
    const esLabels = textNodes(es.svg)
      .map((t) => t.text)
      .filter((t) => /^\d+\.\d{2}$/.test(t))
    expect(esLabels).toEqual(['110.00', '105.00', '100.00'])
    expect(es.meta.majorInterval).toBe(5)
    expect(es.meta.minorInterval).toBe(2.5)

    const nq = renderProfileSvg(realProfile(), { instrument: 'NQ' })
    const nqLabels = textNodes(nq.svg)
      .map((t) => t.text)
      .filter((t) => /^\d+\.\d{2}$/.test(t))
    expect(nqLabels[0]).toBe('30060.00')
    expect(nqLabels[nqLabels.length - 1]).toBe('28920.00')
    expect(nqLabels.every((l) => Number(l) % 20 === 0)).toBe(true)
    expect(nqLabels).toHaveLength((30060 - 28920) / 20 + 1)
  })

  it('places axis labels at the y of their price, top-down, with >= 14 px font', () => {
    const { svg, meta } = renderProfileSvg(synthetic(), { instrument: 'ES' })
    const labels = textNodes(svg).filter((t) => /^\d+\.\d{2}$/.test(t.text))
    expect(labels[0].y).toBeLessThan(labels[1].y)
    expect(labels[1].y).toBeLessThan(labels[2].y)
    // 105 is the midpoint of the 100..112 span → exactly mid-plot.
    const plotTop = 40
    const plotBottom = meta.height - 40
    const expected = plotTop + ((112 - 105) / 12) * (plotBottom - plotTop)
    expect(labels[1].y).toBeCloseTo(expected, 1)
    expect(LABEL_FONT_PX).toBeGreaterThanOrEqual(14)
    expect(svg).toContain(`font-size="${LABEL_FONT_PX}"`)
  })
})

describe('renderProfile — markers', () => {
  it('draws POC solid, VAH/VAL dashed, current price, each at the right y', () => {
    const { svg, meta } = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    const lines = markerLines(svg)
    const y = (p: number) => 40 + ((meta.priceHigh - p) / (meta.priceHigh - meta.priceLow)) * (meta.height - 80)
    const poc = lines.find((l) => !l.dashed && l.color === '#1e6fd9')
    expect(poc?.y).toBeCloseTo(y(101), 1)
    const dashed = lines.filter((l) => l.dashed).map((l) => l.y)
    expect(dashed).toHaveLength(2)
    expect(dashed[0]).toBeCloseTo(y(109), 1)
    expect(dashed[1]).toBeCloseTo(y(100), 1)
    const current = lines.find((l) => l.color === '#d9601a')
    expect(current?.y).toBeCloseTo(y(104.5), 1)

    const labels = textNodes(svg).map((t) => t.text)
    expect(labels).toContain('POC 101.00')
    expect(labels).toContain('VAH 109.00')
    expect(labels).toContain('VAL 100.00')
    expect(labels).toContain('current 104.50')
  })

  it('shades the value area once, below the bars', () => {
    const { svg } = renderProfileSvg(synthetic(), { instrument: 'ES' })
    const shadeIdx = svg.indexOf('rgba(30,111,217,0.08)')
    const firstBar = svg.indexOf('fill="#8c8c8c"')
    expect(shadeIdx).toBeGreaterThan(-1)
    expect(shadeIdx).toBeLessThan(firstBar)
    expect(svg.split('rgba(30,111,217,0.08)')).toHaveLength(2)
  })

  it('omits the current-price marker when none is given', () => {
    const { svg, meta } = renderProfileSvg(synthetic(), { instrument: 'ES' })
    expect(svg).not.toContain('current ')
    expect(meta.currentPrice).toBeNull()
  })

  it('labels an out-of-range current price at the nearest edge instead of drawing a line', () => {
    const above = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 150 })
    expect(textNodes(above.svg).map((t) => t.text)).toContain('current 150.00 (above this image)')
    expect(markerLines(above.svg).some((l) => l.color === '#d9601a')).toBe(false)
    const below = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 50 })
    expect(textNodes(below.svg).map((t) => t.text)).toContain('current 50.00 (below this image)')
  })

  it('puts nothing else on the image — no structure, only the perception contract', () => {
    const { svg } = renderProfileSvg(realProfile(), { instrument: 'NQ', currentPrice: 29945.75 })
    const words = textNodes(svg)
      .map((t) => t.text.replace(/[\d.() ]/g, ''))
      .filter((w) => w.length > 0)
    expect(new Set(words)).toEqual(new Set(['POC', 'VAH', 'VAL', 'current']))
  })
})

describe('renderProfile — options', () => {
  it('defaults to 900 x 1400 light, right-anchored, no envelope, one tile', () => {
    const { meta, svg } = renderProfileSvg(synthetic(), { instrument: 'ES' })
    expect(meta.width).toBe(DEFAULT_WIDTH)
    expect(meta.height).toBe(DEFAULT_HEIGHT)
    expect(meta.theme).toBe('light')
    expect(meta.barAnchor).toBe('right')
    expect(meta.envelope).toBe(false)
    expect(meta.tiles).toHaveLength(1)
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).not.toContain('<polyline')
    expect(Math.max(DEFAULT_WIDTH, DEFAULT_HEIGHT)).toBeLessThanOrEqual(MAX_LONG_EDGE)
  })

  it('anchors bars to the right axis by default and to the left edge on request', () => {
    const right = renderProfileSvg(synthetic(), { instrument: 'ES' }).svg
    const left = renderProfileSvg(synthetic(), { instrument: 'ES', barAnchor: 'left' }).svg
    const bars = (svg: string) =>
      [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#8c8c8c"\/>/g)].map(
        (m) => ({ x: Number(m[1]), w: Number(m[2]) }),
      )
    const plotRight = DEFAULT_WIDTH - 132
    for (const b of bars(right)) expect(b.x + b.w).toBeCloseTo(plotRight, 1)
    for (const b of bars(left)) expect(b.x).toBe(24)
    // the widest bar spans the whole plot either way
    expect(Math.max(...bars(right).map((b) => b.w))).toBeCloseTo(plotRight - 24, 1)
  })

  it('overlays a 9-row moving-average envelope when asked', () => {
    const { svg } = renderProfileSvg(synthetic(), { instrument: 'ES', envelope: true })
    expect(svg).toContain('<polyline')
    const vols = envelopeVolumes(aggregateRows(synthetic(), 100).rows)
    expect(vols).toHaveLength(12)
    // interior point: mean of the 9 rows centred on it
    const v = [5, 20, 60, 90, 40, 10, 3, 15, 70, 95, 35, 8]
    expect(vols[5]).toBeCloseTo(v.slice(1, 10).reduce((a, b) => a + b, 0) / 9, 6)
    // edge: truncated window
    expect(vols[0]).toBeCloseTo(v.slice(0, 5).reduce((a, b) => a + b, 0) / 5, 6)
  })

  it('uses the dark palette on request', () => {
    const { svg } = renderProfileSvg(synthetic(), { instrument: 'ES', theme: 'dark' })
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('fill="#b4b4b4"')
    expect(svg).not.toContain('#8c8c8c')
  })

  it('rejects an image whose long edge exceeds the provider ceiling', () => {
    expect(() =>
      renderProfileSvg(synthetic(), { instrument: 'ES', height: MAX_LONG_EDGE + 1 }),
    ).toThrow(/long edge/)
  })

  it('rejects an empty profile', () => {
    expect(() =>
      renderProfileSvg({ ...synthetic(), rows: [] }, { instrument: 'ES' }),
    ).toThrow(/no rows/)
  })
})

describe('renderProfile — tiles', () => {
  it('splits into two tiles sharing >= 10 % of the rows, each with its own axis', () => {
    const profile = realProfile()
    const { tiles, meta } = renderProfile(profile, { instrument: 'NQ', tiles: 2 })
    expect(tiles).toHaveLength(2)
    expect(meta.tiles.map((t) => [t.index, t.of])).toEqual([
      [0, 2],
      [1, 2],
    ])
    const [top, bottom] = meta.tiles
    expect(top.priceHigh).toBe(meta.priceHigh)
    expect(bottom.priceLow).toBe(meta.priceLow)
    // overlap in rows >= 10 % of the total
    const overlapRows = top.rows + bottom.rows - meta.rows
    expect(overlapRows).toBeGreaterThanOrEqual(Math.ceil(meta.rows * TILE_OVERLAP))
    // overlap in price: the top tile's floor sits below the bottom tile's ceiling
    expect(top.priceLow).toBeLessThan(bottom.priceHigh)
    // each tile carries its own axis labels for its own span only
    const labelsOf = (svg: string) =>
      textNodes(svg)
        .map((t) => Number(t.text))
        .filter((n) => Number.isFinite(n) && n % 20 === 0)
    const topLabels = labelsOf(tiles[0].svg)
    const bottomLabels = labelsOf(tiles[1].svg)
    expect(Math.min(...topLabels)).toBeGreaterThanOrEqual(top.priceLow)
    expect(Math.max(...bottomLabels)).toBeLessThanOrEqual(bottom.priceHigh)
    expect(Math.max(...topLabels)).toBeGreaterThan(Math.max(...bottomLabels))
    expect(tiles[0].sha256).not.toBe(tiles[1].sha256)
  })

  it('tileRanges: one tile covers everything; two overlap by ceil(10 %)', () => {
    expect(tileRanges(100, 1)).toEqual([{ start: 0, end: 100 }])
    const [a, b] = tileRanges(100, 2)
    expect(a.start).toBe(0)
    expect(b.end).toBe(100)
    expect(a.end - b.start).toBe(10)
    const [c, d] = tileRanges(7, 2)
    expect(c.end - d.start).toBeGreaterThanOrEqual(1)
    expect(tileRanges(3, 2)).toEqual([{ start: 0, end: 3 }])
  })

  it('clips markers outside a tile instead of drawing them off-plot', () => {
    const profile = realProfile()
    const { tiles, meta } = renderProfile(profile, {
      instrument: 'NQ',
      tiles: 2,
      currentPrice: 29945.75,
    })
    const [top, bottom] = tiles
    // POC 29900 sits in the upper tile only.
    expect(textNodes(top.svg).map((t) => t.text)).toContain(`POC ${meta.poc.toFixed(2)}`)
    expect(textNodes(bottom.svg).map((t) => t.text)).not.toContain(`POC ${meta.poc.toFixed(2)}`)
    // VAL 29361 sits in the lower tile only.
    expect(textNodes(bottom.svg).map((t) => t.text)).toContain(`VAL ${meta.val.toFixed(2)}`)
    expect(textNodes(top.svg).map((t) => t.text)).not.toContain(`VAL ${meta.val.toFixed(2)}`)
    // The lower tile says where the current price is rather than drawing nothing.
    expect(textNodes(bottom.svg).map((t) => t.text)).toContain(
      'current 29945.75 (above this image)',
    )
  })

  it('renderProfileSvg always yields the single full image', () => {
    const { meta } = renderProfileSvg(realProfile(), { instrument: 'NQ', tiles: 2 })
    expect(meta.tiles).toHaveLength(1)
  })
})
