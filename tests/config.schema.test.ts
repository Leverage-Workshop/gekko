import { describe, expect, it } from 'vitest'
import { ConfigUpdateSchema } from '@/lib/config'

// feat-028: /api/config POST validation. Offline Zod cases — model ids must be
// OpenRouter `provider/model`, rr_min a bounded number, the flag a boolean.

const valid = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: false,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: null,
  triage_model_effort: null,
  high_conviction_model_effort: null,
  execution_bar_volume: 750,
  significant_move_pts: 50,
}

function fieldErrors(payload: unknown): Record<string, unknown> {
  const parsed = ConfigUpdateSchema.safeParse(payload)
  expect(parsed.success).toBe(false)
  if (parsed.success) return {}
  const errors: Record<string, unknown> = {}
  for (const issue of parsed.error.issues) {
    errors[String(issue.path[0])] = issue.message
  }
  return errors
}

describe('ConfigUpdateSchema', () => {
  it('accepts the documented defaults', () => {
    const parsed = ConfigUpdateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual(valid)
    }
  })

  it('trims model ids', () => {
    const parsed = ConfigUpdateSchema.safeParse({
      ...valid,
      model_id: '  anthropic/claude-sonnet-5  ',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.model_id).toBe('anthropic/claude-sonnet-5')
    }
  })

  it('accepts dated-canonical and tagged OpenRouter variants', () => {
    for (const id of [
      'anthropic/claude-sonnet-5-20260630',
      'anthropic/claude-3.5-sonnet:beta',
      'google/gemini-3.5-flash',
    ]) {
      expect(ConfigUpdateSchema.safeParse({ ...valid, model_id: id }).success).toBe(true)
    }
  })

  it('rejects model ids without a provider/model slash', () => {
    const errors = fieldErrors({ ...valid, model_id: 'claude-sonnet-5' })
    expect(errors.model_id).toMatch(/provider\/model/)
  })

  it('rejects empty and whitespace-only model ids', () => {
    expect(ConfigUpdateSchema.safeParse({ ...valid, triage_model_id: '' }).success).toBe(false)
    expect(ConfigUpdateSchema.safeParse({ ...valid, triage_model_id: '   ' }).success).toBe(
      false,
    )
  })

  it('rejects a bad high_conviction_model_id shape', () => {
    const errors = fieldErrors({ ...valid, high_conviction_model_id: 'opus' })
    expect(errors.high_conviction_model_id).toMatch(/provider\/model/)
  })

  it('accepts rr_min at the 0.5 and 10 boundaries', () => {
    expect(ConfigUpdateSchema.safeParse({ ...valid, rr_min: 0.5 }).success).toBe(true)
    expect(ConfigUpdateSchema.safeParse({ ...valid, rr_min: 10 }).success).toBe(true)
  })

  it('rejects rr_min outside the sane 0.5–10 band', () => {
    expect(fieldErrors({ ...valid, rr_min: 0 }).rr_min).toMatch(/at least 0.5/)
    expect(fieldErrors({ ...valid, rr_min: 0.4 }).rr_min).toMatch(/at least 0.5/)
    expect(fieldErrors({ ...valid, rr_min: 10.5 }).rr_min).toMatch(/at most 10/)
    expect(fieldErrors({ ...valid, rr_min: -3 }).rr_min).toMatch(/at least 0.5/)
  })

  it('rejects non-numeric rr_min (strings, null, NaN, Infinity)', () => {
    expect(ConfigUpdateSchema.safeParse({ ...valid, rr_min: '3' }).success).toBe(false)
    expect(ConfigUpdateSchema.safeParse({ ...valid, rr_min: null }).success).toBe(false)
    expect(ConfigUpdateSchema.safeParse({ ...valid, rr_min: Number.NaN }).success).toBe(false)
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, rr_min: Number.POSITIVE_INFINITY }).success,
    ).toBe(false)
  })

  it('rejects a non-boolean high_conviction_enabled', () => {
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, high_conviction_enabled: 'true' }).success,
    ).toBe(false)
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, high_conviction_enabled: 1 }).success,
    ).toBe(false)
  })

  it('rejects a payload with missing fields', () => {
    expect(ConfigUpdateSchema.safeParse({}).success).toBe(false)
    const partial: Partial<typeof valid> = { ...valid }
    delete partial.high_conviction_model_id
    expect(ConfigUpdateSchema.safeParse(partial).success).toBe(false)
  })

  it('accepts every documented reasoning effort and null (provider default)', () => {
    for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', null]) {
      const parsed = ConfigUpdateSchema.safeParse({
        ...valid,
        model_effort: effort,
        triage_model_effort: effort,
        high_conviction_model_effort: effort,
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('rejects unknown reasoning efforts and non-string values', () => {
    expect(fieldErrors({ ...valid, model_effort: 'ultra' }).model_effort).toMatch(/one of/)
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, triage_model_effort: 'MEDIUM' }).success,
    ).toBe(false)
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, high_conviction_model_effort: 1 }).success,
    ).toBe(false)
  })

  // feat-079: execution bar volume — a positive integer inside the sane band.
  it('accepts execution_bar_volume at the 50 and 50000 boundaries', () => {
    expect(ConfigUpdateSchema.safeParse({ ...valid, execution_bar_volume: 50 }).success).toBe(true)
    expect(
      ConfigUpdateSchema.safeParse({ ...valid, execution_bar_volume: 50_000 }).success,
    ).toBe(true)
  })

  it('rejects execution_bar_volume outside the band, non-integers and non-numbers', () => {
    expect(fieldErrors({ ...valid, execution_bar_volume: 49 })).toHaveProperty(
      'execution_bar_volume',
    )
    expect(fieldErrors({ ...valid, execution_bar_volume: 50_001 })).toHaveProperty(
      'execution_bar_volume',
    )
    expect(fieldErrors({ ...valid, execution_bar_volume: 750.5 })).toHaveProperty(
      'execution_bar_volume',
    )
    expect(fieldErrors({ ...valid, execution_bar_volume: '750' })).toHaveProperty(
      'execution_bar_volume',
    )
  })

  it('rejects a payload missing execution_bar_volume (form always sends it)', () => {
    const { execution_bar_volume: _v, ...missing } = valid
    expect(fieldErrors(missing)).toHaveProperty('execution_bar_volume')
  })

  // feat-086: significant-move floor — a positive integer inside the sane band.
  it('accepts significant_move_pts at the 10 and 500 boundaries', () => {
    expect(ConfigUpdateSchema.safeParse({ ...valid, significant_move_pts: 10 }).success).toBe(true)
    expect(ConfigUpdateSchema.safeParse({ ...valid, significant_move_pts: 500 }).success).toBe(
      true,
    )
  })

  it('rejects significant_move_pts outside the band, non-integers and non-numbers', () => {
    expect(fieldErrors({ ...valid, significant_move_pts: 9 })).toHaveProperty(
      'significant_move_pts',
    )
    expect(fieldErrors({ ...valid, significant_move_pts: 501 })).toHaveProperty(
      'significant_move_pts',
    )
    expect(fieldErrors({ ...valid, significant_move_pts: 50.5 })).toHaveProperty(
      'significant_move_pts',
    )
    expect(fieldErrors({ ...valid, significant_move_pts: '50' })).toHaveProperty(
      'significant_move_pts',
    )
  })

  it('rejects a payload missing significant_move_pts (form always sends it)', () => {
    const { significant_move_pts: _s, ...missing } = valid
    expect(fieldErrors(missing)).toHaveProperty('significant_move_pts')
  })

  it('rejects a payload missing the effort fields (form always sends them)', () => {
    const partial: Partial<typeof valid> = { ...valid }
    delete partial.model_effort
    expect(ConfigUpdateSchema.safeParse(partial).success).toBe(false)
  })
})
