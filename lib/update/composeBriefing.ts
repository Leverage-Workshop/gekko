import type { BriefingUpdate, PersistedBriefing } from '@/knowledge/schema/briefing.schema'

/**
 * Compose the full Briefing an update run persists: the update supplies
 * meta + fresh Strategic Alignment (primary / secondary / danger zones); the
 * parent briefing's overview + terrain carry forward unchanged (the Gem's
 * "Update" never refreshed them). The result is what `raw_model_json` stores,
 * so the dashboard's `PersistedBriefing.safeParse` keeps working untouched —
 * including when the parent predates feat-060 and carries a legacy overview.
 */
export function composeUpdateBriefing(
  parent: PersistedBriefing,
  update: BriefingUpdate,
): PersistedBriefing {
  return {
    meta: update.meta,
    overview: parent.overview,
    terrain: parent.terrain,
    primary: update.primary,
    secondary: update.secondary,
    dangerZones: update.dangerZones,
  }
}
