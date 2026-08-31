import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The view's one client island (the run controls) reaches for the app router
// and the Realtime hook; neither exists under react-dom/server, so both are
// inert fakes here — the failure callout is tested through its pure component.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@trigger.dev/react-hooks', () => ({
  useRealtimeRun: () => ({ run: undefined, error: undefined }),
}))

import { JobPlanCard } from '@/app/components/job-plan-card'
import { JobPlanView } from '@/app/components/job-plan-view'
import { JobRunFailureCallout } from '@/app/components/job-run-failure'
import { loadJobPlanDashboard, type JobPlanCardData } from '@/lib/job-plan/dashboard/dashboardData'
import { describeJobRunFailure } from '@/lib/job-plan/dashboard/runFailure'
import type { JobPlanRow } from '@/lib/job-plan/dashboard/schema'
import { REQUEST_FRESH_BUNDLE, missingRefError } from '@/lib/job-plan/jobPlanErrors'
import { VISION_OFF_WARNING } from '@/lib/job-plan/visionRead'
import { BUNDLE_ID } from './helpers/jobPlanFiles'
import { persistedJobPlanRow, type RowVariant } from './helpers/jobPlanRows'

/**
 * The plan card renders the persisted JobPlan MECHANICALLY (feat-129): every
 * state — ready with the vision read, vision OFF, a partial read,
 * insufficient — from rows the real pipeline produced, plus the failed-run
 * callout and the view's empty / error frames. Rendered with react-dom/server
 * (the card is a server component tree with no hooks), asserted on the
 * static markup.
 */

async function cardData(
  variant: RowVariant,
  patch: Partial<JobPlanRow> = {}
): Promise<JobPlanCardData> {
  const row = await persistedJobPlanRow(variant)
  const { jobPlan, error } = await loadJobPlanDashboard({
    fetchLatestJobPlan: async () => ({ ...row, ...patch }),
  })
  if (!jobPlan) throw new Error(error ?? 'no plan')
  return jobPlan
}

const render = (data: JobPlanCardData) => renderToStaticMarkup(h(JobPlanCard, { data }))
const count = (html: string, needle: string) => html.split(needle).length - 1

/** `<` `>` `&` `"` `'` are escaped by React; compare plan text the same way. */
const escaped = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

describe('JobPlanCard: ready with the vision read ON', () => {
  it('renders status, lean, every play verbatim, context dimensions, data quality and the profile panels', async () => {
    const data = await cardData('ready-vision-on')
    const html = render(data)

    expect(html).toContain('data-plan-status="ready"')
    expect(html).toContain('data-section="lean"')
    expect(html).toContain(escaped(data.plan.lean.text))
    expect(count(html, 'data-play="')).toBe(data.plan.plays.length)
    for (const play of data.plan.plays) {
      expect(html).toContain(escaped(play.summary))
      expect(html).toContain(escaped(play.trigger))
      expect(html).toContain(escaped(play.dont))
      expect(html).toContain(escaped(play.activation.evidence))
      expect(html).toContain(escaped(play.invalidation.condition))
      for (const member of play.band.memberLabels) expect(html).toContain(escaped(member))
      for (const rule of play.activation.rulesFired) expect(html).toContain(`>${rule}<`)
      for (const stage of play.destinations) expect(html).toContain(escaped(stage.text))
      if (play.responseDeadline) expect(html).toContain(escaped(play.responseDeadline.text))
    }
    // The context header: both value reads, the cross-read, coverage as-of, data quality.
    expect(html).toContain('vs weekly value')
    expect(html).toContain('vs daily value')
    expect(html).toContain('data-cross-read=')
    expect(html).toContain(data.plan.context.origin.coverage.asOf.replace('T', ' '))
    expect(html).toContain('data-data-quality="sufficient"')
    expect(html).not.toContain('data-vision-warning')
    expect(html).not.toContain('data-insufficient')
    // Warnings are listed verbatim.
    for (const warning of data.warnings) expect(html).toContain(escaped(warning))
  })

  it('shows each rendered profile by hash with its consensus nodes overlaid and tabulated (kind, band, primary, k/S)', async () => {
    const data = await cardData('ready-vision-on')
    const html = render(data)
    expect(html).toContain('data-section="profiles"')
    for (const key of ['balance', 'rotation'] as const) {
      const entry = data.profileNodes!.profiles[key]!
      expect(html).toContain(`data-profile="${key}"`)
      for (const hash of entry.imageHashes) {
        expect(html).toContain(`src="/api/job-plans/images/${hash}"`)
        expect(html).toContain(`data-tile-hash="${hash}"`)
      }
      const nodes = entry.consensus!.nodes
      for (const node of nodes) {
        expect(html).toContain(`${node.priceLow.toFixed(2)} – ${node.priceHigh.toFixed(2)}`)
        expect(html).toContain(`${node.agreement}/${node.samples}`)
      }
      expect(html).toContain('data-node-primary="true"')
    }
    // One overlay rect per node (both profiles, single tile each in this fixture).
    const nodeCount = ['balance', 'rotation'].reduce(
      (n, key) => n + data.profileNodes!.profiles[key as 'balance' | 'rotation']!.consensus!.nodes.length,
      0
    )
    expect(count(html, '<rect ')).toBe(nodeCount)
    expect(html).toContain(`Vision read · ${data.profileNodes!.modelId}`)
  })
})

describe('JobPlanCard: the vision read OFF (R14) is LOUD', () => {
  it('renders the profile_nodes_unavailable banner as an alert, no profile panels, the plan still complete', async () => {
    const data = await cardData('ready-vision-off')
    const html = render(data)
    expect(html).toContain('data-plan-status="ready"')
    expect(html).toContain('role="alert" data-vision-warning="off"')
    expect(html).toContain('Profile nodes unavailable — plan built without the vision read')
    expect(html).toContain(escaped(VISION_OFF_WARNING))
    expect(html).not.toContain('data-section="profiles"')
    expect(count(html, 'data-play="')).toBe(data.plan.plays.length)
    expect(html).toContain('vision off')
  })

  it('a partial read keeps the banner for the failed profile and the panel says No consensus', async () => {
    const data = await cardData('ready-vision-partial')
    const html = render(data)
    expect(html).toContain('data-vision-warning="partial"')
    expect(html).toContain('Profile nodes partial')
    expect(html).not.toContain('built without the vision read')
    expect(html).toContain('profile_nodes_unavailable:rotation')
    expect(html).toContain('data-section="profiles"')
    expect(html).toContain('No consensus · profile_nodes_unavailable:rotation')
    expect(html).toContain('data-profile="balance"')
  })

  it('malformed profile_nodes: the banner carries the parse error line', async () => {
    const data = await cardData('ready-vision-on', { profile_nodes: { garbage: 1 } })
    const html = render(data)
    expect(html).toContain('data-vision-warning="unreadable"')
    expect(html).toContain('the plan did use them')
    expect(html).not.toContain('built without the vision read')
    expect(html).toContain('did not parse as a persisted vision read')
    expect(html).not.toContain('data-section="profiles"')
  })
})

describe('JobPlanCard: insufficient', () => {
  it('renders the explicit insufficient block with its reasons, no plays and no lean', async () => {
    const data = await cardData('insufficient')
    const html = render(data)
    expect(html).toContain('data-plan-status="insufficient"')
    expect(html).toContain('role="alert" data-insufficient')
    expect(html).toContain('Insufficient — no plays')
    for (const reason of data.plan.standDownReasons) expect(html).toContain(escaped(reason))
    expect(html).not.toContain('data-play="')
    expect(html).not.toContain('data-section="lean"')
    expect(html).toContain('data-data-quality="insufficient"')
  })
})

describe('JobRunFailureCallout: an aborted run never looks like nothing happened', () => {
  it('renders the taxonomy title, the remediation message and the no-row note as an alert', () => {
    const error = missingRefError(BUNDLE_ID, 'job-study daily', 'job_study_daily_ref')
    const failure = describeJobRunFailure('FAILED', { message: error.message })
    const html = renderToStaticMarkup(h(JobRunFailureCallout, { failure, runId: 'run_x1' }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-run-failure="bundle_ref_missing"')
    expect(html).toContain('Export missing from the bundle')
    expect(html).toContain(escaped(REQUEST_FRESH_BUNDLE))
    expect(html).toContain('No job_plans row was written')
    expect(html).toContain('run_x1')
    expect(html).toContain('>FAILED<')
  })
})

describe('JobPlanView frames', () => {
  it('no row yet → the empty state and the run controls', () => {
    const html = renderToStaticMarkup(
      h(JobPlanView, { data: { jobPlan: null, error: null }, loadError: null })
    )
    expect(html).toContain('data-empty="job-plan"')
    expect(html).toContain('Run Job plan')
    expect(html).not.toContain('data-plan-error')
  })

  it('an unreadable row → the plan error, never a half card', () => {
    const html = renderToStaticMarkup(
      h(JobPlanView, {
        data: { jobPlan: null, error: 'row r1 failed JobPlan schema validation' },
        loadError: null,
      })
    )
    expect(html).toContain('data-plan-error')
    expect(html).toContain('row r1 failed JobPlan schema validation')
    expect(html).not.toContain('data-empty')
  })

  it('a load failure → Data Unavailable', () => {
    const html = renderToStaticMarkup(h(JobPlanView, { data: null, loadError: 'db down' }))
    expect(html).toContain('Data Unavailable')
    expect(html).toContain('db down')
  })

  it('a ready row → the card inside the view', async () => {
    const data = await cardData('ready-vision-off')
    const html = renderToStaticMarkup(
      h(JobPlanView, { data: { jobPlan: data, error: null }, loadError: null })
    )
    expect(html).toContain(`data-job-plan="${data.id}"`)
  })
})
