import { describe, it, expect } from 'vitest'
import {
  readBundle,
  toFormData,
  isEmptyBundle,
  BUNDLE_FILENAMES,
  type FileReader,
} from '@/lib/uploader'

const enc = new TextEncoder()

/** Builds a FileReader backed by an in-memory filename→bytes map. */
function reader(files: Record<string, Uint8Array | string>): FileReader {
  return async (filename) => {
    const v = files[filename]
    if (v == null) return null
    return typeof v === 'string' ? enc.encode(v) : v
  }
}

describe('readBundle', () => {
  it('collects every present file with its ingest field/content-type', async () => {
    const bundle = await readBundle(
      reader({
        'htf.png': new Uint8Array([1]),
        'tpo.png': new Uint8Array([2]),
        'exec.png': new Uint8Array([3]),
        'execution_bars.csv': 'DateTime,Open\n',
        'vbp_export.md': '# vbp',
        'delta_vbp_export.md': '# delta',
      }),
    )

    const fields = bundle.files.map((f) => f.field).sort()
    expect(fields).toEqual(
      ['delta_profile', 'exec_csv', 'exec_png', 'htf_png', 'tpo_png', 'vol_profile'].sort(),
    )
    const htf = bundle.files.find((f) => f.field === 'htf_png')
    expect(htf?.filename).toBe('htf.png')
    expect(htf?.contentType).toBe('image/png')
  })

  it('omits absent files and parses the mgi + current_price sidecars', async () => {
    const bundle = await readBundle(
      reader({ 'htf.png': new Uint8Array([1]), 'mgi.json': '{"a":1}\n', 'current_price.txt': ' 21050.25 ' }),
    )

    expect(bundle.files).toHaveLength(1)
    expect(bundle.mgi).toBe('{"a":1}')
    expect(bundle.currentPrice).toBe('21050.25')
  })

  it('treats blank sidecars as absent', async () => {
    const bundle = await readBundle(reader({ 'htf.png': new Uint8Array([1]), 'current_price.txt': '   \n' }))
    expect(bundle.currentPrice).toBeNull()
    expect(bundle.mgi).toBeNull()
  })

  it('flags a bundle with no files and no mgi as empty', async () => {
    expect(isEmptyBundle(await readBundle(reader({})))).toBe(true)
    expect(isEmptyBundle(await readBundle(reader({ 'mgi.json': '{}' })))).toBe(false)
    expect(isEmptyBundle(await readBundle(reader({ 'htf.png': new Uint8Array([1]) })))).toBe(false)
  })
})

describe('BUNDLE_FILENAMES', () => {
  it('watches the six export files plus the two sidecars', () => {
    expect(BUNDLE_FILENAMES).toEqual([
      'htf.png',
      'tpo.png',
      'exec.png',
      'execution_bars.csv',
      'vbp_export.md',
      'delta_vbp_export.md',
      'mgi.json',
      'current_price.txt',
    ])
  })
})

describe('toFormData', () => {
  it('appends files under their field names and the scalar fields', async () => {
    const bundle = await readBundle(
      reader({ 'htf.png': new Uint8Array([1, 2, 3]), 'mgi.json': '{"a":1}', 'current_price.txt': '21050' }),
    )
    const form = toFormData(bundle)

    const htf = form.get('htf_png')
    expect(htf).toBeInstanceOf(Blob)
    expect((htf as File).name).toBe('htf.png')
    expect((htf as Blob).type).toBe('image/png')
    expect(form.get('mgi')).toBe('{"a":1}')
    expect(form.get('current_price')).toBe('21050')
  })

  it('omits scalar fields when the sidecars are absent', async () => {
    const form = toFormData(await readBundle(reader({ 'htf.png': new Uint8Array([1]) })))
    expect(form.get('mgi')).toBeNull()
    expect(form.get('current_price')).toBeNull()
  })
})
