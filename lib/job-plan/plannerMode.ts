/**
 * Which planner composes production Job plans (feat-145, operator decision
 * 2026-09-01: "make it what production uses now, and roll back if we don't
 * get it to a point I like").
 *
 * 'llm'           the judgment core (frame, play bands, direction, ranking,
 *                 lean) comes from the model under lib/job-plan/llm-planner,
 *                 assembled into the persisted JobPlan by code
 *                 (assembleLlmPlan) — geometry, provenance and every hard
 *                 gate stay code-owned.
 * 'deterministic' the feat-127 planner exactly as before the cutover.
 *
 * ROLLBACK is this one line: flip to 'deterministic' and merge — no
 * migration, no config change; the trigger dev server rebuilds on merge.
 * Kept as a module constant rather than a config column deliberately: the
 * config read has a six-tier missing-column degradation cascade and this
 * environment cannot guarantee a migration is applied before code lands.
 */

export type JobPlannerKind = 'deterministic' | 'llm'

export const JOB_PLANNER: JobPlannerKind = 'llm'
