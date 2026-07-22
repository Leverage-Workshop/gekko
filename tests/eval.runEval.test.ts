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
import { loadDoctrine } from '@/lib/analyze'
import type { GenerateStructuredResult } from '@/lib/llm'

const execCsvContent = readFileSync(
  join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv'),
  'utf-8',
)
const halfRotationDeltaContent = readFileSync(
  join(process.cwd(), 'chart-data/half-rotation-delta.vbp.md'),
  'utf-8',
)
const fullRotationDeltaContent = readFileSync(
  join(process.cwd(), 'chart-data/full-rotation-delta.vbp.md'),
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
    checks: [
      { name: 'Structure', verdict: 'pass', note: 'Border is a proven acceptance edge' },
      { name: 'Delta', verdict: 'pass', note: 'Positive mean confirming the long' },
    ],
    nextSignal: null,
    caution: 'No adds above T1',
    reason: 'Absorption at the border, positive delta confirming the long.',
  }
}

type GenerateParams = Parameters<NonNullable<EvalDeps['generate']>>[0]

function makeDeps(overrides: Partial<EvalDeps> = {}) {
  const calls: string[] = []
  let captured: GenerateParams | undefined
  let insertedRow: EvalResultInsert | undefined

  const encoder = new TextEncoder()
  // Exec CSV + the two delta exports: the eval-task's exec-plus-delta load
  // fetches the deltas best-effort for the code-owned absorption scan. The
  // VbP profile exports are still never downloaded.
  const objects: Record<string, Uint8Array> = {
    'b1/execution_bars.csv': encoder.encode(execCsvContent),
    'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
    'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
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
    expect(captured.prompt).toContain('# Data ownership (non-negotiable)')
    expect(captured.prompt).toContain('# Active entry levels (from the prior briefing)')
    expect(captured.prompt).toContain('# Delta telemetry')
    expect(captured.prompt).toContain(`meta.currentPrice = ${CURRENT_PRICE}`)
    expect(captured.prompt).toContain('Price IS near an active entry')
    expect(captured.prompt).toContain('"Entry A (Ideal)"')
    expect(captured.prompt).toContain('Image 1: HTF planning chart')
  })

  it('teaches aggressor-color absorption and demotes retest/reclaim from gate', () => {
    // Operator doctrine (2026-07-16): a falling market absorbs RED at support
    // (blue comes after, as continuation), and a retest/reclaim strengthens
    // conviction but never blocks an otherwise-confirmed entry. The decision
    // logic lives in the cached eval prefix, not the user message.
    const doctrine = loadDoctrine('eval')

    expect(doctrine).toContain("Absorption prints in the AGGRESSOR's color")
    expect(doctrine).toContain('Red aggression absorbed at the border, then blue continuation')
    expect(doctrine).toContain('NEVER a gate')
    expect(doctrine).not.toContain('waiting for retest → WAIT')
  })

  it('feeds the code-owned absorption scan and the recent bar sequence to the model', async () => {
    // The full-rotation fixture carries a 3-of-4 buy stack at doctrine
    // thresholds; the model must receive it as a code-detected candidate
    // instead of having to read the delta profile off a screenshot.
    const harness = makeDeps()
    await runEval(harness.deps)
    const prompt = harness.getCaptured()!.prompt

    expect(prompt).toContain('# Absorption candidates')
    expect(prompt).toContain('"source": "full-rotation"')
    expect(prompt).toContain('"top": 29830.5')
    expect(prompt).toContain('These are CANDIDATES')
    expect(prompt).toContain('# Recent execution bars')
    // Last fixture bar, rendered without its Leg VWAP column.
    expect(prompt).toContain('21:52:00,29920.04,29949,29920.04,29945.75,3')
  })

  it('teaches sequence-first initiative and absorption-alone checks', () => {
    // Operator doctrine (2026-07-18): the window mean is guaranteed to carry
    // the flush color right when an absorption entry confirms, and demanding
    // continuation makes the Absorption check unpassable in real time. The
    // decision logic lives in the cached eval prefix, not the user message.
    const doctrine = loadDoctrine('eval')

    expect(doctrine).toContain('verify initiative from the recent bar SEQUENCE')
    expect(doctrine).toContain('Absorption at the border ALONE satisfies an Absorption check')
    expect(doctrine).not.toContain('If the sign contradicts the direction, do not ENTER')
  })

  it('never shows the eval model the Leg VWAP and forbids it as a check', async () => {
    // Leg VWAP is Tier-3 micro-timing the operator does not trade off; fed to
    // the eval it produced always-fail "momentum" conditions on reversal entries.
    // The check ban lives in the cached eval prefix; the telemetry projection
    // in the user message must not leak the legVwap field.
    const harness = makeDeps()
    await runEval(harness.deps)
    const prompt = harness.getCaptured()!.prompt

    expect(loadDoctrine('eval')).toContain('Never use Leg VWAP as a check')
    expect(prompt).not.toContain('legVwap')
    expect(prompt).toContain('recentMeanDelta')
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
    expect(row.checks).toEqual(modelEval().checks)
    expect(row.next_signal).toBeNull()
    expect(row.caution).toBe('No adds above T1')
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
        balance_area_vbp_ref: 'b1/balance-area.vbp.md',
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
    // Level-verdict detail (checks/caution) is dropped with the rest.
    expect(row.checks).toBeNull()
    expect(row.caution).toBeNull()
    // The model's uncoerced answer stays auditable.
    expect(row.raw_model_json.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to NO_ENTRY_NEAR'))).toBe(true)
  })

  it('demotes ENTER to WAIT when the extreme counts confirm counter-initiative', async () => {
    // The fixture exec CSV's recent window is stacked with blue extremes
    // (10 of the last 20 bars ≥ +3) and zero red — genuine buy initiative. A
    // short ENTER runs straight into it, so the count gate demotes.
    const shortLevel: EntryLevelRow = { ...activeLevels()[0], direction: 'short' }
    const harness = makeDeps({
      fetchActiveEntryLevels: async () => [shortLevel],
      generate: async (params) => ({
        object: {
          ...modelEval(),
          evaluatedLevel: { label: 'Entry A (Ideal)', price: 30245, direction: 'short' },
          direction: 'short',
        },
        model: params.model,
        usage: {
          inputTokens: 40,
          outputTokens: 20,
          totalTokens: 60,
        } as GenerateStructuredResult<EvalResult>['usage'],
        cost: 0.0012,
        cachedInputTokens: 2100,
        latencyMs: 456,
      }),
    })
    const result = await runEval(harness.deps)
    const row = harness.getInsertedRow()!

    expect(result.status).toBe('WAIT')
    expect(row.status).toBe('WAIT')
    // The model's uncoerced answer stays auditable.
    expect(row.raw_model_json.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(true)
    // The demotion explanation is persisted so the dashboard can show why a
    // WAIT verdict sits above all-pass checks.
    expect(row.warnings?.some((w) => w.includes('coerced to WAIT'))).toBe(true)
  })

  it('keeps a long ENTER against a red flush that price recovered from', async () => {
    // The absorption catch-22 (operator report, 2026-07-18): a red flush into
    // the long border prints counter-extremes exactly when the entry confirms.
    // Price snapped back after the flush — the last close never exited the
    // area downward — so the initiative gate lifts.
    const flushCsv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
      '2026-06-16 15:55:00,30261.00,30264.00,30256.00,30260.00,0.00,-1.00',
      '2026-06-16 15:55:30,30260.00,30262.00,30255.00,30258.00,0.00,-1.00',
      '2026-06-16 15:56:00,30258.00,30260.00,30253.00,30256.00,0.00,-1.00',
      '2026-06-16 15:56:30,30256.00,30258.00,30252.00,30255.00,0.00,-1.00',
      '2026-06-16 15:57:00,30255.00,30257.00,30250.00,30254.00,0.00,-1.00',
      '2026-06-16 15:57:30,30254.00,30255.00,30248.00,30252.00,0.00,-1.00',
      '2026-06-16 15:58:00,30252.00,30252.00,30244.00,30246.00,0.00,-4.00',
      '2026-06-16 15:58:20,30246.00,30246.00,30238.00,30240.00,0.00,-3.00',
      '2026-06-16 15:58:40,30240.00,30242.00,30236.00,30239.00,0.00,-3.00',
      '2026-06-16 15:59:00,30239.00,30250.00,30238.00,30248.00,0.00,2.00',
      '2026-06-16 15:59:30,30248.00,30256.00,30247.00,30254.00,0.00,2.00',
      '2026-06-16 16:00:00,30254.00,30260.00,30252.00,30258.00,0.00,2.00',
    ].join('\n')
    const encoder = new TextEncoder()
    const objects: Record<string, Uint8Array> = {
      'b1/execution_bars.csv': encoder.encode(flushCsv),
      'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
      'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
      'b1/htf.png': encoder.encode('png-bytes'),
    }
    const harness = makeDeps({
      downloadObject: async (_bucket, path) => {
        const bytes = objects[path]
        if (!bytes) throw new Error(`missing ${path}`)
        return bytes
      },
    })
    const result = await runEval(harness.deps)

    expect(result.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('ENTER kept'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(false)
  })

  it('keeps a long ENTER on mild drift when no red-extreme prints confirm initiative', async () => {
    // Operator doctrine: initiative is a COUNT, not a mean. A window of mild
    // -1/-2 drift carries a negative mean but zero red-extreme prints — no
    // initiative, no demotion. No absorbed flush here either (price drifts
    // straight down), so only the count gate holds ENTER.
    const driftCsv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
      '2026-06-16 15:55:00,30261.00,30262.00,30258.00,30259.00,0.00,-1.00',
      '2026-06-16 15:55:30,30259.00,30260.00,30256.00,30257.00,0.00,-1.00',
      '2026-06-16 15:56:00,30257.00,30258.00,30254.00,30255.00,0.00,-2.00',
      '2026-06-16 15:56:30,30255.00,30256.00,30252.00,30253.00,0.00,-1.00',
      '2026-06-16 15:57:00,30253.00,30254.00,30250.00,30251.00,0.00,-2.00',
      '2026-06-16 15:57:30,30251.00,30252.00,30248.00,30249.00,0.00,-1.00',
      '2026-06-16 15:58:00,30249.00,30250.00,30246.00,30247.00,0.00,-2.00',
      '2026-06-16 15:58:30,30247.00,30248.00,30244.00,30245.00,0.00,-1.00',
      '2026-06-16 15:59:00,30245.00,30246.00,30242.00,30243.00,0.00,-2.00',
      '2026-06-16 15:59:30,30243.00,30244.00,30240.00,30241.00,0.00,-1.00',
    ].join('\n')
    const encoder = new TextEncoder()
    const objects: Record<string, Uint8Array> = {
      'b1/execution_bars.csv': encoder.encode(driftCsv),
      'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
      'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
      'b1/htf.png': encoder.encode('png-bytes'),
    }
    const harness = makeDeps({
      downloadObject: async (_bucket, path) => {
        const bytes = objects[path]
        if (!bytes) throw new Error(`missing ${path}`)
        return bytes
      },
    })
    const result = await runEval(harness.deps)

    expect(result.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(false)
  })

  it('keeps a long ENTER when the flush stalls and chops at the lows without closing out', async () => {
    // The 2026-07-20 operator scenario: a heavy red flush into the long
    // border, then a few bars chopping at the lows — that chop is what builds
    // the absorption stack. Price never CLOSES below the area's accepted
    // closes (a wick probing under the flush low is not an exit), so the
    // ENTER stands even though the last close sits deep in the lower half of
    // the window range (the old recovery rule would have demoted this).
    const chopCsv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
      '2026-06-16 15:55:00,30295.00,30296.00,30292.00,30293.00,0.00,-1.00',
      '2026-06-16 15:55:30,30293.00,30294.00,30290.00,30291.00,0.00,-1.00',
      '2026-06-16 15:56:00,30291.00,30292.00,30288.00,30289.00,0.00,-1.00',
      '2026-06-16 15:56:30,30289.00,30289.00,30272.00,30274.00,0.00,-4.00',
      '2026-06-16 15:57:00,30274.00,30274.00,30258.00,30260.00,0.00,-4.00',
      '2026-06-16 15:57:30,30260.00,30260.00,30246.00,30248.00,0.00,-3.00',
      '2026-06-16 15:58:00,30248.00,30249.00,30245.00,30247.00,0.00,-2.00',
      '2026-06-16 15:58:30,30247.00,30249.00,30244.50,30248.00,0.00,-1.00',
      '2026-06-16 15:59:00,30248.00,30249.00,30245.00,30247.00,0.00,-2.00',
    ].join('\n')
    const encoder = new TextEncoder()
    const objects: Record<string, Uint8Array> = {
      'b1/execution_bars.csv': encoder.encode(chopCsv),
      'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
      'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
      'b1/htf.png': encoder.encode('png-bytes'),
    }
    const harness = makeDeps({
      downloadObject: async (_bucket, path) => {
        const bytes = objects[path]
        if (!bytes) throw new Error(`missing ${path}`)
        return bytes
      },
    })
    const result = await runEval(harness.deps)

    expect(result.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('ENTER kept'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(false)
  })

  it('keeps a long ENTER when counter-extremes are under the min-count floor', async () => {
    // One or two rogue -3/-4 prints in a 750-volume window are noise, not
    // initiative (the ripStatus RED_BUILDING_MIN_BARS doctrine). Two red
    // extremes with price closing on the lows — no absorbed-flush rescue —
    // must still NOT demote: the cluster never confirmed.
    const rogueCsv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
      '2026-06-16 15:55:00,30261.00,30262.00,30258.00,30259.00,0.00,-1.00',
      '2026-06-16 15:55:30,30259.00,30260.00,30256.00,30257.00,0.00,-1.00',
      '2026-06-16 15:56:00,30257.00,30258.00,30254.00,30255.00,0.00,-2.00',
      '2026-06-16 15:56:30,30255.00,30256.00,30250.00,30251.00,0.00,-3.00',
      '2026-06-16 15:57:00,30251.00,30252.00,30248.00,30249.00,0.00,-1.00',
      '2026-06-16 15:57:30,30249.00,30250.00,30246.00,30247.00,0.00,-2.00',
      '2026-06-16 15:58:00,30247.00,30248.00,30242.00,30243.00,0.00,-4.00',
      '2026-06-16 15:58:30,30243.00,30244.00,30240.00,30241.00,0.00,-1.00',
      '2026-06-16 15:59:00,30241.00,30242.00,30238.00,30239.00,0.00,-2.00',
      '2026-06-16 15:59:30,30239.00,30240.00,30236.00,30237.00,0.00,-1.00',
    ].join('\n')
    const encoder = new TextEncoder()
    const objects: Record<string, Uint8Array> = {
      'b1/execution_bars.csv': encoder.encode(rogueCsv),
      'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
      'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
      'b1/htf.png': encoder.encode('png-bytes'),
    }
    const harness = makeDeps({
      downloadObject: async (_bucket, path) => {
        const bytes = objects[path]
        if (!bytes) throw new Error(`missing ${path}`)
        return bytes
      },
    })
    const result = await runEval(harness.deps)

    expect(result.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(false)
  })

  it('demotes a long ENTER on a counter-extreme cluster even when the window mean is neutral', async () => {
    // The hole the count-only gate closes: mild entry-side bars can drag the
    // window MEAN back to neutral while a genuine red-extreme cluster prints
    // against the entry. Three red extremes (>= RED_BUILDING_MIN_BARS) vs zero
    // blue, with each bar CLOSING at a new low close (price exiting the area
    // downward — continuation, not absorption), is confirmed
    // counter-initiative — the neutral mean must not veto the demotion.
    const maskedClusterCsv = [
      'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
      '2026-06-16 15:55:00,30261.00,30262.00,30258.00,30259.00,0.00,1.00',
      '2026-06-16 15:55:30,30259.00,30260.00,30256.00,30257.00,0.00,1.00',
      '2026-06-16 15:56:00,30257.00,30258.00,30254.00,30255.00,0.00,1.00',
      '2026-06-16 15:56:30,30255.00,30256.00,30252.00,30253.00,0.00,1.00',
      '2026-06-16 15:57:00,30253.00,30254.00,30250.00,30251.00,0.00,1.00',
      '2026-06-16 15:57:30,30251.00,30252.00,30248.00,30249.00,0.00,1.00',
      '2026-06-16 15:58:00,30249.00,30250.00,30246.00,30247.00,0.00,1.00',
      '2026-06-16 15:58:20,30247.00,30247.00,30240.00,30241.00,0.00,-3.00',
      '2026-06-16 15:58:40,30241.00,30242.00,30236.00,30237.00,0.00,-3.00',
      '2026-06-16 15:59:00,30237.00,30238.00,30232.00,30233.00,0.00,-3.00',
    ].join('\n')
    const encoder = new TextEncoder()
    const objects: Record<string, Uint8Array> = {
      'b1/execution_bars.csv': encoder.encode(maskedClusterCsv),
      'b1/half-rotation-delta.vbp.md': encoder.encode(halfRotationDeltaContent),
      'b1/full-rotation-delta.vbp.md': encoder.encode(fullRotationDeltaContent),
      'b1/htf.png': encoder.encode('png-bytes'),
    }
    const harness = makeDeps({
      downloadObject: async (_bucket, path) => {
        const bytes = objects[path]
        if (!bytes) throw new Error(`missing ${path}`)
        return bytes
      },
    })
    const result = await runEval(harness.deps)

    expect(result.status).toBe('WAIT')
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(true)
  })

  it('keeps ENTER when initiative runs with the direction', async () => {
    // The fixture's blue-extreme stack + the default long ENTER: the gate passes.
    const harness = makeDeps()
    const result = await runEval(harness.deps)
    expect(result.status).toBe('ENTER')
    expect(result.warnings.some((w) => w.includes('coerced to WAIT'))).toBe(false)
    // Run warnings are persisted verbatim (the fixture bundle lacks the TPO
    // and exec screenshots, so those degraded-input notes come through), but
    // no enforcement coercion is among them.
    const row = harness.getInsertedRow()!
    expect(row.warnings).toEqual(result.warnings)
    expect(row.warnings?.some((w) => w.includes('coerced'))).toBe(false)
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
    // The skip note is persisted on the no-LLM path too.
    expect(row.warnings?.some((w) => w.includes('no active entry_levels'))).toBe(true)
  })

  it('falls back to the default triage model when the config row is missing', async () => {
    const harness = makeDeps({ fetchConfig: async () => null })
    const result = await runEval(harness.deps)

    expect(harness.getCaptured()!.model).toBe('openai/gpt-5.6-luna')
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
        balance_area_vbp_ref: null,
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
    // No delta exports → no absorption scan; the prompt says so honestly
    // instead of implying "scanned, nothing found".
    expect(harness.getCaptured()!.prompt).toContain(
      'No delta-profile exports are attached to this bundle',
    )
    expect(result.warnings.some((w) => w.includes('no half-rotation delta profile'))).toBe(
      true,
    )
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

  it('passes the gate via the recent bar window when a wick reached the level', async () => {
    // The fixture CSV's last-60s bar range tops at 29949.00; a level 6 points
    // above it is near by recent price action even though the snapshot price
    // (30250) is 295 points away — the pre-window gate would have said
    // NO_ENTRY_NEAR here.
    const wickLevel: EntryLevelRow = {
      ...activeLevels()[0],
      id: 'lvl-wick',
      label: 'Entry W',
      price: 29955,
      stop: 29945,
      targets: [29990],
    }
    let prompt = ''
    const harness = makeDeps({
      fetchActiveEntryLevels: async () => [wickLevel],
      generate: async (params) => {
        prompt = params.prompt
        return {
          object: {
            ...modelEval(),
            evaluatedLevel: { label: 'Entry W', price: 29955, direction: 'long' },
            stop: 29945,
            targets: [29990],
          },
          model: params.model,
          usage: {} as GenerateStructuredResult<EvalResult>['usage'],
          cost: null,
          cachedInputTokens: null,
          latencyMs: 0,
        }
      },
    })
    const result = await runEval(harness.deps)

    expect(result.nearEntry).toBe(true)
    expect(result.status).toBe('ENTER')
    expect(prompt).toContain('Price IS near an active entry')
    expect(prompt).toContain('recent execution-bar window')
    expect(prompt).toContain('snapshot price is 295 points away')
    expect(harness.getInsertedRow()!.evaluated_level_id).toBe('lvl-wick')
    expect(
      result.warnings.some((w) => w.includes('passed via the recent bar window (60s)')),
    ).toBe(true)
  })

  it('honors config.proximity_window_seconds for the bar-range window', async () => {
    // Level at 29890: 30.04 points below the last-60s bar low (29920.04) but
    // only 15.21 below the last-300s low (29905.21) — near only when the
    // config widens the window.
    const deepLevel: EntryLevelRow = {
      ...activeLevels()[0],
      id: 'lvl-deep',
      label: 'Entry D',
      price: 29890,
      stop: 29880,
      targets: [29925],
    }
    const narrow = makeDeps({ fetchActiveEntryLevels: async () => [deepLevel] })
    expect((await runEval(narrow.deps)).nearEntry).toBe(false)

    const widened = makeDeps({
      fetchActiveEntryLevels: async () => [deepLevel],
      fetchConfig: async () => ({
        triage_model_id: 'test/triage-y',
        proximity_window_seconds: 300,
      }),
    })
    const result = await runEval(widened.deps)
    expect(result.nearEntry).toBe(true)
    expect(
      result.warnings.some((w) => w.includes('passed via the recent bar window (300s)')),
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
        balance_area_vbp_ref: 'b1/balance-area.vbp.md',
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
