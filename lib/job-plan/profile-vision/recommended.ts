import type { ReasoningEffort } from '@/lib/llm/reasoning'

/**
 * The profile-vision configuration the 2026-08-30 validation run recommends
 * (feat-131, `docs/profile-vision-validation-2026-08-30.md`).
 *
 * This is a RECOMMENDATION the settings UI offers, deliberately NOT the config
 * fallback default. `PROFILE_VISION_DEFAULTS.profile_vision_model_id` stays
 * `null` because a null model id is a safety property, not a preference: it
 * means the read is OFF and the planner degrades with a banner (R14). Making a
 * real model the fallback would silently start paid vision calls in any
 * environment whose `config` row predates the profile_vision_config migration.
 * Enabling the read stays an explicit operator action in /settings.
 */
export const RECOMMENDED_PROFILE_VISION: {
  readonly modelId: string
  readonly effort: ReasoningEffort
  readonly samples: number
  /** Where the numbers behind this recommendation live. */
  readonly evidence: string
} = {
  modelId: 'openai/gpt-5.6-sol',
  effort: 'low',
  samples: 3,
  evidence: 'docs/profile-vision-validation-2026-08-30.md',
}
