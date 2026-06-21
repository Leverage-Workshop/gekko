import { describe, it, expect } from 'vitest'
import {
  ingestBundle,
  IngestValidationError,
  type IngestDeps,
  type RawBundleRecord,
} from '@/lib/ingest'

type Upload = { bucket: string; path: string; bytes: Uint8Array; contentType: string }

function makeDeps(id = 'bundle-1') {
  const uploads: Upload[] = []
  const inserts: RawBundleRecord[] = []
  const deps: IngestDeps = {
    newId: () => id,
    uploadObject: async (bucket, path, bytes, contentType) => {
      uploads.push({ bucket, path, bytes, contentType })
    },
    insertBundle: async (record) => {
      inserts.push(record)
      return { id: record.id }
    },
  }
  return { deps, uploads, inserts }
}

function pngFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

describe('ingestBundle', () => {
  it('uploads each file to the right bucket/path and records refs', async () => {
    const { deps, uploads, inserts } = makeDeps('abc')
    const form = new FormData()
    form.set('htf_png', pngFile('htf.png'))
    form.set('tpo_png', pngFile('tpo.png'))
    form.set('exec_png', pngFile('exec.png'))
    form.set('exec_csv', new File(['DateTime,Open\n'], 'e.csv', { type: 'text/csv' }))
    form.set('vol_profile', new File(['# vbp'], 'vbp.md', { type: 'text/markdown' }))
    form.set('delta_profile', new File(['# delta'], 'delta.md', { type: 'text/markdown' }))

    const result = await ingestBundle(form, deps)

    expect(result).toEqual({ id: 'abc' })
    expect(uploads).toHaveLength(6)

    const chartImages = uploads.filter((u) => u.bucket === 'chart-images')
    const csvs = uploads.filter((u) => u.bucket === 'bundle-csvs')
    expect(chartImages).toHaveLength(3)
    expect(csvs).toHaveLength(3)

    // every object is stored under the bundle-id prefix
    expect(uploads.every((u) => u.path.startsWith('abc/'))).toBe(true)

    const record = inserts[0]
    expect(record.htf_png_ref).toBe('abc/htf.png')
    expect(record.tpo_png_ref).toBe('abc/tpo.png')
    expect(record.exec_png_ref).toBe('abc/exec.png')
    expect(record.exec_csv_ref).toBe('abc/execution_bars.csv')
    expect(record.vol_profile_ref).toBe('abc/vbp_export.md')
    expect(record.delta_profile_ref).toBe('abc/delta_vbp_export.md')
    expect(record.is_stale).toBe(false)
  })

  it('stores mgi JSON inline and extracts current_price from current.price', async () => {
    const { deps, inserts } = makeDeps()
    const mgi = { current: { time: '13:36:08', price: 30436.25 }, daily: { pdh: 30915 } }
    const form = new FormData()
    form.set('mgi', JSON.stringify(mgi))

    await ingestBundle(form, deps)

    // Full MGI is stored inline (so current.time is preserved in the jsonb)...
    expect(inserts[0].mgi_json).toEqual(mgi)
    // ...and the price is lifted out of current.price.
    expect(inserts[0].current_price).toBe(30436.25)
  })

  it('leaves current_price null when the MGI lacks current.price', async () => {
    const { deps, inserts } = makeDeps()
    const form = new FormData()
    form.set('mgi', JSON.stringify({ daily: { pdh: 30915 } }))

    await ingestBundle(form, deps)

    expect(inserts[0].current_price).toBeNull()
  })

  it('leaves refs null for absent files', async () => {
    const { deps, uploads, inserts } = makeDeps()
    const form = new FormData()
    form.set('htf_png', pngFile('htf.png'))

    await ingestBundle(form, deps)

    expect(uploads).toHaveLength(1)
    const record = inserts[0]
    expect(record.htf_png_ref).toBe(`${record.id}/htf.png`)
    expect(record.tpo_png_ref).toBeNull()
    expect(record.exec_csv_ref).toBeNull()
    expect(record.current_price).toBeNull()
    expect(record.mgi_json).toBeNull()
  })

  it('rejects an empty bundle', async () => {
    const { deps } = makeDeps()
    await expect(ingestBundle(new FormData(), deps)).rejects.toBeInstanceOf(
      IngestValidationError,
    )
  })

  it('rejects malformed mgi JSON', async () => {
    const { deps } = makeDeps()
    const form = new FormData()
    form.set('mgi', '{not json')
    await expect(ingestBundle(form, deps)).rejects.toBeInstanceOf(IngestValidationError)
  })

  it('ignores a non-numeric current.price in the MGI (price stays null)', async () => {
    const { deps, inserts } = makeDeps()
    const form = new FormData()
    form.set('htf_png', pngFile('htf.png'))
    form.set('mgi', JSON.stringify({ current: { price: 'NaN-ish' } }))
    await ingestBundle(form, deps)
    expect(inserts[0].current_price).toBeNull()
  })

  it('does not insert when validation fails before upload', async () => {
    const { deps, uploads, inserts } = makeDeps()
    const form = new FormData()
    form.set('mgi', '{bad')
    await expect(ingestBundle(form, deps)).rejects.toThrow()
    expect(uploads).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })
})
