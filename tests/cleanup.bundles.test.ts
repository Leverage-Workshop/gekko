import { describe, expect, it, vi } from 'vitest'
import {
  CLEANUP_BATCH_SIZE,
  cleanupBundles,
  collectObjectPaths,
  MAX_BATCHES_PER_RUN,
  REMOVE_CHUNK_SIZE,
  RETENTION_HOURS,
  type CleanupCandidate,
  type CleanupDeps,
} from '@/lib/cleanup'

const NOW = new Date('2026-07-18T18:00:00.000Z')

function candidate(id: string, refs: Record<string, string | null> = {}): CleanupCandidate {
  return { id, ...refs }
}

function fullCandidate(id: string): CleanupCandidate {
  return candidate(id, {
    htf_png_ref: `${id}/htf.png`,
    tpo_png_ref: `${id}/tpo.png`,
    exec_png_ref: `${id}/exec.png`,
    exec_csv_ref: `${id}/execution_bars.csv`,
    rotation_vbp_ref: `${id}/four-hundred-rotation.vbp.md`,
    balance_area_vbp_ref: `${id}/balance-area.vbp.md`,
    half_rotation_delta_ref: `${id}/half-rotation-delta.vbp.md`,
    full_rotation_delta_ref: `${id}/full-rotation-delta.vbp.md`,
  })
}

type DepsWithSpies = CleanupDeps & {
  removeObjects: ReturnType<typeof vi.fn>
  deleteBundleRows: ReturnType<typeof vi.fn>
  listUnusedBundles: ReturnType<typeof vi.fn>
}

/** Deps whose selection returns each batch in `batches` in order, then []. */
function makeDeps(batches: CleanupCandidate[][]): DepsWithSpies {
  let call = 0
  return {
    listUnusedBundles: vi.fn(async () => batches[call++] ?? []),
    removeObjects: vi.fn(async () => undefined),
    deleteBundleRows: vi.fn(async () => undefined),
    now: () => NOW,
  }
}

describe('collectObjectPaths', () => {
  it('groups refs into their manifest buckets (PNGs vs CSV/MD exports)', () => {
    const byBucket = collectObjectPaths([fullCandidate('b1')])
    expect(byBucket.get('chart-images')).toEqual([
      'b1/htf.png',
      'b1/tpo.png',
      'b1/exec.png',
    ])
    expect(byBucket.get('bundle-csvs')).toEqual([
      'b1/execution_bars.csv',
      'b1/four-hundred-rotation.vbp.md',
      'b1/balance-area.vbp.md',
      'b1/half-rotation-delta.vbp.md',
      'b1/full-rotation-delta.vbp.md',
    ])
  })

  it('skips null, empty, and absent refs (a bundle can be MGI-only)', () => {
    const byBucket = collectObjectPaths([
      candidate('b1', { htf_png_ref: null, exec_csv_ref: '' }),
      candidate('b2', { tpo_png_ref: 'b2/tpo.png' }),
    ])
    expect(byBucket.get('chart-images')).toEqual(['b2/tpo.png'])
    expect(byBucket.has('bundle-csvs')).toBe(false)
  })

  it('ignores non-manifest columns (id, received_at, mgi_json...)', () => {
    const byBucket = collectObjectPaths([
      { id: 'b1', received_at: '2026-07-17T00:00:00Z', current_price: null },
    ])
    expect(byBucket.size).toBe(0)
  })
})

describe('cleanupBundles', () => {
  it('does nothing when there are no candidates', async () => {
    const deps = makeDeps([])
    const result = await cleanupBundles(deps)
    expect(result).toMatchObject({
      deletedBundles: 0,
      deletedObjects: 0,
      batches: 0,
      truncated: false,
    })
    expect(deps.removeObjects).not.toHaveBeenCalled()
    expect(deps.deleteBundleRows).not.toHaveBeenCalled()
  })

  it('selects with a cutoff RETENTION_HOURS before now', async () => {
    const deps = makeDeps([])
    const result = await cleanupBundles(deps)
    const expectedCutoff = new Date(
      NOW.getTime() - RETENTION_HOURS * 60 * 60 * 1000,
    ).toISOString()
    expect(result.cutoffIso).toBe(expectedCutoff)
    expect(deps.listUnusedBundles).toHaveBeenCalledWith(
      expectedCutoff,
      CLEANUP_BATCH_SIZE,
    )
  })

  it('removes objects from both buckets BEFORE deleting the rows', async () => {
    const order: string[] = []
    const deps = makeDeps([[fullCandidate('b1'), fullCandidate('b2')]])
    deps.removeObjects.mockImplementation(async (bucket: string) => {
      order.push(`remove:${bucket}`)
    })
    deps.deleteBundleRows.mockImplementation(async () => {
      order.push('delete-rows')
    })

    const result = await cleanupBundles(deps)

    expect(order).toEqual(['remove:chart-images', 'remove:bundle-csvs', 'delete-rows'])
    expect(deps.deleteBundleRows).toHaveBeenCalledWith(['b1', 'b2'])
    expect(result).toMatchObject({
      deletedBundles: 2,
      deletedObjects: 16,
      batches: 1,
      truncated: false,
    })
  })

  it('chunks storage removal to at most REMOVE_CHUNK_SIZE paths per call', async () => {
    // 60 full candidates → 180 chart-image paths → 2 chunks; 300 csv → 3 chunks.
    const many = Array.from({ length: 60 }, (_, i) => fullCandidate(`b${i}`))
    const deps = makeDeps([many])

    await cleanupBundles(deps)

    for (const [, paths] of deps.removeObjects.mock.calls) {
      expect(paths.length).toBeLessThanOrEqual(REMOVE_CHUNK_SIZE)
    }
    const chartCalls = deps.removeObjects.mock.calls.filter(
      ([bucket]) => bucket === 'chart-images',
    )
    const csvCalls = deps.removeObjects.mock.calls.filter(
      ([bucket]) => bucket === 'bundle-csvs',
    )
    expect(chartCalls.map(([, p]) => p.length)).toEqual([100, 80])
    expect(csvCalls.map(([, p]) => p.length)).toEqual([100, 100, 100])
  })

  it('keeps draining full batches and stops after a short one', async () => {
    const full = Array.from({ length: CLEANUP_BATCH_SIZE }, (_, i) =>
      candidate(`a${i}`, { htf_png_ref: `a${i}/htf.png` }),
    )
    const short = [candidate('z1', { htf_png_ref: 'z1/htf.png' })]
    const deps = makeDeps([full, short])

    const result = await cleanupBundles(deps)

    expect(deps.listUnusedBundles).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      deletedBundles: CLEANUP_BATCH_SIZE + 1,
      deletedObjects: CLEANUP_BATCH_SIZE + 1,
      batches: 2,
      truncated: false,
    })
  })

  it('caps a run at MAX_BATCHES_PER_RUN and reports truncation', async () => {
    const full = Array.from({ length: CLEANUP_BATCH_SIZE }, (_, i) =>
      candidate(`c${i}`),
    )
    const deps = makeDeps(Array.from({ length: MAX_BATCHES_PER_RUN + 5 }, () => full))

    const result = await cleanupBundles(deps)

    expect(result.batches).toBe(MAX_BATCHES_PER_RUN)
    expect(result.truncated).toBe(true)
    expect(result.deletedBundles).toBe(MAX_BATCHES_PER_RUN * CLEANUP_BATCH_SIZE)
  })

  it('aborts without deleting rows when object removal fails (rows retry next run)', async () => {
    const deps = makeDeps([[fullCandidate('b1')]])
    deps.removeObjects.mockRejectedValue(new Error('storage down'))

    await expect(cleanupBundles(deps)).rejects.toThrow('storage down')
    expect(deps.deleteBundleRows).not.toHaveBeenCalled()
  })
})
