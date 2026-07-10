import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalResult } from '@/knowledge/schema/briefing.schema'
import type {
  EntryLevelRow,
  EvalDeps,
  EvalResultInsert,
} from '@/lib/eval'
import { EvalInputError, runEval } from '@/lib/eval'
import type { GenerateStructuredResult } from '@/lib/llm'

const execCsvContent = readFileSync(
  join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv'),
  'utf-8',
)
const mgi = JSON.parse(
  readFileSync(join(process.cwd(), 'chart-data/mgi_static_levels.json'), 'utf-8'),
)

const NOW = new Date('2026-06-16T16:00:00Z')
const CURRENT_PRICE = 30250

/** Two active levels: one near the current price, one far above it. */
function activeLevels(): EntryLevelRow[] {
  return [
    {
      id: 'lvl-near',
      briefing_id: 'brief-1',
      objective: 'primary',
      label: 'Entry A (Ideal)',
      price: 30245,
      direction: 'long',
      stop: 30235,
      targets: [30280, 30310],
    },
    {
      id: 'lvl-far',
      briefing_id: 'brief-1',
      objective: 'secondary',
      label: 'Entry B',
      price: 30400,
      direction: 'short',
      stop: 30412,
      targets: [30350],
    },
  ]
}

/** A model answer that evaluates the near level, as instructed. */
function modelEval(): EvalResult {
  return {
    meta: {
      createdAt: NOW.toISOString(),
      currentPrice: CURRENT_PRICE,
      nearEntry: true,
      zone: 'upper value shelf',
    },
    status: 'ENTER',
    evaluatedLevel: { label: 'Entry A (Ideal)', price: 30245, direction: 'long' },
    direction: 'long',
    trigger: 'absorption at the LVN border with blue continuation',
    stop: 30235,
    targets: [30280, 30310],
    reason: 'Absorption at the border, positive delta confirming the long.',
  }
}

type GenerateParams = Parameters<NonNullable<EvalDeps['generate']>>[0]

function makeDeps(overrides: Partial<EvalDeps> = {}) {
  const calls: string[] = []
  let captured: GenerateParams | undefined
  let insertedRow: EvalResultInsert | undefined

  const encoder = new TextEncoder()
  // No profile-export objects: the eval-task's exec-only load never downloads
  // them, even when the refs exist on the row.
  const objects: Record<string, Uint8Array> = {
    'b1/execution_bars.csv': encoder.encode(execCsvContent),
    'b1/htf.png': encoder.encode('png-bytes'),
  }

  const deps: EvalDeps = {
    fetchConfig: async () => ({ triage_model_id: 'test/triage-y' }),
    fetchLatestBundle: async () => ({
      id: 'b1',
      received_at: NOW.toISOString(),
      mgi_json: mgi,
      current_price: CURRENT_PRICE,
      is_stale: false,
      exec_csv_ref: 'b1/execution_bars.csv',
      rotation_vbp_ref: 'b1/four-hundred-rotation.vbp.md',
      five_day_vbp_ref: 'b1/rolling-five-day.vbp.md',
      half_rotation_delta_ref: 'b1/half-rotation-delta.vbp.md',
      full_rotation_delta_ref: 'b1/full-rotation-delta.vbp.md',
      htf_png_ref: 'b1/htf.png',
      tpo_png_ref: null,
      exec_png_ref: null,
    }),
    downloadObject: async (_bucket, path) => {
      const bytes = objects[path]
      if (!bytes) throw new Error(`missing ${path}`)
      return bytes
    },
    fetchActiveEntryLevels: async () => {
      calls.push('fetchActiveEntryLevels')
      return activeLevels()
    },
    generate: async (params) => {
      calls.push('generate')
      captured = params
      return {
        object: modelEval(),
        model: params.model,
        usage: {
          inputTokens: 40,
          outputTokens: 20,
          totalTokens: 60,
        } as GenerateStructuredResult<EvalResult>['usage'],
        cost: 0.0012,
        cachedInputTokens: 2100,
        latencyMs: 456,
      }
    },
    loadDoctrine: () => 'DOCTRINE PREFIX',
    now: () => NOW,
    insertEvalResult: async (row) => {
      calls.push('insertEvalResult')
      insertedRow = row
      return { id: 'eval-1' }
    },
    ...overrides,
  }

  return {
    deps,
    calls,
    getCaptured: () => captured,
    getInsertedRow: () => insertedRow,
  }
}

describe('runEval', () => {
  it('runs bundle → active levels → proximity → LLM → persist end to end', async () => {
    const harness = makeDeps()
    const result = await runEval(harness.deps)

    expect(harness.calls).toEqual([
      'fetchActiveEntryLevels',
      'generate',
      'insertEvalResult',
    ])
    expect(result.evalResultId).toBe('eval-1')
    expect(result.bundleId).toBe('b1')
    expect(result.model).toBe('test/triage-y')
    expect(result.cost).toBe(0.0012)
    expect(result.cachedInputTokens).toBe(2100)
    expect(result.latencyMs).toBe(456)
    expect(result.stale).toBe(false)
    expect(result.status).toBe('ENTER')
    expect(result.nearEntry).toBe(true)
  })

  it('drives the LLM call from the triage config, doctrine and the bundle', async () => {
    const harness = makeDeps()
    await runEval(harness.deps)
    const captured = harness.getCaptured()!

    expect(captured.model).toBe('test/triage-y')
    expect(captured.system).toBe('DOCTRINE PREFIX')
    expect(captured.telemetry).toEqual({ functionId: 'eval-task' })
    expect(captured.cacheSystem).toBe(true)
    expect(captured.images).toHaveLength(1)
    expect(captured.prompt).toContain('# Eval decision logic (doctrine)')
    expect(captured.prompt).toContain('# Active entry levels (from the prior briefing)')
    expect(captured.prompt).toContain('# Delta telemetry')
    expect(captured.prompt).toContain(`meta.currentPrice = ${CURRENT_PRICE}`)
    expect(captured.prompt).toContain('Price IS near an active entry')
    expect(captured.prompt).toContain('"Entry A (Ideal)"')
    expect(captured.prompt).toContain('Image 1: HTF planning chart')
  })

  it('maps the evaluated level to its entry_levels id and persists the row', async () => {
    const harness = makeDeps()
    await runEval(harness.deps)
    const row = harness.getInsertedRow()!

    expect(row.bundle_id).toBe('b1')
    expect(row.model_id).toBe('test/triage-y')
    expect(row.status).toBe('ENTER')
    expect(row.near_entry).toBe(true)
    expect(row.evaluated_level_id).toBe('lvl-near')
    expect(row.direction).toBe('long')
    expect(row.stop).toBe(30235)
    expect(row.targets).toEqual([30280, 30310])
    expect(row.current_price).toBe(CURRENT_PRICE)
    expect(row.raw_model_json).toEqual(modelEval())
  })

  it('coerces a level verdict to NO_ENTRY_NEAR when code says no entry is near', async () => {
    // Price far from every active level: the gate is closed regardless of the
    // model's claim (it still answers ENTER here — code wins).
    const harness = makeDeps({
      fetchLatestBundle: async () => ({
        id: 'b1',
        received_at: NOW.toISOString(),
        mgi_json: mgi,
        current_price: 31000,
        is_stale: false,
        exec_csv_ref: 'b1/execution_bars.csv',
        rotation_vbp_ref: 'b1/four-hundred-rotation.vbp.md',
        five_day_vbp_ref: 'b1/rolling-five-day.vbp.md',
        half_rotation_delta_ref: 'b1/half-rotation-delta.vbp.md',
        full_rotation_delta_ref: 'b1/full-rotation-delta.vbp.md',
        htf_png_ref: 'b1/htf.png',
        tpo_png_ref: null,
        exec_png_ref: null,
      }),
    })
    const result = await runEval(harness.deps)
    const row = harness.getInsertedRow()!

    expect(harness.getCaptured()!.prompt).toContain('Price is NOT near any active entry')
    expect(result.status).toBe('NO_ENTRY_NEAR')
    expect(result.nearEntry).toBe(false)
    expect(row.status).toBe('NO_ENTRY_NEAR')
    expect(row.near_entry).toBe(false)
    expect(row.evaluated_level_id).toBeNull()
    expect(row.direction).toBeNull()
    expect(row.stop).toBeNull()
    // The model's uncoerced answer stays auditable.
    expect(row.raw_model_json.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to NO_ENTRY_NEAR'))).toBe(true)
  })

  it('skips the LLM call entirely when no active entry levels exist', async () => {
    const harness = makeDeps({ fetchActiveEntryLevels: async () => [] })
    const result = await runEval(harness.deps)
    const row = harness.getInsertedRow()!

    // The overridden fetchActiveEntryLevels bypasses call tracking; the point
    // is that `generate` never ran and the row was still persisted.
    expect(harness.calls).toEqual(['insertEvalResult'])
    expect(result.model).toBeNull()
    expect(result.usage).toBeNull()
    expect(result.cost).toBeNull()
    expect(result.cachedInputTokens).toBeNull()
    expect(result.latencyMs).toBeNull()
    expect(result.status).toBe('NO_ENTRY_NEAR')
    expect(row.model_id).toBeNull()
    expect(row.status).toBe('NO_ENTRY_NEAR')
    expect(row.evaluated_level_id).toBeNull()
    expect(result.warnings.some((w) => w.includes('no active entry_levels'))).toBe(true)
  })

  it('falls back to the default triage model when the config row is missing', async () => {
    const harness = makeDeps({ fetchConfig: async () => null })
    const result = await runEval(harness.deps)

    expect(harness.getCaptured()!.model).toBe('anthropic/claude-haiku-4-5')
    expect(result.warnings.some((w) => w.includes('config row missing'))).toBe(true)
  })

  it('flags staleness in the result and the prompt without failing', async () => {
    const harness = makeDeps({ now: () => new Date('2026-06-16T17:00:00Z') })
    const result = await runEval(harness.deps)

    expect(result.stale).toBe(true)
    expect(harness.getCaptured()!.prompt).toContain('STALE DATA')
    expect(result.warnings.some((w) => w.includes('STALE'))).toBe(true)
  })

  it('overwrites code-owned meta facts the model drifted on', async () => {
    const harness = makeDeps({
      generate: async (params) => ({
        object: {
          ...modelEval(),
          meta: {
            createdAt: '1999-01-01T00:00:00Z',
            currentPrice: 12345,
            nearEntry: false,
            zone: 'upper value shelf',
          },
        },
        model: params.model,
        usage: {} as GenerateStructuredResult<EvalResult>['usage'],
        cost: null,
        cachedInputTokens: null,
        latencyMs: 0,
      }),
    })
    const result = await runEval(harness.deps)
    const persisted = harness.getInsertedRow()!

    expect(persisted.current_price).toBe(CURRENT_PRICE)
    expect(persisted.near_entry).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.nearEntry'))).toBe(true)
  })

  it('tolerates a bundle missing the profile exports (exec-only load)', async () => {
    const harness = makeDeps({
      fetchLatestBundle: async () => ({
        id: 'b1',
        received_at: NOW.toISOString(),
        mgi_json: mgi,
        current_price: CURRENT_PRICE,
        is_stale: false,
        exec_csv_ref: 'b1/execution_bars.csv',
        rotation_vbp_ref: null,
        five_day_vbp_ref: null,
        half_rotation_delta_ref: null,
        full_rotation_delta_ref: null,
        htf_png_ref: 'b1/htf.png',
        tpo_png_ref: null,
        exec_png_ref: null,
      }),
    })
    const result = await runEval(harness.deps)

    expect(result.evalResultId).toBe('eval-1')
    expect(result.status).toBe('ENTER')
    expect(result.nearEntry).toBe(true)
  })

  it('prefers an exact label match when two active levels share a border price', async () => {
    // Primary and secondary objectives sharing a border price: price+direction
    // alone is ambiguous, so the echoed label must break the tie.
    const shared: EntryLevelRow[] = [
      { ...activeLevels()[0], id: 'lvl-primary', label: 'Entry A (Ideal)' },
      {
        ...activeLevels()[0],
        id: 'lvl-secondary',
        objective: 'secondary',
        label: 'Entry B (Border)',
      },
    ]
    const harness = makeDeps({
      fetchActiveEntryLevels: async () => shared,
      generate: async (params) => ({
        object: {
          ...modelEval(),
          evaluatedLevel: { label: 'Entry B (Border)', price: 30245, direction: 'long' },
        },
        model: params.model,
        usage: {} as GenerateStructuredResult<EvalResult>['usage'],
        cost: null,
        cachedInputTokens: null,
        latencyMs: 0,
      }),
    })
    await runEval(harness.deps)

    expect(harness.getInsertedRow()!.evaluated_level_id).toBe('lvl-secondary')
  })

  it('persists a null evaluated_level_id when the echoed level matches nothing', async () => {
    // 30260 short: wrong direction for lvl-near, wrong price for lvl-far — the
    // FK must stay null rather than point at a row the persisted columns
    // (the model's direction/trigger/stop/targets) do not describe.
    const harness = makeDeps({
      generate: async (params) => ({
        object: {
          ...modelEval(),
          evaluatedLevel: { label: 'Ghost Entry', price: 30260, direction: 'short' },
        },
        model: params.model,
        usage: {} as GenerateStructuredResult<EvalResult>['usage'],
        cost: null,
        cachedInputTokens: null,
        latencyMs: 0,
      }),
    })
    const result = await runEval(harness.deps)
    const row = harness.getInsertedRow()!

    expect(row.evaluated_level_id).toBeNull()
    expect(
      result.warnings.some((w) => w.includes('matches no active entry level')),
    ).toBe(true)
  })

  it('rejects a bundle without a current price', async () => {
    const harness = makeDeps({
      fetchLatestBundle: async () => ({
        id: 'b1',
        received_at: NOW.toISOString(),
        mgi_json: mgi,
        current_price: null,
        is_stale: false,
        exec_csv_ref: 'b1/execution_bars.csv',
        rotation_vbp_ref: 'b1/four-hundred-rotation.vbp.md',
        five_day_vbp_ref: 'b1/rolling-five-day.vbp.md',
        half_rotation_delta_ref: 'b1/half-rotation-delta.vbp.md',
        full_rotation_delta_ref: 'b1/full-rotation-delta.vbp.md',
        htf_png_ref: null,
        tpo_png_ref: null,
        exec_png_ref: null,
      }),
    })
    await expect(runEval(harness.deps)).rejects.toThrow(EvalInputError)
  })
})
