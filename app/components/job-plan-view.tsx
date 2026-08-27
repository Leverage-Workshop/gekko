import type { JobPlanDashboardData } from '@/lib/job-plan/dashboard/dashboardData'
import { JobPlanCard } from './job-plan-card'
import { JobPlanRunControls } from './job-plan-run'
import { UpdateGlow } from './update-glow'

/**
 * The Job view (feat-129): the run controls (with failed-run surfacing) over
 * the latest persisted plan. Server component — the card is rendered from
 * the row the page loaded; the controls are the one client island.
 */
export function JobPlanView({
  data,
  loadError,
}: {
  data: JobPlanDashboardData | null
  loadError: string | null
}) {
  const jobPlan = data?.jobPlan ?? null
  return (
    <section className="border-b border-hairline" data-view="job">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-8">
        <JobPlanRunControls title="Job plan" />

        {loadError && (
          <div className="border-l-4 border-m-red bg-surface-card p-6">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
              Data Unavailable
            </span>
            <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">
              Could not load the latest Job plan: {loadError}
            </p>
          </div>
        )}
        {data?.error && (
          <div className="border-l-4 border-m-red bg-surface-card p-6" data-plan-error>
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
              Plan unreadable
            </span>
            <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">{data.error}</p>
          </div>
        )}

        {jobPlan ? (
          <UpdateGlow updateKey={jobPlan.id}>
            <JobPlanCard data={jobPlan} />
          </UpdateGlow>
        ) : (
          !loadError &&
          !data?.error && (
            <div
              className="mx-auto w-full max-w-xl border border-hairline bg-surface-card p-10 text-center"
              data-empty="job-plan"
            >
              <h3 className="text-2xl font-bold uppercase tracking-tight text-ink">
                No Job Plan Yet
              </h3>
              <p className="mt-4 text-sm font-light leading-relaxed text-body">
                Press Run Job plan after the open. The task requests a fresh bundle, reads the
                job-study exports and the two rolling profiles, and renders the plan here. An
                aborted run reports its cause above this card.
              </p>
            </div>
          )
        )}
      </div>
    </section>
  )
}
