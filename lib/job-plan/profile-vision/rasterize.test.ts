import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pngDimensions, PROFILE_FONT_FILE, rasterizePng, resolveFontFile } from './rasterize'
import { renderProfileSvg } from './renderProfile'
import type { VbpProfile } from '@/lib/engine/parseProfile'

const tiny: VbpProfile = {
  rows: [
    { price: 103, volume: 10 },
    { price: 102, volume: 40 },
    { price: 101, volume: 25 },
    { price: 100, volume: 5 },
  ],
  meta: {
    tickSize: 0.25,
    binSize: 4,
    step: 1,
    pocPrice: 102,
    valueAreaHigh: 103,
    valueAreaLow: 101,
  },
}

describe('rasterizePng', () => {
  it('ships the font in-repo and resolves it under the project root', () => {
    expect(existsSync(join(process.cwd(), PROFILE_FONT_FILE))).toBe(true)
    expect(resolveFontFile('/build')).toBe(`/build/${PROFILE_FONT_FILE}`)
  })

  it('rasterizes a rendered profile to a PNG of the intrinsic size', () => {
    const { svg } = renderProfileSvg(tiny, { instrument: 'ES', width: 300, height: 400 })
    const png = rasterizePng(svg)
    expect(pngDimensions(png)).toEqual({ width: 300, height: 400 })
    expect(png.byteLength).toBeGreaterThan(500)
  })

  it('is deterministic: same SVG -> same PNG bytes', () => {
    const { svg } = renderProfileSvg(tiny, { instrument: 'ES', width: 200, height: 300 })
    const a = rasterizePng(svg)
    const b = rasterizePng(svg)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('fails loudly when the font file is missing (a packaging error)', () => {
    const { svg } = renderProfileSvg(tiny, { instrument: 'ES', width: 200, height: 300 })
    expect(() => rasterizePng(svg, { fontFile: '/nonexistent/font.ttf' })).toThrow(
      /font file not found/
    )
  })

  it('pngDimensions rejects non-PNG bytes', () => {
    expect(() => pngDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/not a PNG/)
  })
})
