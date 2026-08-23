import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

/**
 * SVG -> PNG for the profile vision read (feat-122).
 *
 * `@resvg/resvg-js` is a prebuilt native module (`.node`). Per the trigger.dev
 * docs (deployment/overview "No loader is configured for .node files") it must
 * be listed in `build.external` in trigger.config.ts so esbuild leaves it to
 * the runtime, and the font ships through `additionalFiles` so the worker has
 * no system-font dependency. Documented fallback if resvg will not load in the
 * trigger worker: `@napi-rs/canvas` behind the same `rasterizePng` signature.
 *
 * Fonts: system fonts are NEVER loaded (`loadSystemFonts: false`) — a render
 * must look the same on the dev box, in vitest and in the trigger worker, and
 * the golden-set / few-shot images are only comparable if the glyphs are.
 */

/** Font shipped in-repo (Bitstream Vera licence, see assets/fonts/LICENSE-DejaVu.txt). */
export const PROFILE_FONT_FILE = 'assets/fonts/DejaVuSans-Bold.ttf'
/** Family name the SVG asks for; must match the shipped file's family. */
export const PROFILE_FONT_FAMILY = 'DejaVu Sans'

export type RasterizeOptions = {
  /** Absolute path to the font file. Default: PROFILE_FONT_FILE under `process.cwd()`. */
  fontFile?: string
}

/** Resolves the shipped font under the project root (trigger.dev copies it there). */
export function resolveFontFile(baseDir: string = process.cwd()): string {
  return join(baseDir, PROFILE_FONT_FILE)
}

/**
 * Rasterize an SVG string at its intrinsic size. Throws when the font file is
 * missing — a packaging error that must fail loudly, not render blank labels.
 */
export function rasterizePng(svg: string, opts: RasterizeOptions = {}): Uint8Array {
  const fontFile = opts.fontFile ?? resolveFontFile()
  if (!existsSync(fontFile)) {
    throw new Error(`rasterizePng: font file not found at ${fontFile}`)
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      loadSystemFonts: false,
      fontFiles: [fontFile],
      defaultFontFamily: PROFILE_FONT_FAMILY,
    },
  })
  return new Uint8Array(resvg.render().asPng())
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Reads the IHDR width/height of a PNG (for tests and the CLI's summary line). */
export function pngDimensions(png: Uint8Array): { width: number; height: number } {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new Error('pngDimensions: not a PNG')
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
