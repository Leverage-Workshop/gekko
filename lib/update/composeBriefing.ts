import type { Briefing, BriefingUpdate } from '@/knowledge/schema/briefing.schema'

/**
 * Compose the full Briefing an update run persists: the update supplies
 * meta + fresh Strategic Alignment (primary / secondary / danger zones); the
 * parent briefing's overview + terrain carry forward unchanged (the Gem's
 * "Update" never refreshed them). The result is what `raw_model_json` stores,
 * so the dashboard's `Briefing.safeParse` keeps working untouched.
 */
export function composeUpdateBriefing(parent: Briefing, update: BriefingUpdate): Briefing {
  return {
    meta: update.meta,
    overview: parent.overview,
    terrain: parent.terrain,
    primary: update.primary,
    secondary: update.secondary,
    dangerZones: update.dangerZones,
  }
}
