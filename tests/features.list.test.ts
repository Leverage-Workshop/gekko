import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { featureListPath, loadFeatureList } from '@/lib/features/featureList'

/**
 * Reader for the harness's feature_list.json, behind the dashboard's Features
 * tab. The last test parses the REAL file: it is hand-edited every session, and
 * a shape the reader rejects would blank the tab.
 */

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'gekko-features-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function write(name: string, contents: string): Promise<string> {
  const file = path.join(dir, name)
  await writeFile(file, contents, 'utf8')
  return file
}

describe('loadFeatureList', () => {
  it('maps records to rows and drops evidence — half the file, nothing renders it', async () => {
    const file = await write(
      'ok.json',
      JSON.stringify({
        features: [
          {
            id: 'feat-001',
            name: 'Scaffold',
            description: 'Next.js project',
            dependencies: [],
            status: 'done',
            evidence: 'a very long evidence blob',
          },
        ],
      })
    )

    const rows = await loadFeatureList(file)

    expect(rows).toEqual([
      {
        id: 'feat-001',
        name: 'Scaffold',
        status: 'done',
        dependencies: [],
        description: 'Next.js project',
      },
    ])
    expect(rows[0]).not.toHaveProperty('evidence')
  })

  it('keeps an unknown status and ignores extra keys — the file is hand-edited', async () => {
    const file = await write(
      'loose.json',
      JSON.stringify({
        features: [
          {
            id: 'feat-005',
            name: 'Supabase project',
            status: 'blocked-on-operator',
            // feat-005 really does carry an extra `live` object.
            live: { project_ref: 'abc', migrations_applied: ['init'] },
          },
        ],
      })
    )

    const rows = await loadFeatureList(file)

    expect(rows).toEqual([
      {
        id: 'feat-005',
        name: 'Supabase project',
        status: 'blocked-on-operator',
        dependencies: [],
        description: '',
      },
    ])
  })

  it('names the file when it is missing', async () => {
    const missing = path.join(dir, 'nope.json')
    await expect(loadFeatureList(missing)).rejects.toThrow(`Could not read ${missing}`)
  })

  it('names the file when the JSON is malformed', async () => {
    const file = await write('bad.json', '{ "features": [ ')
    await expect(loadFeatureList(file)).rejects.toThrow(`${file} is not valid JSON`)
  })

  it('rejects a record missing id or status', async () => {
    const file = await write('shape.json', JSON.stringify({ features: [{ name: 'No id' }] }))
    await expect(loadFeatureList(file)).rejects.toThrow(
      `${file} does not match the feature-list schema`
    )
  })

  it('parses the live feature_list.json with unique ids', async () => {
    const rows = await loadFeatureList(featureListPath())

    expect(rows.length).toBeGreaterThan(100)
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    expect(rows.every((row) => row.status.length > 0)).toBe(true)
  })
})
