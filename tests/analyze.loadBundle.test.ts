import { describe, expect, it } from 'vitest'
import { AnalyzeInputError, loadLatestBundle } from '@/lib/analyze'
import type { BundleRow, LoadBundleDeps } from '@/lib/analyze'

const encoder = new TextEncoder()

function row(overrides: Partial<BundleRow> = {}): BundleRow {
  return {
    id: 'bundle-1',
    received_at: '2026-07-06T12:00:00Z',
    mgi_json: { current: { price: 30255 } },
    current_price: 30255,
    is_stale: false,
    exec_csv_ref: 'bundle-1/execution_bars.csv',
    vol_profile_ref: 'bundle-1/vbp_export.md',
    delta_profile_ref: 'bundle-1/delta_vbp_export.md',
    htf_png_ref: 'bundle-1/htf.png',
    tpo_png_ref: 'bundle-1/tpo.png',
    exec_png_ref: 'bundle-1/exec.png',
    ...overrides,
  }
}

function deps(
  bundle: BundleRow | null,
  objects: Record<string, string> = {},
): LoadBundleDeps & { downloads: string[] } {
  const downloads: string[] = []
  return {
    downloads,
    fetchLatestBundle: async () => bundle,
    downloadObject: async (bucket, path) => {
      downloads.push(`${bucket}:${path}`)
      const content = objects[path]
      if (content === undefined) {
        throw new Error(`missing object ${path}`)
      }
      return encoder.encode(content)
    },
  }
}

const objects = {
  'bundle-1/vbp_export.md': 'VBP',
  'bundle-1/delta_vbp_export.md': 'DELTA',
  'bundle-1/execution_bars.csv': 'CSV',
  'bundle-1/htf.png': 'Hi',
  'bundle-1/tpo.png': 'Yo',
  'bundle-1/exec.png': 'Ok',
}

describe('loadLatestBundle', () => {
  it('loads texts from bundle-csvs and images from chart-images', async () => {
    const d = deps(row(), objects)
    const bundle = await loadLatestBundle(d)

    expect(bundle.vbpContent).toBe('VBP')
    expect(bundle.deltaContent).toBe('DELTA')
    expect(bundle.execCsvContent).toBe('CSV')
    expect(bundle.mgi).toEqual({ current: { price: 30255 } })
    expect(bundle.images.map((i) => i.base64)).toEqual(['SGk=', 'WW8=', 'T2s='])
    expect(bundle.charts).toHaveLength(3)
    expect(bundle.warnings).toEqual([])
    expect(d.downloads).toContain('bundle-csvs:bundle-1/vbp_export.md')
    expect(d.downloads).toContain('chart-images:bundle-1/htf.png')
  })

  it('throws AnalyzeInputError when no bundle exists', async () => {
    await expect(loadLatestBundle(deps(null))).rejects.toThrow(AnalyzeInputError)
  })

  it('throws when the bundle has no MGI JSON', async () => {
    await expect(
      loadLatestBundle(deps(row({ mgi_json: null }), objects)),
    ).rejects.toThrow(/mgi_json/)
  })

  it('throws when a required text export is missing', async () => {
    await expect(
      loadLatestBundle(deps(row({ vol_profile_ref: null }), objects)),
    ).rejects.toThrow(/VbP volume profile/)
  })

  it('degrades a missing screenshot to a warning, keeping labels aligned', async () => {
    const bundle = await loadLatestBundle(deps(row({ tpo_png_ref: null }), objects))

    expect(bundle.images).toHaveLength(2)
    expect(bundle.charts.map((c) => c.label)).toEqual([
      'HTF planning chart (30-min, 90-day)',
      'Execution chart (short timeframe)',
    ])
    expect(bundle.warnings.some((w) => w.includes('TPO'))).toBe(true)
  })

  it('throws when the delta export is missing under the default (all) mode', async () => {
    await expect(
      loadLatestBundle(deps(row({ delta_profile_ref: null }), objects)),
    ).rejects.toThrow(/delta profile/)
  })
})

describe('loadLatestBundle with requireTexts: exec-only (eval)', () => {
  it('loads a bundle missing the VbP/delta exports', async () => {
    const d = deps(row({ vol_profile_ref: null, delta_profile_ref: null }), objects)
    const bundle = await loadLatestBundle(d, { requireTexts: 'exec-only' })

    expect(bundle.execCsvContent).toBe('CSV')
    expect(bundle.images).toHaveLength(3)
    expect(bundle.warnings).toEqual([])
  })

  it('never downloads the VbP/delta exports, even when the refs exist', async () => {
    const d = deps(row(), objects)
    await loadLatestBundle(d, { requireTexts: 'exec-only' })

    expect(d.downloads.filter((entry) => entry.startsWith('bundle-csvs:'))).toEqual([
      'bundle-csvs:bundle-1/execution_bars.csv',
    ])
  })

  it('still requires the exec CSV', async () => {
    await expect(
      loadLatestBundle(deps(row({ exec_csv_ref: null }), objects), {
        requireTexts: 'exec-only',
      }),
    ).rejects.toThrow(/execution-bar CSV/)
  })
})
