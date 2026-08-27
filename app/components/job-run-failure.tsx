import type { JobRunFailure } from '@/lib/job-plan/dashboard/runFailure'

/**
 * Failed-run callout (feat-129): a non-retryable abort wrote NO job_plans
 * row, so this block is the only evidence the run happened. m-red is the
 * significant-UI accent (DESIGN.md) — this is the one moment on the Job view
 * that earns it. Pure presentation: the client run controls feed it the
 * described trigger.dev outcome.
 */
export function JobRunFailureCallout({
  failure,
  runId,
}: {
  failure: JobRunFailure
  runId: string
}) {
  return (
    <div
      role="alert"
      data-run-failure={failure.code}
      className="border-l-4 border-m-red bg-surface-card p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-m-red">
          Job plan run failed
        </span>
        <span className="border border-m-red px-2 py-0.5 text-xs font-bold uppercase tracking-[1.5px] text-m-red">
          {failure.status}
        </span>
        {failure.code !== 'unknown' && (
          <span className="text-xs font-light tracking-wide text-muted">{failure.code}</span>
        )}
      </div>
      <h3 className="mt-3 text-xl font-bold uppercase tracking-tight text-ink">{failure.title}</h3>
      <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">{failure.message}</p>
      <p className="mt-3 text-xs font-light tracking-wide text-muted">
        No job_plans row was written — the plan below is the previous run. Run {runId}.
      </p>
    </div>
  )
}
