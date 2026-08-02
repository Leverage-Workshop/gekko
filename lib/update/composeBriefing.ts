import type { BriefingUpdate, PersistedBriefing } from '@/knowledge/schema/briefing.schema'
import type { OperatorDirective } from './directive'

/**
 * Compose the full Briefing an update run persists: the update supplies
 * meta + fresh Strategic Alignment (primary / secondary / danger zones); the
 * parent briefing's overview + terrain carry forward unchanged (the Gem's
 * "Update" never refreshed them). The result is what `raw_model_json` stores,
 * so the dashboard's `PersistedBriefing.safeParse` keeps working untouched —
 * including when the parent predates feat-060 and carries a legacy overview.
 *
 * feat-061: on operator-directive runs the UNTARGETED objective is hard-frozen
 * — taken from the parent verbatim, regardless of what the model output for
 * that slot. The operator steered one objective; the other must not drift.
 * The frozen objective replays through enforceCodeOwnedFacts, whose
 * cross-objective distinct-anchor floors then hold the directed entry clear of
 * it — an incompatible directive fails the run loudly (operator decision).
 */
export function composeUpdateBriefing(
  parent: PersistedBriefing,
  update: BriefingUpdate,
  directive?: OperatorDirective,
): PersistedBriefing {
  return {
    meta: update.meta,
    overview: parent.overview,
    terrain: parent.terrain,
    // feat-078: the pattern scan reads the CURRENT execution chart — always
    // the update's fresh verdict, never the parent's stale one.
    patternScan: update.patternScan,
    primary: directive?.objective === 'secondary' ? parent.primary : update.primary,
    secondary: directive?.objective === 'primary' ? parent.secondary : update.secondary,
    dangerZones: update.dangerZones,
  }
}
