import type { JobPlanAbortCode } from '../jobPlanErrors'

/**
 * Failed-run surfacing (feat-129, docs/job-planning-task-plan.md step 7): a
 * non-retryable abort writes NO `job_plans` row, so the only trace of the run
 * is the trigger.dev outcome the dashboard's Realtime subscription sees.
 * This turns that outcome (terminal status + serialized error) into the
 * remediation card — the taxonomy message from feat-128 verbatim under a
 * title keyed off its code — so an aborted run never reads as "nothing
 * happened".
 */

export type JobRunFailureCode = JobPlanAbortCode | 'unknown'

export type JobRunFailure = {
  readonly status: string
  readonly code: JobRunFailureCode
  readonly title: string
  /** The operator-remediable message (the taxonomy text, prefix stripped). */
  readonly message: string
  /** Always true: a failed run wrote nothing; the card below is the previous run. */
  readonly noRowWritten: true
}

export type SerializedRunError = { readonly name?: string; readonly message: string }

const TITLES: Readonly<Record<JobPlanAbortCode, string>> = {
  bundle_ref_missing: 'Export missing from the bundle',
  bundle_wait_timed_out: 'Fresh bundle never arrived',
  bundle_request_missing: 'Bundle request not found',
  bundle_unfulfilled: 'Bundle request fulfilled without a bundle',
  bundle_not_found: 'Fulfilling bundle is gone',
  bundle_invalid: 'Bundle unusable',
  profile_unsupported: 'Profile export does not parse',
}

const STATUS_TITLES: Readonly<Record<string, string>> = {
  CANCELED: 'Run canceled',
  TIMED_OUT: 'Run timed out',
  CRASHED: 'Run crashed',
  SYSTEM_FAILURE: 'Run failed (system)',
  EXPIRED: 'Run expired',
}

const NO_ERROR_MESSAGE =
  'The run ended without a job plan — no job_plans row was written. Check the trigger.dev dashboard for the run log.'

const CODE_PREFIX = /^([a-z_]+):\s*/

function codeOf(message: string): JobPlanAbortCode | null {
  const match = CODE_PREFIX.exec(message)
  if (!match) return null
  const code = match[1]
  return code in TITLES ? (code as JobPlanAbortCode) : null
}

export function describeJobRunFailure(
  status: string,
  error: SerializedRunError | null | undefined
): JobRunFailure {
  const statusTitle = STATUS_TITLES[status] ?? 'Run failed'
  if (!error || error.message.trim().length === 0) {
    return {
      status,
      code: 'unknown',
      title: statusTitle,
      message: NO_ERROR_MESSAGE,
      noRowWritten: true,
    }
  }
  const code = codeOf(error.message)
  if (code === null) {
    return {
      status,
      code: 'unknown',
      title: statusTitle,
      message: error.message,
      noRowWritten: true,
    }
  }
  return {
    status,
    code,
    title: TITLES[code],
    message: error.message.replace(CODE_PREFIX, ''),
    noRowWritten: true,
  }
}
