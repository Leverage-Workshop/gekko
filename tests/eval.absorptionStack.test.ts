import { describe, expect, it } from 'vitest'
import { selectAbsorptionStack } from '@/lib/eval'
import type {
  ConfirmedAbsorptionCandidate,
  ConfirmedAbsorptionScanResult,
} from '@/lib/engine/stallConfirmation'

/**
 * feat-072: code-owned selection of the stat-row stack — the stall-confirmed
 * candidate nearest the evaluated level.
 */

function candidate(
  overrides: Partial<ConfirmedAbsorptionCandidate> & { top: number; bottom: number },
): ConfirmedAbsorptionCandidate {
  return {
    source: 'full-rotation',
    side: 'buy',
    binCount: 4,
    qualifyingCount: 3,
    peakAbsDelta: 150,
    netDelta: 300,
    stall: {
      barsAtStack: 5,
      volumeAtStack: 3750,
      tradesAtStack: 3300,
      netProgressPts: 2,
      confirmed: true,
    },
    ...overrides,
  }
}

function scan(candidates: ConfirmedAbsorptionCandidate[]): ConfirmedAbsorptionScanResult {
  return { candidates }
}

describe('selectAbsorptionStack', () => {
  it('returns null when there is no scan', () => {
    expect(selectAbsorptionStack(null, 30000)).toBeNull()
  })

  it('returns null when no candidate is stall-confirmed', () => {
    const unconfirmed = candidate({ top: 30010, bottom: 30000 })
    unconfirmed.stall = { ...unconfirmed.stall, confirmed: false }
    expect(selectAbsorptionStack(scan([unconfirmed]), 30005)).toBeNull()
  })

  it('picks the confirmed candidate nearest the reference price, skipping closer unconfirmed ones', () => {
    const closerButUnconfirmed = candidate({ top: 30006, bottom: 30001 })
    closerButUnconfirmed.stall = { ...closerButUnconfirmed.stall, confirmed: false }
    const confirmedNear = candidate({ top: 29995, bottom: 29990 })
    const confirmedFar = candidate({ top: 29900, bottom: 29890 })

    const selected = selectAbsorptionStack(
      scan([closerButUnconfirmed, confirmedNear, confirmedFar]),
      30000,
    )
    expect(selected).toBe(confirmedNear)
  })

  it('treats a reference price inside the stack band as distance zero', () => {
    const containing = candidate({ top: 30010, bottom: 29990 })
    const nearby = candidate({ top: 30012, bottom: 30011 })
    expect(selectAbsorptionStack(scan([nearby, containing]), 30000)).toBe(containing)
  })

  it('keeps the first candidate in scan order on an exact distance tie', () => {
    const above = candidate({ top: 30020, bottom: 30010 })
    const below = candidate({ top: 29990, bottom: 29980 })
    // Reference 30000: both bands are 10 pts away — scan order wins.
    expect(selectAbsorptionStack(scan([above, below]), 30000)).toBe(above)
  })
})
