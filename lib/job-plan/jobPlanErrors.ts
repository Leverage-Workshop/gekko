import { JobStudyParseError } from './parseJobStudy'
import { PlannerInputError } from './runPlanner'

/**
 * The job-plan task's error taxonomy (feat-128, docs/job-planning-task-plan.md
 * "Key decisions" 2 and 3). Everything here is NON-RETRYABLE: a retry cannot
 * conjure a missing export, fix an unsupported schema or fulfil a bundle
 * request the uploader never answered — the task maps these to
 * `AbortTaskRunError` with an operator-remediable message.
 *
 *   bundle_wait_timed_out   the fresh-bundle request was not fulfilled in time
 *   bundle_request_missing  the bundle_requests row does not exist
 *   bundle_unfulfilled      fulfilled without a bundle id (should not happen)
 *   bundle_not_found        the fulfilling bundle row is gone
 *   bundle_invalid          the row is unusable (no MGI JSON / no received_at)
 *   bundle_ref_missing      a required export ref is NULL — names the two usual
 *                           causes and says "request a fresh bundle"
 *   profile_unsupported     a profile export does not parse
 *
 * Parse failures thrown by the planner itself (`JobStudyParseError`,
 * `PlannerInputError` — "export present but schema/settings unsupported")
 * are non-retryable for the same reason; {@link isNonRetryableJobPlanError}
 * covers all of them. Geometry that parses but is INSUFFICIENT is not an
 * error at all: the planner returns `status: 'insufficient'` and the task
 * persists it.
 */

export type JobPlanAbortCode =
  | 'bundle_wait_timed_out'
  | 'bundle_request_missing'
  | 'bundle_unfulfilled'
  | 'bundle_not_found'
  | 'bundle_invalid'
  | 'bundle_ref_missing'
  | 'profile_unsupported'

export class JobPlanAbortError extends Error {
  readonly code: JobPlanAbortCode
  constructor(code: JobPlanAbortCode, message: string) {
    super(`${code}: ${message}`)
    this.name = 'JobPlanAbortError'
    this.code = code
  }
}

export const REQUEST_FRESH_BUNDLE = 'request a fresh bundle from the dashboard once fixed'

/** The two usual causes of a NULL job-planning ref, spelled out for the operator. */
export const REF_MISSING_CAUSES =
  'usual causes: the Sierra exporter for it is not deployed, or the Windows uploader checkout is behind main (pull + restart the uploader)'

export function missingRefError(bundleId: string, what: string, column: string): JobPlanAbortError {
  return new JobPlanAbortError(
    'bundle_ref_missing',
    `bundle ${bundleId} has no ${what} export (${column} is NULL) — ${REF_MISSING_CAUSES}; ${REQUEST_FRESH_BUNDLE}`,
  )
}

export function bundleWaitError(
  outcome: 'timed-out' | 'missing' | 'unfulfilled',
  bundleRequestId: string,
): JobPlanAbortError {
  switch (outcome) {
    case 'timed-out':
      return new JobPlanAbortError(
        'bundle_wait_timed_out',
        `fresh-bundle request ${bundleRequestId} was not fulfilled within the wait window — the uploader is offline or not polling; start it and ${REQUEST_FRESH_BUNDLE}`,
      )
    case 'missing':
      return new JobPlanAbortError(
        'bundle_request_missing',
        `fresh-bundle request ${bundleRequestId} does not exist — ${REQUEST_FRESH_BUNDLE}`,
      )
    case 'unfulfilled':
      return new JobPlanAbortError(
        'bundle_unfulfilled',
        `fresh-bundle request ${bundleRequestId} was marked fulfilled without a bundle id — ${REQUEST_FRESH_BUNDLE}`,
      )
  }
}

/** True for every failure the task must NOT retry (the taxonomy above + the planner's parse errors). */
export function isNonRetryableJobPlanError(error: unknown): boolean {
  return (
    error instanceof JobPlanAbortError ||
    error instanceof JobStudyParseError ||
    error instanceof PlannerInputError
  )
}

export function describeJobPlanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
