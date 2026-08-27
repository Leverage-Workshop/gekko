'use client'

import { describeJobRunFailure } from '@/lib/job-plan/dashboard/runFailure'
import { Button } from './button'
import { JobRunFailureCallout } from './job-run-failure'
import { statusLabel, useTriggeredRun } from './use-triggered-run'

/**
 * "Run Job plan" (feat-129) on the shared queue → watch → refresh state
 * machine (use-triggered-run): POST /api/job-plans/run → job-plan-task. The
 * button sits in the Job view's header row; a terminal failure renders the
 * remediation callout FULL WIDTH below the row (the taxonomy message from
 * feat-128 via `describeJobRunFailure`), because an aborted run writes no
 * job_plans row and must never look like "nothing happened".
 */
export function JobPlanRunControls({ title }: { title: string }) {
  const { state, runStatus, inFlight, completed, failedStatus, runError, watchBroken, runAction } =
    useTriggeredRun('/api/job-plans/run')

  const buttonLabel =
    state.phase === 'queuing'
      ? 'Queuing…'
      : inFlight && state.phase === 'watching'
        ? `${statusLabel(runStatus)}…`
        : 'Run Job plan'
  const watching = state.phase === 'watching' ? state : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold uppercase tracking-tight text-ink">{title}</h2>
        <div className="flex items-center gap-4">
          <div role="status" className="text-right text-xs font-light tracking-wide">
            {inFlight && watching && (
              <span className="text-muted">
                {statusLabel(runStatus)} — run {watching.runId}. The plan refreshes when it
                finishes.
              </span>
            )}
            {watchBroken && (
              <span className="text-warning">
                Queued — run {watching?.runId ?? ''}, but live status is unavailable. Reload in a
                minute.
              </span>
            )}
            {state.phase === 'queued-untracked' && (
              <span className="text-success">Queued — run {state.runId}. Reload in a minute.</span>
            )}
            {completed && watching && (
              <span className="text-success">Run complete — the new Job plan is below.</span>
            )}
            {state.phase === 'error' && <span className="text-m-red">{state.message}</span>}
          </div>
          <Button size="sm" onClick={() => void runAction()} disabled={inFlight}>
            {buttonLabel}
          </Button>
        </div>
      </div>
      {failedStatus && watching && (
        <JobRunFailureCallout
          failure={describeJobRunFailure(failedStatus, runError)}
          runId={watching.runId}
        />
      )}
    </div>
  )
}
