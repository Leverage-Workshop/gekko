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
import { BUNDLE_ID_FIELD } from '@/lib/ingest'

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
  csv: 'execution_bar_data.globex.csv',
  csvRolling: 'execution_bar_data.rolling.csv',
  rotationVbp: 'four-hundred-rotation.vbp.md',
  balanceAreaVbp: 'balance-area.vbp.md',
  halfDelta: 'half-rotation-delta.vbp.md',
  fullDelta: 'full-rotation-delta.vbp.md',
  tpoData: 'tpo.data.md',
  dailyVa: 'daily-value-areas.csv',
  htfCsv: 'htf_bar_data.rolling.csv',
  jobStudy: 'job-study.json',
  fiveDayVbp: 'five-day-rolling.vbp.md',
  fourHourVbp: 'four-hour-rolling.vbp.md',
  mgi: 'mgi_static_levels.json',
}

/**
 * Job-planning input fields (feat-121). Their Sierra exporter (feat-118) is
 * operator-side and not yet deployed, so the `chart-data/` sample folder does
 * not carry these files yet — once feat-118 checks the samples in, fold them
 * into the sample-folder expectation below.
 */
const JOB_INPUT_FIELDS = ['five_day_vbp', 'four_hour_vbp', 'job_study']

const ALL_FIELDS = [
  'balance_area_vbp',
  'daily_va',
  'exec_csv',
  'exec_png',
  ...JOB_INPUT_FIELDS,
  'full_rotation_delta',
  'half_rotation_delta',
  'htf_csv',
  'htf_png',
  'rotation_vbp',
  'tpo_data',
  'tpo_png',
].sort()

const SAMPLE_FOLDER_FIELDS = ALL_FIELDS.filter((f) => !JOB_INPUT_FIELDS.includes(f))

describe('readBundle', () => {
  it('collects every present file with its ingest field/content-type', async () => {
    const bundle = await readBundle(
      reader({
        [SAMPLE.htf]: new Uint8Array([1]),
        [SAMPLE.tpo]: new Uint8Array([2]),
        [SAMPLE.exec]: new Uint8Array([3]),
        [SAMPLE.csv]: 'DateTime,Open\n',
        [SAMPLE.rotationVbp]: '# rotation vbp',
        [SAMPLE.balanceAreaVbp]: '# balance-area vbp',
        [SAMPLE.halfDelta]: '# half delta',
        [SAMPLE.fullDelta]: '# full delta',
        [SAMPLE.tpoData]: '# tpo data',
        [SAMPLE.dailyVa]: 'Date,POC\n',
        [SAMPLE.htfCsv]: 'DateTime,Open\n',
        [SAMPLE.jobStudy]: '{"meta":{}}',
        [SAMPLE.fiveDayVbp]: '# five-day vbp',
        [SAMPLE.fourHourVbp]: '# four-hour vbp',
      }),
    )

    const fields = bundle.files.map((f) => f.field).sort()
    expect(fields).toEqual(ALL_FIELDS)
    const htf = bundle.files.find((f) => f.field === 'htf_png')
    expect(htf?.filename).toBe(SAMPLE.htf)
    expect(htf?.contentType).toBe('image/png')

    const csv = bundle.files.find((f) => f.field === 'exec_csv')
    expect(csv?.filename).toBe(SAMPLE.csv)
    expect(csv?.contentType).toBe('text/csv')
  })

  it('ships the Job-planning inputs under their ingest fields (feat-121)', async () => {
    const bundle = await readBundle(
      reader({
        [SAMPLE.jobStudy]: '{"meta":{"schemaVersion":1}}',
        [SAMPLE.fiveDayVbp]: '# five-day vbp',
        [SAMPLE.fourHourVbp]: '# four-hour vbp',
      }),
    )

    expect(bundle.files.map((f) => f.field).sort()).toEqual(JOB_INPUT_FIELDS)
    const jobStudy = bundle.files.find((f) => f.field === 'job_study')
    expect(jobStudy?.filename).toBe(SAMPLE.jobStudy)
    expect(jobStudy?.contentType).toBe('application/json')
    for (const field of ['five_day_vbp', 'four_hour_vbp']) {
      expect(bundle.files.find((f) => f.field === field)?.contentType).toBe('text/markdown')
    }
  })

  it('prefers the globex exec export over the retired rolling export', async () => {
    const bundle = await readBundle(
      reader({ [SAMPLE.csv]: 'DateTime,Open\n1', [SAMPLE.csvRolling]: 'DateTime,Open\n2' }),
    )

    expect(bundle.files).toHaveLength(1)
    expect(bundle.files[0].field).toBe('exec_csv')
    expect(bundle.files[0].filename).toBe(SAMPLE.csv)
  })

  it('accepts the extensionless globex exec export name', async () => {
    const bundle = await readBundle(reader({ 'execution_bar_data.globex': 'DateTime,Open\n' }))

    expect(bundle.files).toHaveLength(1)
    expect(bundle.files[0].field).toBe('exec_csv')
    expect(bundle.files[0].filename).toBe('execution_bar_data.globex')
  })

  it('falls back to the rolling exec export when no globex file is present', async () => {
    const bundle = await readBundle(reader({ [SAMPLE.csvRolling]: 'DateTime,Open\n' }))

    expect(bundle.files).toHaveLength(1)
    expect(bundle.files[0].field).toBe('exec_csv')
    expect(bundle.files[0].filename).toBe(SAMPLE.csvRolling)
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

    // Every ingest field with a deployed exporter is satisfied by a real file in
    // the sample folder, and the MGI sidecar is found — i.e. BUNDLE_FILENAMES
    // matches reality. The Job-planning inputs are absent until feat-118 checks
    // its samples in (the uploader skips them rather than failing the bundle),
    // and may appear any time after — so they are allowed but not required.
    const found = bundle.files.map((f) => f.field).sort()
    expect(found.filter((f) => !JOB_INPUT_FIELDS.includes(f))).toEqual(SAMPLE_FOLDER_FIELDS)
    expect(found.every((f) => ALL_FIELDS.includes(f))).toBe(true)
    expect(bundle.mgi).not.toBeNull()
  })
})

describe('BUNDLE_FILENAMES', () => {
  it('watches every export filename candidate plus the mgi JSON', () => {
    expect(BUNDLE_FILENAMES).toEqual([
      'htf_clean.png',
      'tpo.png',
      'execution_clean.png',
      'execution_bar_data.globex.csv',
      'execution_bar_data.globex',
      'execution_bar_data.rolling.csv',
      'four-hundred-rotation.vbp.md',
      'balance-area.vbp.md',
      'half-rotation-delta.vbp.md',
      'full-rotation-delta.vbp.md',
      'tpo.data.md',
      'daily-value-areas.csv',
      'htf_bar_data.rolling.csv',
      'job-study.json',
      'five-day-rolling.vbp.md',
      'four-hour-rolling.vbp.md',
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

  it('carries the client-minted bundle id under the manifest field name', async () => {
    const bundle = await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]) }))
    const id = crypto.randomUUID()

    const form = toFormData(bundle, id)

    expect(form.get(BUNDLE_ID_FIELD)).toBe(id)
  })

  it('omits the bundle id field when no id is provided', async () => {
    const form = toFormData(await readBundle(reader({ [SAMPLE.htf]: new Uint8Array([1]) })))
    expect(form.get(BUNDLE_ID_FIELD)).toBeNull()
  })
})
