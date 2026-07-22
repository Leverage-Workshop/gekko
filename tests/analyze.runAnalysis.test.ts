import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Briefing } from '@/knowledge/schema/briefing.schema'
import {
  computeEngineFacts,
  loadDoctrine,
  runAnalysis,
} from '@/lib/analyze'
import type { AnalyzeDeps, BriefingInsert, EntryLevelInsert } from '@/lib/analyze'
import type { GenerateStructuredResult } from '@/lib/llm'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'

const read = (name: string) => readFileSync(join(process.cwd(), 'chart-data', name), 'utf-8')

const rotationVbpContent = read('four-hundred-rotation.vbp.md')
const balanceAreaVbpContent = read('balance-area.vbp.md')
const halfRotationDeltaContent = read('half-rotation-delta.vbp.md')
const fullRotationDeltaContent = read('full-rotation-delta.vbp.md')
const execCsvContent = read('execution_bar_data.rolling.csv')
const mgi = JSON.parse(read('mgi_static_levels.json')) as MgiStaticLevels

const NOW = new Date('2026-06-16T16:00:00Z')

const facts = computeEngineFacts({
  rotationVbpContent,
  balanceAreaVbpContent,
  halfRotationDeltaContent,
  fullRotationDeltaContent,
  execCsvContent,
  mgi,
  receivedAt: NOW.toISOString(),
  now: NOW,
})

/** A model answer that echoes the engine terrain exactly, as instructed. */
function modelBriefing(): Briefing {
  return {
    meta: {
      createdAt: NOW.toISOString(),
      triggerReason: 'manual',
      currentPrice: facts.currentPrice,
      htfTrend: 'up — higher highs on the planning chart',
      ripStatus: facts.ripStatus?.condition ?? 'unknown',
    },
    overview: {
      currentPosition: ['above the Rip'],
      structuralArchitecture: ['balance over the POC shelf'],
      orderFlowContext: ['blue initiative holding'],
      keyInflections: [{ level: facts.profileSummary.rotation.pocPrice, why: 'POC magnet' }],
    },
    terrain: {
      zones: facts.terrain.zones.map((zone) => ({
        color: zone.volumeClass === 'void' ? 'red' : 'blue',
        top: zone.top,
        bottom: zone.bottom,
        label: zone.label,
      })),
      levels: facts.terrain.levels.map((verdict) => ({
        price: verdict.level.price,
        label: verdict.level.label,
        kind: verdict.kind,
      })),
    },
    primary: {
      macroGoal: 'Long the shelf reclaim',
      rationale: 'Absorption at the wall',
      direction: 'long',
      entries: [{ label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' }],
      stops: [{ label: 'Stop', price: 30240, invalidation: 'lost the shelf' }],
      targets: [{ label: 'T1', price: 30280, description: 'next trench' }],
      rr: 1, // wrong on purpose — engine must overwrite
    },
    secondary: {
      macroGoal: 'Fade the poor high',
      rationale: 'Exhaustion at the border',
      direction: 'short',
      entries: [{ label: 'Entry A', price: 30295, trigger: 'exhaustion' }],
      stops: [{ label: 'Stop', price: 30302, invalidation: 'acceptance above' }],
      targets: [{ label: 'T1', price: 30260, description: 'value mid' }],
      rr: 1,
    },
    dangerZones: [{ area: 'mid-value', why: 'no edge in the middle' }],
  }
}

type GenerateParams = Parameters<NonNullable<AnalyzeDeps['generate']>>[0]

function makeDeps(overrides: Partial<AnalyzeDeps> = {}) {
  const calls: string[] = []
  let captured: GenerateParams | undefined
  let briefingRow: BriefingInsert | undefined
  let entryRows: EntryLevelInsert[] = []

  const encoder = new TextEncoder()
  const objects: Record<string, Uint8Array> = {
    'b1/four-hundred-rotation.vbp.md': encoder.encode(rotationVbpContent),
    'b1/balance-area.vbp.md': encoder.encode(balanceAreaVbpContent),
    'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
    'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
    'b1/execution_bars.csv': encoder.encode(execCsvContent),
    'b1/htf.png': encoder.encode('png-bytes'),
  }

  const deps: AnalyzeDeps = {
    fetchConfig: async () => ({ model_id: 'test/model-x', rr_min: 3 }),
    fetchLatestBundle: async () => ({
      id: 'b1',
      received_at: NOW.toISOString(),
      mgi_json: mgi,
      current_price: facts.currentPrice,
      is_stale: false,
      exec_csv_ref: 'b1/execution_bars.csv',
      rotation_vbp_ref: 'b1/four-hundred-rotation.vbp.md',
      balance_area_vbp_ref: 'b1/balance-area.vbp.md',
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
    generate: async (params) => {
      calls.push('generate')
      captured = params
      return {
        object: modelBriefing(),
        model: params.model,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        } as GenerateStructuredResult<Briefing>['usage'],
        cost: 0.0421,
        cachedInputTokens: 4200,
        latencyMs: 1234,
      }
    },
    loadDoctrine: () => 'DOCTRINE PREFIX',
    now: () => NOW,
    insertBriefing: async (row) => {
      calls.push('insertBriefing')
      briefingRow = row
      return { id: 'briefing-1' }
    },
    deactivateEntryLevels: async () => {
      calls.push('deactivate')
    },
    insertEntryLevels: async (rows) => {
      calls.push('insertEntryLevels')
      entryRows = rows
    },
    ...overrides,
  }

  return {
    deps,
    calls,
    getCaptured: () => captured,
    getBriefingRow: () => briefingRow,
    getEntryRows: () => entryRows,
  }
}

describe('runAnalysis', () => {
  it('runs bundle → engine → LLM → validate → persist end to end', async () => {
    const harness = makeDeps()
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.calls).toEqual([
      'generate',
      'insertBriefing',
      'insertEntryLevels',
      'deactivate',
    ])
    expect(result.briefingId).toBe('briefing-1')
    expect(result.bundleId).toBe('b1')
    expect(result.model).toBe('test/model-x')
    expect(result.cost).toBe(0.0421)
    expect(result.cachedInputTokens).toBe(4200)
    expect(result.latencyMs).toBe(1234)
    expect(result.stale).toBe(false)
    expect(result.entryLevelCount).toBe(2)
  })

  it('drives the LLM call from config, doctrine and the bundle', async () => {
    const harness = makeDeps()
    await runAnalysis(harness.deps, { triggerReason: 'manual' })
    const captured = harness.getCaptured()!

    expect(captured.model).toBe('test/model-x')
    expect(captured.system).toBe('DOCTRINE PREFIX')
    expect(captured.cacheSystem).toBe(true)
    expect(captured.telemetry).toEqual({ functionId: 'analyze-task' })
    expect(captured.images).toHaveLength(1)
    expect(captured.prompt).toContain('# Engine facts (authoritative)')
    expect(captured.prompt).toContain('# Raw MGI static levels')
    expect(captured.prompt).toContain(`meta.currentPrice = ${facts.currentPrice}`)
    expect(captured.prompt).toContain('Image 1: HTF planning chart')
  })

  it('persists the engine-recomputed rr, not the model claim', async () => {
    const harness = makeDeps()
    await runAnalysis(harness.deps, { triggerReason: 'manual' })
    const row = harness.getBriefingRow()!

    expect(row.model_id).toBe('test/model-x')
    expect(row.primary_obj.rr).toBe(3)
    expect(row.raw_model_json.primary.rr).toBe(3)
    expect(harness.getEntryRows().map((r) => r.label)).toEqual([
      'Entry A (Ideal)',
      'Entry A',
    ])
  })

  it('overwrites code-owned meta the model drifted on', async () => {
    const harness = makeDeps({
      generate: async (params) => ({
        object: {
          ...modelBriefing(),
          meta: {
            createdAt: '1999-01-01T00:00:00Z',
            triggerReason: 'wrong-reason',
            currentPrice: 12345,
            htfTrend: 'up — higher highs on the planning chart',
            ripStatus: 'bogus condition',
          },
        },
        model: params.model,
        usage: {} as GenerateStructuredResult<Briefing>['usage'],
        cost: null,
        cachedInputTokens: null,
        latencyMs: 0,
      }),
    })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })
    const row = harness.getBriefingRow()!

    expect(row.raw_model_json.meta.createdAt).toBe(NOW.toISOString())
    expect(row.raw_model_json.meta.currentPrice).toBe(facts.currentPrice)
    expect(row.raw_model_json.meta.triggerReason).toBe('manual')
    expect(row.raw_model_json.meta.ripStatus).toBe(facts.ripStatus!.condition)
    expect(row.rip_status).toBe(facts.ripStatus!.condition)
    expect(result.warnings.some((w) => w.includes('meta.createdAt'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.currentPrice'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.triggerReason'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('meta.ripStatus'))).toBe(true)
  })

  it('surfaces staleness and missing-chart warnings without failing', async () => {
    const harness = makeDeps({
      now: () => new Date('2026-06-16T17:00:00Z'),
    })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(result.stale).toBe(true)
    expect(result.warnings.some((w) => w.includes('TPO'))).toBe(true)
    expect(harness.getCaptured()!.prompt).toContain('STALE DATA')
  })

  it('falls back to code defaults when the config row is missing', async () => {
    const harness = makeDeps({ fetchConfig: async () => null })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('anthropic/claude-sonnet-5')
    expect(result.warnings.some((w) => w.includes('config row missing'))).toBe(true)
  })

  it('routes to the high-conviction model when the flag is on (feat-031)', async () => {
    const harness = makeDeps({
      fetchConfig: async () => ({
        model_id: 'test/model-x',
        rr_min: 3,
        high_conviction_enabled: true,
        high_conviction_model_id: 'test/opus-hc',
      }),
    })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('test/opus-hc')
    expect(result.model).toBe('test/opus-hc')
    expect(result.highConviction).toBe(true)
  })

  it('stays on model_id when the high-conviction flag is off', async () => {
    const harness = makeDeps({
      fetchConfig: async () => ({
        model_id: 'test/model-x',
        rr_min: 3,
        high_conviction_enabled: false,
        high_conviction_model_id: 'test/opus-hc',
      }),
    })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('test/model-x')
    expect(result.highConviction).toBe(false)
  })

  it('treats a pre-migration config read (no high-conviction fields) as flag off', async () => {
    // Default makeDeps fetchConfig returns only { model_id, rr_min } — the
    // shape lib/analyze/deps.ts produces before the migration is applied.
    const harness = makeDeps()
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('test/model-x')
    expect(result.highConviction).toBe(false)
  })

  it('falls back to model_id with a warning when the flag is on but the id is blank', async () => {
    const harness = makeDeps({
      fetchConfig: async () => ({
        model_id: 'test/model-x',
        rr_min: 3,
        high_conviction_enabled: true,
        high_conviction_model_id: '',
      }),
    })
    const result = await runAnalysis(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('test/model-x')
    expect(result.highConviction).toBe(false)
    expect(
      result.warnings.some((w) => w.includes('high_conviction_model_id is empty')),
    ).toBe(true)
  })

  it('rejects a model briefing whose zones break the No-Gap invariant', async () => {
    const harness = makeDeps({
      generate: async (params) => {
        const bad = modelBriefing()
        return {
          object: {
            ...bad,
            terrain: {
              ...bad.terrain,
              zones: [
                { color: 'red', top: 30300, bottom: 30260, label: 'A' },
                { color: 'blue', top: 30250, bottom: 30200, label: 'B' },
              ],
            },
          },
          model: params.model,
          usage: {} as GenerateStructuredResult<Briefing>['usage'],
          cost: null,
          cachedInputTokens: null,
          latencyMs: 0,
        }
      },
    })
    await expect(runAnalysis(harness.deps, { triggerReason: 'manual' })).rejects.toThrow(
      /No-Gap/,
    )
  })
})

describe('loadDoctrine', () => {
  it('assembles the persona, constraints and doctrine files', () => {
    const doctrine = loadDoctrine('analyze')
    expect(doctrine).toContain('Gekko')
    expect(doctrine).toContain('Magnet Prohibition')
    expect(doctrine).toContain('# Chart Reading')
    expect(doctrine).toContain('# MGI Glossary')
  })

  it('gives each task only its own output contract', () => {
    const analyze = loadDoctrine('analyze')
    expect(analyze).toContain('`Briefing`')
    expect(analyze).toContain('# The `Objective` Contract')
    expect(analyze).not.toContain('`BriefingUpdate`')
    expect(analyze).not.toContain('`EvalResult`')

    const update = loadDoctrine('update')
    expect(update).toContain('`BriefingUpdate`')
    expect(update).toContain('# The `Objective` Contract')
    expect(update).not.toContain('# Output Contract — `Briefing`\n')
    expect(update).not.toContain('`EvalResult`')

    const evalDoctrine = loadDoctrine('eval')
    expect(evalDoctrine).toContain('`EvalResult`')
    expect(evalDoctrine).not.toContain('`BriefingUpdate`')
    expect(evalDoctrine).not.toContain('# The `Objective` Contract')
  })

  it('keeps each per-task prefix deterministic (prompt-cache stability)', () => {
    expect(loadDoctrine('analyze')).toBe(loadDoctrine('analyze'))
    expect(loadDoctrine('update')).toBe(loadDoctrine('update'))
    expect(loadDoctrine('eval')).toBe(loadDoctrine('eval'))
  })
})
