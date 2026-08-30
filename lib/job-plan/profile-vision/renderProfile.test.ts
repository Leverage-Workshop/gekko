import { createHash } from 'node:crypto'
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
  tileGeometry,
  tileRanges,
  TILE_OVERLAP,
} from './renderProfile'
import { pngDimensions, rasterizePng } from './rasterize'

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

/** sha256 of the synthetic ES render with currentPrice 104.5 — see the snapshot test. */
const SYNTHETIC_SHA256 = '54bf01e69265bd838839bb41ae3b221eeb46b423d3234ca4e3e19e5701c50f8b'

/** A contiguous 1-pt NQ profile of `n` bins with a smooth two-hump volume curve. */
function longNq(n: number): VbpProfile {
  const top = 30977
  const rows = Array.from({ length: n }, (_, i) => ({
    price: top - i,
    volume: Math.round(1000 * (1 + Math.sin(i / 60)) + 200 * (1 + Math.cos(i / 17))),
  }))
  return {
    rows,
    meta: {
      tickSize: 0.25,
      binSize: 4,
      step: 1,
      pocPrice: top - Math.floor(n / 3),
      valueAreaHigh: top - 50,
      valueAreaLow: top - n + 80,
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
  return [
    ...svg.matchAll(
      /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="(#[0-9a-f]{6})" stroke-width="2"( stroke-dasharray="[^"]+")?\/>/g
    ),
  ].map((m) => ({ y: Number(m[1]), color: m[2], dashed: m[3] !== undefined }))
}

describe('renderProfile — determinism', () => {
  it('is byte-identical for identical input + options, and the sha256 is stable', () => {
    const a = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    const b = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    expect(a.svg).toBe(b.svg)
    expect(a.sha256).toBe(b.sha256)
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('renders the synthetic ES profile exactly (snapshot), and the hash IS sha256 of those bytes', () => {
    const { svg, sha256 } = renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 104.5 })
    expect(svg).toMatchSnapshot()
    expect(sha256).toBe(createHash('sha256').update(svg, 'utf8').digest('hex'))
    // Pinned: a change here means the image a model sees changed — bump
    // VISION_PROMPT_REVISION (feat-123) and re-run the bench (feat-124).
    expect(sha256).toBe(SYNTHETIC_SHA256)
  })

  it('changes the sha256 when any option changes', () => {
    const base = renderProfileSvg(synthetic(), { instrument: 'ES' }).sha256
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', theme: 'dark' }).sha256).not.toBe(base)
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', envelope: true }).sha256).not.toBe(
      base
    )
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', barAnchor: 'left' }).sha256).not.toBe(
      base
    )
    expect(renderProfileSvg(synthetic(), { instrument: 'ES', currentPrice: 105 }).sha256).not.toBe(
      base
    )
  })

  it('does not depend on the input row order', () => {
    const shuffled: VbpProfile = {
      ...synthetic(),
      rows: [...synthetic().rows].reverse(),
    }
    expect(renderProfileSvg(shuffled, { instrument: 'ES' }).svg).toBe(
      renderProfileSvg(synthetic(), { instrument: 'ES' }).svg
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
    const y = (p: number) =>
      40 + ((meta.priceHigh - p) / (meta.priceHigh - meta.priceLow)) * (meta.height - 80)
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
      [
        ...svg.matchAll(
          /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#8c8c8c"\/>/g
        ),
      ].map((m) => ({ x: Number(m[1]), w: Number(m[2]) }))
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
      renderProfileSvg(synthetic(), { instrument: 'ES', height: MAX_LONG_EDGE + 1 })
    ).toThrow(/long edge/)
  })

  it('rejects an empty profile', () => {
    expect(() => renderProfileSvg({ ...synthetic(), rows: [] }, { instrument: 'ES' })).toThrow(
      /no rows/
    )
  })
})

describe('renderProfile — input validation (never a NaN coordinate with a stable hash)', () => {
  const es = { instrument: 'ES' as const }

  it.each([
    ['width 0', { width: 0 }, /positive integers/],
    ['negative height', { height: -5 }, /positive integers/],
    ['fractional width', { width: 900.5 }, /positive integers/],
    ['NaN height', { height: NaN }, /positive integers/],
    ['maxRows Infinity', { maxRows: Infinity }, /maxRows/],
    ['maxRows fractional', { maxRows: 2.5 }, /maxRows/],
    ['maxRows 0', { maxRows: 0 }, /maxRows/],
    ['width that leaves no plot (margins + axis = 156)', { width: 156 }, /hold a plot/],
    ['height that leaves no plot (margins = 80)', { height: 80 }, /hold a plot/],
    ['currentPrice NaN', { currentPrice: NaN }, /currentPrice/],
    ['currentPrice Infinity', { currentPrice: Infinity }, /currentPrice/],
  ])('rejects %s', (_label, bad, message) => {
    expect(() => renderProfileSvg(synthetic(), { ...es, ...bad })).toThrow(message)
  })

  it('rejects non-finite or negative row values', () => {
    const nanPrice = {
      ...synthetic(),
      rows: [{ price: NaN, volume: 1 }, ...synthetic().rows.slice(1)],
    }
    expect(() => renderProfileSvg(nanPrice, es)).toThrow(/non-finite price/)
    const negVol = {
      ...synthetic(),
      rows: [{ price: 111, volume: -1 }, ...synthetic().rows.slice(1)],
    }
    expect(() => renderProfileSvg(negVol, es)).toThrow(/negative/)
    const infVol = {
      ...synthetic(),
      rows: [{ price: 111, volume: Infinity }, ...synthetic().rows.slice(1)],
    }
    expect(() => renderProfileSvg(infVol, es)).toThrow(/non-finite/)
  })

  it('rejects non-finite markers and a non-positive step', () => {
    expect(() => renderProfileSvg(synthetic({ pocPrice: NaN }), es)).toThrow(/meta.pocPrice/)
    expect(() => renderProfileSvg(synthetic({ valueAreaLow: -Infinity }), es)).toThrow(
      /meta.valueAreaLow/
    )
    expect(() => renderProfileSvg(synthetic({ step: 0 }), es)).toThrow(/step/)
    expect(() => renderProfileSvg(synthetic({ step: NaN }), es)).toThrow(/step/)
  })

  it('rejects rows that are not contiguous on the bin grid (a gap would be painted through)', () => {
    const withGap = { ...synthetic(), rows: synthetic().rows.filter((r) => r.price !== 106) }
    expect(() => renderProfileSvg(withGap, es)).toThrow(/not contiguous at 105/)
    const duplicate = { ...synthetic(), rows: [...synthetic().rows, { price: 106, volume: 1 }] }
    expect(() => renderProfileSvg(duplicate, es)).toThrow(/not contiguous/)
    const wrongStep = { ...synthetic(), meta: { ...synthetic().meta, step: 2 } }
    expect(() => renderProfileSvg(wrongStep, es)).toThrow(/not contiguous/)
  })

  it('accepts the smallest image that still holds a plot', () => {
    expect(() => renderProfileSvg(synthetic(), { ...es, width: 157, height: 81 })).not.toThrow()
  })

  it('rejects a profile whose finite volumes overflow when aggregated', () => {
    const huge = {
      ...synthetic(),
      rows: synthetic().rows.map((r) => ({ ...r, volume: Number.MAX_VALUE })),
    }
    expect(() => renderProfileSvg(huge, { ...es, maxRows: 6 })).toThrow(/overflowed/)
  })

  it('accepts a quarter-point ES grid', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ price: 6820 - i * 0.25, volume: 10 + i }))
    const quarter: VbpProfile = {
      rows,
      meta: {
        tickSize: 0.25,
        binSize: 1,
        step: 0.25,
        pocPrice: 6815,
        valueAreaHigh: 6819,
        valueAreaLow: 6812,
      },
    }
    expect(() => renderProfileSvg(quarter, es)).not.toThrow()
  })
})

describe('renderProfile — long NQ profile axis guard', () => {
  it('1700 one-point bins: exact tick counts, first/last label, monotonic y, no NaN', () => {
    const { svg, meta } = renderProfileSvg(longNq(1700), { instrument: 'NQ' })
    expect(meta.sourceRows).toBe(1700)
    expect(meta.binsPerRow).toBe(3)
    expect(meta.rows).toBe(567)
    expect(meta.step).toBe(3)
    expect(meta.priceHigh).toBe(30978)
    expect(meta.priceLow).toBe(30978 - 1700)
    expect(svg).not.toMatch(/NaN|Infinity/)

    const labels = textNodes(svg).filter((t) => /^\d+\.\d{2}$/.test(t.text))
    const first = Math.floor(meta.priceHigh / 20) * 20
    const last = Math.ceil(meta.priceLow / 20) * 20
    expect(labels[0].text).toBe(first.toFixed(2))
    expect(labels[labels.length - 1].text).toBe(last.toFixed(2))
    expect(labels).toHaveLength((first - last) / 20 + 1)
    for (let i = 1; i < labels.length; i++) expect(labels[i].y).toBeGreaterThan(labels[i - 1].y)

    // minor ticks: every 10 pts in span, minus the majors
    const minorTicks = svg.match(/<line x1="768\.00" y1="[\d.]+" x2="773\.00"/g) ?? []
    const firstMinor = Math.floor(meta.priceHigh / 10) * 10
    const lastMinor = Math.ceil(meta.priceLow / 10) * 10
    expect(minorTicks).toHaveLength((firstMinor - lastMinor) / 10 + 1 - labels.length)
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
  })

  it('reports a too-short profile falling back to one tile rather than hiding it', () => {
    expect(tileRanges(3, 2)).toEqual([{ start: 0, end: 3 }])
    const three: VbpProfile = { ...synthetic(), rows: synthetic().rows.slice(0, 3) }
    const { meta, tiles } = renderProfile(three, { instrument: 'ES', tiles: 2 })
    expect(meta.requestedTiles).toBe(2)
    expect(tiles).toHaveLength(1)
    expect(meta.tiles[0]).toMatchObject({ index: 0, of: 1 })
    // and a normal profile honours the request
    expect(renderProfile(synthetic(), { instrument: 'ES', tiles: 2 }).meta.requestedTiles).toBe(2)
    expect(renderProfile(synthetic(), { instrument: 'ES', tiles: 2 }).tiles).toHaveLength(2)
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
      'current 29945.75 (above this image)'
    )
  })

  it('renderProfileSvg always yields the single full image and says so in meta', () => {
    const { meta } = renderProfileSvg(realProfile(), { instrument: 'NQ' })
    expect(meta.tiles).toHaveLength(1)
    expect(meta.requestedTiles).toBe(1)
  })
})

/**
 * feat-135: the axis-free variant. The price axis is the one thing on the image
 * the model has to READ rather than SEE, and reading it is the error-prone
 * step; `axis: false` removes it — and every other digit — so the model can
 * only be asked WHERE something is.
 */
describe('renderProfile — axis-free (feat-135)', () => {
  it('draws no axis line, no ticks, no gridlines and NO text carrying a digit', () => {
    const { svg, meta } = renderProfileSvg(realProfile(), {
      instrument: 'NQ',
      axis: false,
      currentPrice: 29945.75,
    })
    expect(meta.axis).toBe(false)

    // No price labels — the whole point of the variant.
    const texts = textNodes(svg).map((t) => t.text)
    expect(texts.filter((t) => /^\d+\.\d{2}$/.test(t))).toEqual([])
    // and nothing else on the image carries a digit either.
    for (const t of texts) expect(t, `text "${t}" carries a digit`).not.toMatch(/\d/)
    // the marker tags survive: they are the model's only calibration anchors
    expect(texts).toEqual(expect.arrayContaining(['VAH', 'VAL', 'POC', 'current']))

    // No axis line, no ticks, no major gridlines.
    expect(svg).not.toContain('stroke="#e2e2e2"')
    expect(svg.match(/<line /g) ?? []).toHaveLength(4) // POC + VAH + VAL + current, nothing else
  })

  it('keeps POC / VAH / VAL / current lines and the value-area shade', () => {
    const { svg, meta } = renderProfileSvg(synthetic(), {
      instrument: 'ES',
      axis: false,
      currentPrice: 104.5,
    })
    const lines = markerLines(svg)
    const y = (p: number) =>
      40 + ((meta.priceHigh - p) / (meta.priceHigh - meta.priceLow)) * (meta.height - 80)
    expect(lines.find((l) => l.color === '#1e6fd9' && !l.dashed)?.y).toBeCloseTo(y(101), 1) // POC
    expect(lines.filter((l) => l.dashed)).toHaveLength(2) // VAH + VAL
    expect(lines.find((l) => l.color === '#d9601a')?.y).toBeCloseTo(y(104.5), 1) // current
    expect(svg).toContain('fill="rgba(30,111,217,0.08)"') // value-area shade
  })

  it('gives the freed axis gutter to the bars', () => {
    const widest = (svg: string) =>
      Math.max(
        ...[
          ...svg.matchAll(
            /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#8c8c8c"\/>/g
          ),
        ].map((m) => Number(m[2]))
      )
    const withAxis = renderProfileSvg(synthetic(), { instrument: 'ES' }).svg
    const without = renderProfileSvg(synthetic(), { instrument: 'ES', axis: false }).svg
    expect(widest(withAxis)).toBeCloseTo(DEFAULT_WIDTH - 132 - 24, 1)
    expect(widest(without)).toBeCloseTo(DEFAULT_WIDTH - 24 - 24, 1)
    expect(widest(without)).toBeGreaterThan(widest(withAxis))
  })

  it('rasterizes to a valid PNG at the declared size', () => {
    const { svg } = renderProfileSvg(realProfile(), { instrument: 'NQ', axis: false })
    const png = rasterizePng(svg)
    expect(pngDimensions(png)).toEqual({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  })

  it('labels an out-of-range current price without quoting its number', () => {
    const { svg } = renderProfileSvg(synthetic(), {
      instrument: 'ES',
      axis: false,
      currentPrice: 500,
    })
    const texts = textNodes(svg).map((t) => t.text)
    expect(texts).toContain('current (above this image)')
    for (const t of texts) expect(t).not.toMatch(/\d/)
  })

  it('leaves the axis variant byte-identical (axis defaults to true)', () => {
    const a = renderProfileSvg(realProfile(), { instrument: 'NQ', currentPrice: 29945.75 })
    const b = renderProfileSvg(realProfile(), {
      instrument: 'NQ',
      currentPrice: 29945.75,
      axis: true,
    })
    expect(a.meta.axis).toBe(true)
    expect(b.sha256).toBe(a.sha256)
  })

  it('tileGeometry reads an axis-free render at its wider plot, a legacy row as axis', () => {
    const { meta } = renderProfileSvg(synthetic(), { instrument: 'ES', axis: false })
    expect(tileGeometry(meta, meta.tiles[0]).plotRight).toBe(DEFAULT_WIDTH - 24)
    // a row persisted before feat-135 carries no `axis` key at all
    expect(tileGeometry({ width: 900, height: 1400 }, meta.tiles[0]).plotRight).toBe(
      DEFAULT_WIDTH - 132
    )
  })
})
