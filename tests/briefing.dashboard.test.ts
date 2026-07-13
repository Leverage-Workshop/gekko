import { describe, expect, it } from 'vitest'
import type { Briefing } from '@/knowledge/schema/briefing.schema'
import {
  loadDashboardData,
  type DashboardBriefingRow,
  type DashboardDeps,
  type DashboardEvalRow,
} from '@/lib/briefing'

const briefingPayload: Briefing = {
  meta: {
    createdAt: '2026-07-08T12:00:00Z',
    triggerReason: 'manual',
    currentPrice: 30255,
    htfTrend: 'up',
    ripStatus: 'green — above the Rip',
  },
  overview: {
    currentPosition: ['inside value'],
    structuralArchitecture: ['acceptance above'],
    orderFlowContext: ['buyers hold'],
    keyInflections: [{ level: 30300, why: 'attic border' }],
  },
  terrain: {
    zones: [{ color: 'green', top: 30300, bottom: 30200, label: 'Killbox' }],
    levels: [{ price: 30250, label: 'POC', kind: 'magnet' }],
  },
  primary: {
    macroGoal: 'Long the shelf',
    rationale: 'Absorption at the wall',
    direction: 'long',
    entries: [{ label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' }],
    stops: [{ label: 'Stop A', price: 30240, invalidation: 'lost the shelf' }],
    targets: [{ label: 'T1', price: 30280, description: 'trench' }],
    rr: 3,
  },
  secondary: {
    macroGoal: 'Fade the high',
    rationale: 'Exhaustion at the border',
    direction: 'short',
    entries: [{ label: 'Entry A (Fade)', price: 30295, trigger: 'exhaustion' }],
    stops: [{ label: 'Stop A', price: 30302, invalidation: 'acceptance above' }],
    targets: [{ label: 'T1', price: 30260, description: 'value mid' }],
    rr: 5,
  },
  dangerZones: [{ area: 'mid-value', why: 'no edge' }],
}

const briefingRow: DashboardBriefingRow = {
  id: 'briefing-1',
  created_at: '2026-07-08T12:00:05Z',
  trigger_reason: 'manual',
  model_id: 'anthropic/claude-sonnet-5',
  raw_model_json: briefingPayload,
}

const evalRow: DashboardEvalRow = {
  id: 'eval-1',
  created_at: '2026-07-08T12:05:00Z',
  model_id: 'anthropic/claude-haiku-4-5',
  near_entry: true,
  status: 'WAIT',
  direction: 'long',
  trigger: 'wait for absorption print',
  stop: 30240,
  targets: [30280, 30295],
  reason: 'Price near Entry A but no confirming delta yet.',
  current_price: 30252,
}

function fakeDeps(overrides: Partial<DashboardDeps> = {}): DashboardDeps {
  return {
    fetchLatestBriefing: async () => null,
    fetchLatestEvalResult: async () => null,
    fetchLatestBundleReceivedAt: async () => null,
    fetchLatestExecCsv: async () => null,
    ...overrides,
  }
}

const EXEC_CSV = [
  'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity',
  '2026-07-08 11:58:00,30240.00,30252.50,30238.25,30250.00,0.00,1.00',
  '2026-07-08 11:59:00,30250.00,30255.00,30244.75,30246.50,0.00,-1.00',
].join('\n')

const NOW = new Date('2026-07-08T12:10:00Z')

describe('loadDashboardData', () => {
  it('handles an empty database: no briefing, no eval, maximally stale', async () => {
    const data = await loadDashboardData(fakeDeps(), { now: NOW })

    expect(data.briefing).toBeNull()
    expect(data.briefingError).toBeNull()
    expect(data.evalResult).toBeNull()
    expect(data.staleness.isStale).toBe(true)
    expect(data.staleness.hasData).toBe(false)
    expect(data.staleness.warning).toContain('STALE')
  })

  it('returns the parsed briefing payload with row metadata', async () => {
    const data = await loadDashboardData(
      fakeDeps({
        fetchLatestBriefing: async () => briefingRow,
        fetchLatestEvalResult: async () => evalRow,
        fetchLatestBundleReceivedAt: async () => '2026-07-08T12:09:30Z',
      }),
      { now: NOW },
    )

    expect(data.briefing).not.toBeNull()
    expect(data.briefing!.id).toBe('briefing-1')
    expect(data.briefing!.createdAt).toBe('2026-07-08T12:00:05Z')
    expect(data.briefing!.triggerReason).toBe('manual')
    expect(data.briefing!.modelId).toBe('anthropic/claude-sonnet-5')
    expect(data.briefing!.payload).toEqual(briefingPayload)
    expect(data.briefingError).toBeNull()
    expect(data.evalResult).toEqual(evalRow)
  })

  it('marks a recent bundle fresh (no staleness warning)', async () => {
    const data = await loadDashboardData(
      fakeDeps({ fetchLatestBundleReceivedAt: async () => '2026-07-08T12:09:30Z' }),
      { now: NOW },
    )

    expect(data.staleness.isStale).toBe(false)
    expect(data.staleness.hasData).toBe(true)
    expect(data.staleness.warning).toBeNull()
    expect(data.staleness.ageSeconds).toBe(30)
  })

  it('marks an old bundle stale with a warning — never stale-as-fresh', async () => {
    const data = await loadDashboardData(
      fakeDeps({ fetchLatestBundleReceivedAt: async () => '2026-07-08T12:00:00Z' }),
      { now: NOW },
    )

    expect(data.staleness.isStale).toBe(true)
    expect(data.staleness.hasData).toBe(true)
    expect(data.staleness.warning).toContain('STALE')
  })

  it('surfaces a schema-validation error instead of a half-parsed briefing', async () => {
    const data = await loadDashboardData(
      fakeDeps({
        fetchLatestBriefing: async () => ({
          ...briefingRow,
          raw_model_json: { meta: { createdAt: 'x' } },
        }),
      }),
      { now: NOW },
    )

    expect(data.briefing).toBeNull()
    expect(data.briefingError).toContain('briefing-1')
    expect(data.briefingError).toContain('schema validation')
  })

  it('falls back to the payload triggerReason when the column is null', async () => {
    const data = await loadDashboardData(
      fakeDeps({
        fetchLatestBriefing: async () => ({ ...briefingRow, trigger_reason: null }),
      }),
      { now: NOW },
    )

    expect(data.briefing!.triggerReason).toBe('manual')
  })

  it('parses the latest execution-bar CSV into bars', async () => {
    const data = await loadDashboardData(
      fakeDeps({ fetchLatestExecCsv: async () => EXEC_CSV }),
      { now: NOW },
    )

    expect(data.execBars).toHaveLength(2)
    expect(data.execBars![0].open).toBe(30240)
    expect(data.execBars![1].close).toBe(30246.5)
  })

  it('returns null execBars when no CSV exists', async () => {
    const data = await loadDashboardData(fakeDeps(), { now: NOW })
    expect(data.execBars).toBeNull()
  })

  it('degrades to null execBars on a fetch failure — never fails the page', async () => {
    const data = await loadDashboardData(
      fakeDeps({
        fetchLatestExecCsv: async () => {
          throw new Error('storage down')
        },
      }),
      { now: NOW },
    )

    expect(data.execBars).toBeNull()
    expect(data.staleness).toBeDefined()
  })

  it('degrades to null execBars on a malformed CSV', async () => {
    const data = await loadDashboardData(
      fakeDeps({ fetchLatestExecCsv: async () => 'Wrong,Header\n1,2' }),
      { now: NOW },
    )

    expect(data.execBars).toBeNull()
  })
})
