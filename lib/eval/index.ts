export { realEvalDeps } from './deps'
export {
  DEFAULT_TRIAGE_MODEL_ID,
  EvalInputError,
  runEval,
} from './evalBundle'
export type { EvalConfig, EvalDeps, EvalRunResult } from './evalBundle'
export { buildEvalResultRow, persistEvalResult } from './persistEval'
export type {
  EvalResultInsert,
  PersistEvalDeps,
  PersistEvalInput,
} from './persistEval'
export { buildEvalPrompt } from './prompt'
export type { EvalPromptInput } from './prompt'
export {
  DEFAULT_NEAR_ENTRY_POINTS,
  DEFAULT_PROXIMITY_WINDOW_SECONDS,
  assessProximity,
  computeRecentBarRange,
  filterRecentBars,
} from './proximity'
export type {
  EntryLevelRow,
  ProximityAssessment,
  ProximityOptions,
  RecentBarRange,
} from './proximity'
export { enforceEvalFacts } from './validateEval'
export type { EnforceEvalOptions, ValidatedEval } from './validateEval'
