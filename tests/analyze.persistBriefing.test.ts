import { describe, expect, it } from 'vitest'
import type { Briefing } from '@/knowledge/schema/briefing.schema'
import { evaluateRiskReward } from '@/lib/engine/riskReward'
import {
  buildBriefingRow,
  buildEntryLevelRows,
  persistBriefing,
} from '@/lib/analyze'
import type { EntryLevelInsert, PersistDeps } from '@/lib/analyze'

const briefing: Briefing = {
  meta: {
    createdAt: '2026-07-06T12:00:00Z',
    triggerReason: 'manual',
    currentPrice: 30255,
    htfTrend: 'up',
    ripStatus: 'green — above the Rip',
  },
  overview: {
    currentPosition: ['inside value'],
    structuralArchitecture: [],
    orderFlowContext: [],
    keyInflections: [],
  },
  terrain: {
    zones: [{ color: 'green', top: 30300, bottom: 30200, label: 'Killbox' }],
    levels: [],
  },
  primary: {
    macroGoal: 'Long the shelf',
    rationale: 'Absorption at the wall',
    direction: 'long',
    entries: [
      { label: 'Entry A (Ideal)', price: 30250, trigger: 'absorption' },
      { label: 'Entry B (Add-on)', price: 30245, trigger: 'reclaim' },
    ],
    stops: [{ label: 'Stop', price: 30240, invalidation: 'lost the shelf' }],
    targets: [
      { label: 'T1', price: 30280, description: 'trench' },
      { label: 'T2', price: 30295, description: 'wall' },
    ],
    rr: 3,
  },
  secondary: {
    macroGoal: 'Fade the high',
    rationale: 'Exhaustion at the border',
    direction: 'short',
    entries: [{ label: 'Entry A', price: 30295, trigger: 'exhaustion' }],
    stops: [{ label: 'Stop', price: 30302, invalidation: 'acceptance above' }],
    targets: [{ label: 'T1', price: 30260, description: 'value mid' }],
    rr: 5,
  },
  dangerZones: [{ area: 'mid-value', why: 'no edge' }],
}

const riskReward = {
  primary: evaluateRiskReward({
    direction: 'long',
    entry: 30250,
    stop: 30240,
    targets: [30280, 30295],
  }),
  secondary: evaluateRiskReward({
    direction: 'short',
    entry: 30295,
    stop: 30302,
    targets: [30260],
  }),
}

describe('buildBriefingRow', () => {
  it('maps the briefing onto the briefings columns', () => {
    const row = buildBriefingRow({
      bundleId: 'bundle-1',
      triggerReason: 'manual',
      model: 'anthropic/claude-sonnet-5',
      briefing,
    })

    expect(row.bundle_id).toBe('bundle-1')
    expect(row.trigger_reason).toBe('manual')
    expect(row.model_id).toBe('anthropic/claude-sonnet-5')
    expect(row.htf_trend).toBe('up')
    expect(row.rip_status).toBe('green — above the Rip')
    expect(row.terrain).toEqual(briefing.terrain)
    expect(row.primary_obj).toEqual(briefing.primary)
    expect(row.secondary_obj).toEqual(briefing.secondary)
    expect(row.danger_zones).toEqual(briefing.dangerZones)
    expect(row.overview).toEqual(briefing.overview)
    expect(row.raw_model_json).toEqual(briefing)
  })
})

describe('buildEntryLevelRows', () => {
  it('emits one active row per entry rung with the engine stop and target ladder', () => {
    const rows = buildEntryLevelRows('briefing-1', briefing, riskReward)

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.objective)).toEqual(['primary', 'primary', 'secondary'])
    expect(rows[0]).toEqual({
      briefing_id: 'briefing-1',
      objective: 'primary',
      label: 'Entry A (Ideal)',
      price: 30250,
      direction: 'long',
      stop: riskReward.primary.stop,
      targets: [30280, 30295],
      active: true,
    })
    expect(rows[2].direction).toBe('short')
    expect(rows[2].stop).toBe(riskReward.secondary.stop)
    expect(rows.every((r) => r.active)).toBe(true)
  })
})

describe('persistBriefing', () => {
  // Order matters (no client-side transactions): the new set must be inserted
  // BEFORE the old one is deactivated, so there is never a zero-active window
  // for a concurrent eval-task to read as NO_ENTRY_NEAR.
  it('inserts the briefing, then the new active set, then deactivates the rest', async () => {
    const calls: string[] = []
    let inserted: EntryLevelInsert[] = []
    let exceptId: string | undefined
    const deps: PersistDeps = {
      insertBriefing: async () => {
        calls.push('insertBriefing')
        return { id: 'briefing-9' }
      },
      deactivateEntryLevels: async (exceptBriefingId) => {
        calls.push('deactivate')
        exceptId = exceptBriefingId
      },
      insertEntryLevels: async (rows) => {
        calls.push('insertEntryLevels')
        inserted = rows
      },
    }

    const result = await persistBriefing(deps, {
      bundleId: 'bundle-1',
      triggerReason: 'manual',
      model: 'anthropic/claude-sonnet-5',
      briefing,
      riskReward,
    })

    expect(calls).toEqual(['insertBriefing', 'insertEntryLevels', 'deactivate'])
    expect(exceptId).toBe('briefing-9')
    expect(result).toEqual({ briefingId: 'briefing-9', entryLevelCount: 3 })
    expect(inserted.every((r) => r.briefing_id === 'briefing-9')).toBe(true)
  })

  it('leaves the old set untouched when the level insert fails (no deactivate)', async () => {
    const calls: string[] = []
    const deps: PersistDeps = {
      insertBriefing: async () => ({ id: 'briefing-9' }),
      deactivateEntryLevels: async () => {
        calls.push('deactivate')
      },
      insertEntryLevels: async () => {
        throw new Error('insert failed')
      },
    }

    await expect(
      persistBriefing(deps, {
        bundleId: 'bundle-1',
        triggerReason: 'manual',
        model: 'anthropic/claude-sonnet-5',
        briefing,
        riskReward,
      }),
    ).rejects.toThrow('insert failed')
    expect(calls).toEqual([])
  })
})
