import { describe, expect, it } from 'vitest'
import { wallClockAt } from '@/lib/job-plan/exchangeTime'
import { JOB_PLAN_SOURCE_KEYS, computeInputFingerprint, sha256Hex, sourceHashesOf, type SourceBytes } from '@/lib/job-plan/fingerprint'
import { asOfFromReceivedAt } from '@/lib/job-plan/loadJobBundle'
import { JobPlanAbortError } from '@/lib/job-plan/jobPlanErrors'

const bytes = (s: string) => new TextEncoder().encode(s)

function sources(overrides: Partial<Record<(typeof JOB_PLAN_SOURCE_KEYS)[number], string>> = {}): SourceBytes {
  return Object.fromEntries(JOB_PLAN_SOURCE_KEYS.map((k) => [k, bytes(overrides[k] ?? `${k}-content`)])) as SourceBytes
}

const base = () => ({
  sources: sources(),
  plannerRevision: 'job-planner/test.1',
  imageHashes: ['bbb', 'aaa'],
  visionPromptRevision: 'vision-test',
  visionModelId: 'test/model',
})

describe('input fingerprint (feat-128)', () => {
  it('is a sha256 hex, deterministic, and image-order-insensitive', () => {
    const a = computeInputFingerprint(base())
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(computeInputFingerprint(base())).toBe(a)
    expect(computeInputFingerprint({ ...base(), imageHashes: ['aaa', 'bbb'] })).toBe(a)
  })

  it.each([
    ['a source byte', { sources: sources({ execBars: 'execBars-content!' }) }],
    ['the planner revision', { plannerRevision: 'job-planner/test.2' }],
    ['an image hash', { imageHashes: ['aaa'] }],
    ['the vision prompt revision', { visionPromptRevision: null }],
    ['the vision model id', { visionModelId: null }],
  ])('changes when %s changes', (_what, patch) => {
    expect(computeInputFingerprint({ ...base(), ...patch })).not.toBe(computeInputFingerprint(base()))
  })

  it('frames each source by length, so moving bytes between adjacent sources changes the hash', () => {
    const a = computeInputFingerprint({ ...base(), sources: sources({ jobStudyDaily: 'ab', jobStudyWeekly: 'c' }) })
    const b = computeInputFingerprint({ ...base(), sources: sources({ jobStudyDaily: 'a', jobStudyWeekly: 'bc' }) })
    expect(a).not.toBe(b)
  })

  it('per-source hashes are the plain sha256 of each file, keyed like PlanMeta.sourceHashes', () => {
    const hashes = sourceHashesOf(sources())
    expect(Object.keys(hashes).sort()).toEqual([...JOB_PLAN_SOURCE_KEYS].sort())
    expect(hashes.mgi).toBe(sha256Hex(bytes('mgi-content')))
  })
})

describe('exchange wall clock of an instant', () => {
  it('converts UTC instants to America/Chicago on both sides of DST', () => {
    expect(wallClockAt(Date.parse('2026-08-24T14:30:00Z'), 'America/Chicago')).toBe('2026-08-24T09:30:00')
    expect(wallClockAt(Date.parse('2026-01-15T15:30:00Z'), 'America/Chicago')).toBe('2026-01-15T09:30:00')
    // Past the 17:00 CT reopen the calendar date is still the wall date (the trading-day roll is the planner's).
    expect(wallClockAt(Date.parse('2026-08-24T23:05:07Z'), 'America/Chicago')).toBe('2026-08-24T18:05:07')
  })

  it('rejects an invalid zone or instant', () => {
    expect(wallClockAt(Number.NaN, 'America/Chicago')).toBeNull()
    expect(wallClockAt(0, 'Not/AZone')).toBeNull()
  })

  it('asOfFromReceivedAt aborts on a null or unparseable received_at', () => {
    expect(asOfFromReceivedAt('2026-08-24T14:30:00.000Z', 'b1')).toBe('2026-08-24T09:30:00')
    expect(() => asOfFromReceivedAt(null, 'b1')).toThrow(JobPlanAbortError)
    expect(() => asOfFromReceivedAt('yesterday', 'b1')).toThrow(JobPlanAbortError)
  })
})
