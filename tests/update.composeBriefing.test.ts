import { describe, expect, it } from 'vitest'
import { Briefing } from '@/knowledge/schema/briefing.schema'
import type { BriefingUpdate } from '@/knowledge/schema/briefing.schema'
import { composeUpdateBriefing } from '@/lib/update'

const parent: Briefing = {
  meta: {
    createdAt: '2026-07-13T13:00:00Z',
    triggerReason: 'manual',
    currentPrice: 30250,
    htfTrend: 'up',
    ripStatus: 'Green',
  },
  overview: {
    currentPosition: ['parent position'],
    structuralArchitecture: ['parent architecture'],
    orderFlowContext: ['parent flow'],
    keyInflections: [{ level: 30200, why: 'parent inflection' }],
  },
  terrain: {
    zones: [{ color: 'blue', top: 30300, bottom: 30200, label: 'Parent Zone' }],
    levels: [{ price: 30200, label: 'Parent VAL', kind: 'trench' }],
  },
  primary: {
    macroGoal: 'parent primary',
    rationale: 'stale',
    direction: 'long',
    entries: [{ label: 'E1', price: 30210, trigger: 'old trigger' }],
    stops: [{ label: 'S1', price: 30200, invalidation: 'old' }],
    targets: [{ label: 'T1', price: 30260, description: 'old' }],
    rr: 5,
  },
  secondary: {
    macroGoal: 'parent secondary',
    rationale: 'stale',
    direction: 'short',
    entries: [{ label: 'E1', price: 30290, trigger: 'old' }],
    stops: [{ label: 'S1', price: 30300, invalidation: 'old' }],
    targets: [{ label: 'T1', price: 30250, description: 'old' }],
    rr: 4,
  },
  dangerZones: [{ area: 'parent danger', why: 'old' }],
}

const update: BriefingUpdate = {
  meta: {
    createdAt: '2026-07-13T15:00:00Z',
    triggerReason: 'manual',
    currentPrice: 30280,
    htfTrend: 'up, extended',
    ripStatus: 'Green',
  },
  tacticalRead: {
    location: 'Parent Zone upper third',
    ripStatus: 'Holding as support',
    initiative: 'Buyers on positive delta',
  },
  primary: { ...parent.primary, macroGoal: 'fresh primary', rationale: 'fresh' },
  secondary: { ...parent.secondary, macroGoal: 'fresh secondary', rationale: 'fresh' },
  dangerZones: [{ area: 'fresh danger', why: 'new chop' }],
}

describe('composeUpdateBriefing', () => {
  it('takes meta + strategic alignment from the update, overview + terrain from the parent', () => {
    const composed = composeUpdateBriefing(parent, update)

    expect(composed.meta).toEqual(update.meta)
    expect(composed.primary.macroGoal).toBe('fresh primary')
    expect(composed.secondary.macroGoal).toBe('fresh secondary')
    expect(composed.dangerZones).toEqual(update.dangerZones)
    expect(composed.overview).toEqual(parent.overview)
    expect(composed.terrain).toEqual(parent.terrain)
  })

  it('produces a parseable full Briefing (the dashboard contract)', () => {
    const composed = composeUpdateBriefing(parent, update)
    expect(Briefing.safeParse(composed).success).toBe(true)
  })

  it('does not mutate its inputs', () => {
    const parentCopy = structuredClone(parent)
    const updateCopy = structuredClone(update)
    composeUpdateBriefing(parent, update)
    expect(parent).toEqual(parentCopy)
    expect(update).toEqual(updateCopy)
  })
})
