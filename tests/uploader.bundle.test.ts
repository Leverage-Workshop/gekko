import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

/** Real export filenames Sierra writes (the `chart-data/` sample folder). */
const SAMPLE = {
  htf: 'htf_clean.png',
  tpo: 'tpo.png',
  exec: 'execution_clean.png',
  csv: 'execution_bar_data.rolling.csv',
  vbp: 'vbp_export.md',
  delta: 'delta_vbp_export.md',
  mgi: 'mgi_static_levels.json',
}

describe('readBundle', () => {
  it('collects every present file with its ingest field/content-type', async () => {
    const bundle = await readBundle(
      reader({
        [SAMPLE.htf]: new Uint8Array([1]),
        [SAMPLE.tpo]: new Uint8Array([2]),
        [SAMPLE.exec]: new Uint8Array([3]),
        [SAMPLE.csv]: 'DateTime,Open\n',
        [SAMPLE.vbp]: '# vbp',
        [SAMPLE.delta]: '# delta',
      }),
    )

    const fields = bundle.files.map((f) => f.field).sort()
    expect(fields).toEqual(
      ['delta_profile', 'exec_csv', 'exec_png', 'htf_png', 'tpo_png', 'vol_profile'].sort(),
    )
    const htf = bundle.files.find((f) => f.field === 'htf_png')
    expect(htf?.filename).toBe(SAMPLE.htf)
    expect(htf?.contentType).toBe('image/png')

    const csv = bundle.files.find((f) => f.field === 'exec_csv')
    expect(csv?.filename).toBe(SAMPLE.csv)
    expect(csv?.contentType).toBe('text/csv')
  })

  it('omits absent files and reads the mgi sidecar', async () => {
    const bundle = await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]), [SAMPLE.mgi]: '{"a":1}\n' }))

    expect(bundle.files).toHaveLength(1)
    expect(bundle.mgi).toBe('{"a":1}')
  })

  it('treats a blank mgi file as absent', async () => {
    const bundle = await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]), [SAMPLE.mgi]: '   \n' }))
    expect(bundle.mgi).toBeNull()
  })

  it('flags a bundle with no files and no mgi as empty', async () => {
    expect(isEmptyBundle(await readBundle(reader({})))).toBe(true)
    expect(isEmptyBundle(await readBundle(reader({ [SAMPLE.mgi]: '{}' })))).toBe(false)
    expect(isEmptyBundle(await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]) })))).toBe(false)
  })

  it('matches the real sample export folder (chart-data/)', async () => {
    const dir = join(process.cwd(), 'chart-data')
    const read: FileReader = async (filename) => {
      try {
        return new Uint8Array(await readFile(join(dir, filename)))
      } catch {
        return null
      }
    }

    const bundle = await readBundle(read)

    // Every ingest field is satisfied by a real file in the sample folder, and
    // the MGI sidecar is found — i.e. BUNDLE_FILENAMES matches reality.
    expect(bundle.files.map((f) => f.field).sort()).toEqual(
      ['delta_profile', 'exec_csv', 'exec_png', 'htf_png', 'tpo_png', 'vol_profile'].sort(),
    )
    expect(bundle.mgi).not.toBeNull()
  })
})

describe('BUNDLE_FILENAMES', () => {
  it('watches Sierra’s six export files plus the mgi JSON', () => {
    expect(BUNDLE_FILENAMES).toEqual([
      'htf_clean.png',
      'tpo.png',
      'execution_clean.png',
      'execution_bar_data.rolling.csv',
      'vbp_export.md',
      'delta_vbp_export.md',
      'mgi_static_levels.json',
    ])
  })
})

describe('toFormData', () => {
  it('appends files under their ingest field names and the mgi field', async () => {
    const bundle = await readBundle(
      reader({ [SAMPLE.htf]: new Uint8Array([1, 2, 3]), [SAMPLE.mgi]: '{"a":1}' }),
    )
    const form = toFormData(bundle)

    const htf = form.get('htf_png')
    expect(htf).toBeInstanceOf(Blob)
    expect((htf as File).name).toBe(SAMPLE.htf)
    expect((htf as Blob).type).toBe('image/png')
    expect(form.get('mgi')).toBe('{"a":1}')
    // current_price is no longer a form field — it's derived from the MGI on ingest.
    expect(form.get('current_price')).toBeNull()
  })

  it('omits the mgi field when the sidecar is absent', async () => {
    const form = toFormData(await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]) })))
    expect(form.get('mgi')).toBeNull()
  })
})
