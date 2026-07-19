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
    rotation_vbp_ref: 'bundle-1/four-hundred-rotation.vbp.md',
    balance_area_vbp_ref: 'bundle-1/balance-area.vbp.md',
    half_rotation_delta_ref: 'bundle-1/half-rotation-delta.vbp.md',
    full_rotation_delta_ref: 'bundle-1/full-rotation-delta.vbp.md',
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
  'bundle-1/four-hundred-rotation.vbp.md': 'ROTATION',
  'bundle-1/balance-area.vbp.md': 'BALANCEAREA',
  'bundle-1/half-rotation-delta.vbp.md': 'HALFDELTA',
  'bundle-1/full-rotation-delta.vbp.md': 'FULLDELTA',
  'bundle-1/execution_bars.csv': 'CSV',
  'bundle-1/htf.png': 'Hi',
  'bundle-1/tpo.png': 'Yo',
  'bundle-1/exec.png': 'Ok',
}

describe('loadLatestBundle', () => {
  it('loads texts from bundle-csvs and images from chart-images', async () => {
    const d = deps(row(), objects)
    const bundle = await loadLatestBundle(d)

    expect(bundle.rotationVbpContent).toBe('ROTATION')
    expect(bundle.balanceAreaVbpContent).toBe('BALANCEAREA')
    expect(bundle.halfRotationDeltaContent).toBe('HALFDELTA')
    expect(bundle.fullRotationDeltaContent).toBe('FULLDELTA')
    expect(bundle.execCsvContent).toBe('CSV')
    expect(bundle.mgi).toEqual({ current: { price: 30255 } })
    expect(bundle.images.map((i) => i.base64)).toEqual(['SGk=', 'WW8=', 'T2s='])
    expect(bundle.charts).toHaveLength(3)
    expect(bundle.warnings).toEqual([])
    expect(d.downloads).toContain('bundle-csvs:bundle-1/four-hundred-rotation.vbp.md')
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

  it.each([
    ['rotation_vbp_ref', /400-pt rotation volume profile/],
    ['balance_area_vbp_ref', /balance-area volume profile/],
    ['half_rotation_delta_ref', /half-rotation delta profile/],
    ['full_rotation_delta_ref', /full-rotation delta profile/],
  ] as const)(
    'throws a self-naming error when %s is missing under the default (all) mode',
    async (column, message) => {
      await expect(
        loadLatestBundle(deps(row({ [column]: null }), objects)),
      ).rejects.toThrow(message)
    },
  )

  it('degrades a missing screenshot to a warning, keeping labels aligned', async () => {
    const bundle = await loadLatestBundle(deps(row({ tpo_png_ref: null }), objects))

    expect(bundle.images).toHaveLength(2)
    expect(bundle.charts.map((c) => c.label)).toEqual([
      'HTF planning chart (30-min, 90-day)',
      'Execution chart (short timeframe)',
    ])
    expect(bundle.warnings.some((w) => w.includes('TPO'))).toBe(true)
  })
})

describe('loadLatestBundle with requireTexts: exec-only (eval)', () => {
  it('loads a bundle missing all four profile exports', async () => {
    const d = deps(
      row({
        rotation_vbp_ref: null,
        balance_area_vbp_ref: null,
        half_rotation_delta_ref: null,
        full_rotation_delta_ref: null,
      }),
      objects,
    )
    const bundle = await loadLatestBundle(d, { requireTexts: 'exec-only' })

    expect(bundle.execCsvContent).toBe('CSV')
    expect(bundle.images).toHaveLength(3)
    expect(bundle.warnings).toEqual([])
  })

  it('never downloads the profile exports, even when the refs exist', async () => {
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

describe('loadLatestBundle with requireTexts: exec-plus-delta (eval)', () => {
  it('fetches the two delta exports alongside the exec CSV, skipping the VbPs', async () => {
    const d = deps(row(), objects)
    const bundle = await loadLatestBundle(d, { requireTexts: 'exec-plus-delta' })

    expect(bundle.execCsvContent).toBe('CSV')
    expect(bundle.halfRotationDeltaContent).toBe('HALFDELTA')
    expect(bundle.fullRotationDeltaContent).toBe('FULLDELTA')
    expect(bundle.warnings).toEqual([])
    expect(d.downloads.filter((entry) => entry.startsWith('bundle-csvs:'))).toEqual([
      'bundle-csvs:bundle-1/execution_bars.csv',
      'bundle-csvs:bundle-1/half-rotation-delta.vbp.md',
      'bundle-csvs:bundle-1/full-rotation-delta.vbp.md',
    ])
  })

  it('degrades a missing delta ref to null + warning instead of throwing', async () => {
    const bundle = await loadLatestBundle(
      deps(row({ half_rotation_delta_ref: null }), objects),
      { requireTexts: 'exec-plus-delta' },
    )

    expect(bundle.halfRotationDeltaContent).toBeNull()
    expect(bundle.fullRotationDeltaContent).toBe('FULLDELTA')
    expect(
      bundle.warnings.some((w) => w.includes('no half-rotation delta profile')),
    ).toBe(true)
  })

  it('degrades a failed delta download to null + warning instead of throwing', async () => {
    const partial = { ...objects } as Record<string, string>
    delete partial['bundle-1/full-rotation-delta.vbp.md']
    const bundle = await loadLatestBundle(deps(row(), partial), {
      requireTexts: 'exec-plus-delta',
    })

    expect(bundle.fullRotationDeltaContent).toBeNull()
    expect(
      bundle.warnings.some((w) =>
        w.includes('failed to download the full-rotation delta profile'),
      ),
    ).toBe(true)
  })

  it('still requires the exec CSV', async () => {
    await expect(
      loadLatestBundle(deps(row({ exec_csv_ref: null }), objects), {
        requireTexts: 'exec-plus-delta',
      }),
    ).rejects.toThrow(/execution-bar CSV/)
  })
})
