import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Briefing, BriefingUpdate } from '@/knowledge/schema/briefing.schema'
import { computeEngineFacts } from '@/lib/analyze'
import type { BriefingInsert, EntryLevelInsert } from '@/lib/analyze'
import { UpdateInputError, runUpdate } from '@/lib/update'
import type { UpdateDeps } from '@/lib/update'
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
const PARENT_CREATED_AT = '2026-06-16T14:30:00Z' // 90 min before NOW

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

/** A parent briefing whose terrain echoes the engine stack (a real enforced row). */
function parentBriefing(): Briefing {
  return {
    meta: {
      createdAt: PARENT_CREATED_AT,
      triggerReason: 'manual',
      currentPrice: facts.currentPrice,
      htfTrend: 'up — higher highs on the planning chart',
      ripStatus: facts.ripStatus?.condition ?? 'unknown',
    },
    overview: {
      currentPosition: ['PARENT: above the Rip', 'PARENT: inside upper value'],
      structuralArchitecture: ['PARENT: balance over the POC shelf', 'PARENT: void below the shelf'],
      orderFlowContext: ['PARENT: blue initiative holding', 'PARENT: no playbook pattern'],
      keyInflections: [{ level: facts.profileSummary.rotation.pocPrice, why: 'POC magnet' }],
    },
    terrain: {
      zones: facts.terrain.zones.map((zone) => ({
        color: 'blue',
        top: zone.top,
        bottom: zone.bottom,
        label: `PARENT ${zone.label}`,
      })),
      levels: facts.terrain.levels.map((verdict) => ({
        price: verdict.level.price,
        label: verdict.level.label,
        kind: verdict.kind,
      })),
    },
    primary: {
      macroGoal: 'PARENT primary',
      rationale: 'stale',
      direction: 'long',
      entries: [{ label: 'E1', price: 30250, trigger: 'old' }],
      stops: [{ label: 'S1', price: 30240, invalidation: 'old' }],
      targets: [{ label: 'T1', price: 30280, description: 'old' }],
      rr: 3,
    },
    secondary: {
      macroGoal: 'PARENT secondary',
      rationale: 'stale',
      direction: 'short',
      entries: [{ label: 'E1', price: 30295, trigger: 'old' }],
      stops: [{ label: 'S1', price: 30302, invalidation: 'old' }],
      targets: [{ label: 'T1', price: 30260, description: 'old' }],
      rr: 5,
    },
    dangerZones: [{ area: 'PARENT danger', why: 'old' }],
  }
}

/** The model's update answer: fresh objectives + tactical read, no overview/terrain. */
function modelUpdate(): BriefingUpdate {
  return {
    meta: {
      createdAt: NOW.toISOString(),
      triggerReason: 'manual',
      currentPrice: facts.currentPrice,
      htfTrend: 'up — still trending',
      ripStatus: facts.ripStatus?.condition ?? 'unknown',
    },
    tacticalRead: {
      location: 'Upper value, wall overhead',
      ripStatus: 'Holding as support',
      initiative: 'Buyers on sustained positive delta',
    },
    primary: {
      macroGoal: 'FRESH long the shelf reclaim',
      rationale: 'absorption held through the session',
      direction: 'long',
      entries: [{ label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' }],
      stops: [{ label: 'Stop', price: 30240, invalidation: 'lost the shelf' }],
      targets: [{ label: 'T1', price: 30280, description: 'next trench' }],
      rr: 1, // wrong on purpose — engine must overwrite
    },
    secondary: {
      macroGoal: 'FRESH fade the poor high',
      rationale: 'exhaustion at the border',
      direction: 'short',
      entries: [{ label: 'Entry A', price: 30295, trigger: 'exhaustion' }],
      stops: [{ label: 'Stop', price: 30302, invalidation: 'acceptance above' }],
      targets: [{ label: 'T1', price: 30260, description: 'value mid' }],
      rr: 1,
    },
    dangerZones: [{ area: 'FRESH mid-value', why: 'no edge in the middle' }],
  }
}

type GenerateParams = Parameters<NonNullable<UpdateDeps['generate']>>[0]

function makeDeps(overrides: Partial<UpdateDeps> = {}) {
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

  const deps: UpdateDeps = {
    fetchConfig: async () => ({ model_id: 'test/model-x', rr_min: 3 }),
    fetchLatestBriefing: async () => ({
      id: 'parent-1',
      created_at: PARENT_CREATED_AT,
      kind: 'morning',
      raw_model_json: parentBriefing(),
    }),
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
        object: modelUpdate(),
        model: params.model,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        } as GenerateStructuredResult<BriefingUpdate>['usage'],
        cost: 0.021,
        cachedInputTokens: 4200,
        latencyMs: 987,
      }
    },
    loadDoctrine: () => 'DOCTRINE PREFIX',
    now: () => NOW,
    insertBriefing: async (row) => {
      calls.push('insertBriefing')
      briefingRow = row
      return { id: 'briefing-2' }
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

describe('runUpdate', () => {
  it('runs parent → bundle → engine → LLM → compose → validate → persist end to end', async () => {
    const harness = makeDeps()
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })

    expect(harness.calls).toEqual([
      'generate',
      'insertBriefing',
      'insertEntryLevels',
      'deactivate',
    ])
    expect(result.briefingId).toBe('briefing-2')
    expect(result.parentBriefingId).toBe('parent-1')
    expect(result.bundleId).toBe('b1')
    expect(result.model).toBe('test/model-x')
    expect(result.stale).toBe(false)
    expect(result.entryLevelCount).toBe(2)
  })

  it('persists an update row: kind/parent/tactical_read set, overview + terrain inherited', async () => {
    const harness = makeDeps()
    await runUpdate(harness.deps, { triggerReason: 'manual' })
    const row = harness.getBriefingRow()!

    expect(row.kind).toBe('update')
    expect(row.parent_briefing_id).toBe('parent-1')
    expect(row.tactical_read).toEqual(modelUpdate().tacticalRead)
    // Inherited from the parent:
    expect(row.overview.currentPosition).toEqual([
      'PARENT: above the Rip',
      'PARENT: inside upper value',
    ])
    expect(row.terrain.zones[0].label).toMatch(/^PARENT /)
    // Fresh from the update, with engine-recomputed rr:
    expect(row.primary_obj.macroGoal).toBe('FRESH long the shelf reclaim')
    expect(row.danger_zones).toEqual([{ area: 'FRESH mid-value', why: 'no edge in the middle' }])
    expect(row.primary_obj.rr).toBe(3)
    expect(row.raw_model_json.primary.rr).toBe(3)
    // The stored raw_model_json is the composed full Briefing:
    expect(row.raw_model_json.overview).toEqual(row.overview)
    expect(row.raw_model_json.terrain).toEqual(row.terrain)
  })

  it('embeds the previous briefing and the update mission in the prompt', async () => {
    const harness = makeDeps()
    await runUpdate(harness.deps, { triggerReason: 'manual' })
    const captured = harness.getCaptured()!

    expect(captured.system).toBe('DOCTRINE PREFIX')
    expect(captured.cacheSystem).toBe(true)
    expect(captured.telemetry).toEqual({ functionId: 'update-task' })
    expect(captured.images).toHaveLength(1)
    expect(captured.prompt).toContain('# Previous briefing (inherited context)')
    expect(captured.prompt).toContain(`Issued ${PARENT_CREATED_AT} (90 min ago, kind: morning)`)
    expect(captured.prompt).toContain('PARENT primary')
    expect(captured.prompt).toContain('You do NOT output `overview` or `terrain`')
    expect(captured.prompt).toContain('tacticalRead')
    expect(captured.prompt).toContain('# Engine facts (authoritative)')
    expect(captured.prompt).toContain('# Raw MGI static levels')
    expect(captured.prompt).toContain(`meta.currentPrice = ${facts.currentPrice}`)
  })

  it('throws UpdateInputError when no previous briefing exists', async () => {
    const harness = makeDeps({ fetchLatestBriefing: async () => null })
    await expect(runUpdate(harness.deps, { triggerReason: 'manual' })).rejects.toThrow(
      UpdateInputError,
    )
    expect(harness.calls).toEqual([])
  })

  it('throws UpdateInputError when the previous briefing no longer parses', async () => {
    const harness = makeDeps({
      fetchLatestBriefing: async () => ({
        id: 'parent-1',
        created_at: PARENT_CREATED_AT,
        kind: 'morning',
        raw_model_json: { legacy: 'shape' },
      }),
    })
    await expect(runUpdate(harness.deps, { triggerReason: 'manual' })).rejects.toThrow(
      /no longer parses/,
    )
    expect(harness.calls).toEqual([])
  })

  it('overwrites code-owned meta the model drifted on', async () => {
    const harness = makeDeps({
      generate: async (params) => ({
        object: {
          ...modelUpdate(),
          meta: {
            createdAt: '1999-01-01T00:00:00Z',
            triggerReason: 'wrong-reason',
            currentPrice: 12345,
            htfTrend: 'up — still trending',
            ripStatus: 'bogus condition',
          },
        },
        model: params.model,
        usage: {} as GenerateStructuredResult<BriefingUpdate>['usage'],
        cost: null,
        cachedInputTokens: null,
        latencyMs: 0,
      }),
    })
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })
    const row = harness.getBriefingRow()!

    expect(row.raw_model_json.meta.createdAt).toBe(NOW.toISOString())
    expect(row.raw_model_json.meta.currentPrice).toBe(facts.currentPrice)
    expect(row.raw_model_json.meta.triggerReason).toBe('manual')
    expect(row.raw_model_json.meta.ripStatus).toBe(facts.ripStatus!.condition)
    expect(result.warnings.some((w) => w.includes('meta.createdAt'))).toBe(true)
  })

  it('warns (does not fail) when the inherited terrain drifted off the fresh engine borders', async () => {
    const parent = parentBriefing()
    // Shift the whole inherited stack by 7 points — still contiguous, but
    // every border now misses the fresh engine border set.
    parent.terrain.zones = parent.terrain.zones.map((z) => ({
      ...z,
      top: z.top + 7,
      bottom: z.bottom + 7,
    }))
    const harness = makeDeps({
      fetchLatestBriefing: async () => ({
        id: 'parent-1',
        created_at: PARENT_CREATED_AT,
        kind: 'morning',
        raw_model_json: parent,
      }),
    })
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })

    expect(result.warnings.some((w) => w.includes('not in the engine border set'))).toBe(true)
    expect(result.briefingId).toBe('briefing-2')
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
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('test/opus-hc')
    expect(result.highConviction).toBe(true)
  })

  it('falls back to code defaults when the config row is missing', async () => {
    const harness = makeDeps({ fetchConfig: async () => null })
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })

    expect(harness.getCaptured()!.model).toBe('anthropic/claude-sonnet-5')
    expect(result.warnings.some((w) => w.includes('config row missing'))).toBe(true)
  })

  it('accepts a parent that is itself an update (chained updates)', async () => {
    const harness = makeDeps({
      fetchLatestBriefing: async () => ({
        id: 'parent-update-1',
        created_at: PARENT_CREATED_AT,
        kind: 'update',
        raw_model_json: parentBriefing(),
      }),
    })
    const result = await runUpdate(harness.deps, { triggerReason: 'manual' })

    expect(result.parentBriefingId).toBe('parent-update-1')
    expect(harness.getCaptured()!.prompt).toContain('kind: update')
  })
})
