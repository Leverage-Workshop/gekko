import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECOMMENDED_PROFILE_VISION } from '@/lib/job-plan/profile-vision/recommended'
import { PROFILE_VISION_DEFAULTS } from '@/lib/config/fetchConfig'
import { REASONING_EFFORTS } from '@/lib/llm/reasoning'

describe('profile-vision recommendation (feat-131)', () => {
  it('names a concrete model, a legal effort, and a legal sample count', () => {
    expect(RECOMMENDED_PROFILE_VISION.modelId).toMatch(/^[a-z0-9-]+\/[a-zA-Z0-9.\-_]+$/)
    expect(REASONING_EFFORTS).toContain(RECOMMENDED_PROFILE_VISION.effort)
    expect(RECOMMENDED_PROFILE_VISION.samples).toBeGreaterThanOrEqual(1)
    expect(RECOMMENDED_PROFILE_VISION.samples).toBeLessThanOrEqual(5)
  })

  it('is NOT a flash/mini/lite tier (they game validation floors)', () => {
    expect(RECOMMENDED_PROFILE_VISION.modelId).not.toMatch(/flash|mini|lite|nano/i)
  })

  it('points at an evidence document that exists and names the model', () => {
    const path = join(process.cwd(), RECOMMENDED_PROFILE_VISION.evidence)
    expect(existsSync(path), `missing evidence doc: ${RECOMMENDED_PROFILE_VISION.evidence}`).toBe(
      true
    )
    const doc = readFileSync(path, 'utf8')
    expect(doc).toContain(RECOMMENDED_PROFILE_VISION.modelId)
  })

  it('does NOT become the config fallback — a null model id keeps the read OFF (R14)', () => {
    // A recommendation the operator applies in /settings, never a silent
    // default: making a real model the fallback would start paid vision calls
    // in any environment whose config row predates the migration.
    expect(PROFILE_VISION_DEFAULTS.profile_vision_model_id).toBeNull()
    expect(PROFILE_VISION_DEFAULTS.profile_vision_model_effort).toBeNull()
  })
})
