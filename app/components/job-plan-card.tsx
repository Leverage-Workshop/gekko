import type { JobPlanCardData } from '@/lib/job-plan/dashboard/dashboardData'
import { formatInstantCt, formatWallClock, shortHash } from '@/lib/job-plan/dashboard/format'
import { JobContextHeader } from './job-plan-context'
import { JobPlayCard } from './job-plan-play'
import { JobProfilePanels } from './job-plan-profiles'

/**
 * The Job plan card (feat-129): a MECHANICAL rendering of the persisted
 * JobPlan — meta strip, the LOUD profile-nodes warning, the explicit
 * insufficient state with its reasons, the context header, the lean, the
 * play cards, what was pruned, stand-down reasons, warnings, and the
 * profile panels. No prose generation, no model.
 */

const LABEL = 'text-xs font-bold uppercase tracking-[1.5px] text-muted'

function MetaStrip({ data }: { data: JobPlanCardData }) {
  const ready = data.status === 'ready'
  const meta = data.plan.meta
  return (
    <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-[auto_auto_auto_1fr_auto]">
      <div className="bg-surface-soft px-5 py-3">
        <p
          className={`text-2xl font-bold uppercase tracking-tight ${ready ? 'text-bmw-blue' : 'text-m-red'}`}
          data-plan-status={data.status}
        >
          {data.status}
        </p>
        <p className={`mt-1 ${LABEL}`}>Plan status</p>
      </div>
      <div className="bg-surface-soft px-5 py-3">
        <p className="text-2xl font-bold tracking-tight text-ink">
          {data.plan.geometryRefs.price.toFixed(2)}
        </p>
        <p className={`mt-1 ${LABEL}`}>
          {meta.symbol} · price ({data.plan.context.price.source})
        </p>
      </div>
      <div className="bg-surface-soft px-5 py-3">
        <p className={LABEL}>Trading day · as of</p>
        <p className="mt-1 text-sm font-bold uppercase tracking-wide text-ink">
          {meta.tradingDay} · {formatWallClock(meta.asOf)}
        </p>
      </div>
      <div className="bg-surface-soft px-5 py-3">
        <p className={LABEL}>Planner</p>
        <p className="mt-1 text-xs font-light leading-relaxed text-body">
          {data.plannerRevision} · vision {meta.visionModelId ?? 'off'}
          {meta.visionPromptRevision ? ` (${meta.visionPromptRevision})` : ''} · fingerprint{' '}
          <span title={data.inputFingerprint}>{shortHash(data.inputFingerprint)}</span>
        </p>
      </div>
      <div className="bg-surface-soft px-5 py-3 md:text-right">
        <p className="text-xs font-light tracking-wide text-body">
          {formatInstantCt(data.createdAt)}
        </p>
        <p className="mt-2 text-xs font-light tracking-wide text-muted">
          {data.triggerReason} · run <span title={data.runId}>{shortHash(data.runId)}</span> ·
          bundle <span title={data.bundleId}>{shortHash(data.bundleId)}</span>
        </p>
      </div>
    </div>
  )
}

/**
 * The R14 degradation, said LOUDLY — and accurately: the read was OFF (no
 * nodes at all), PARTIAL (a profile produced no consensus; the plan used the
 * rest), or the persisted nodes are unreadable for DISPLAY only (the planner
 * consumed them at run time; only the overlay is missing).
 */
export function visionBannerHeading(data: JobPlanCardData): string {
  if (data.visionOff) return 'Profile nodes unavailable — plan built without the vision read'
  if (data.profileNodesError) {
    return 'Profile nodes unreadable on this row — overlay unavailable; the plan did use them'
  }
  return 'Profile nodes partial — a profile produced no consensus; plan built without it'
}

function VisionWarningBanner({ data }: { data: JobPlanCardData }) {
  const lines = [
    ...data.visionWarnings,
    ...(data.profileNodesError ? [data.profileNodesError] : []),
  ]
  if (lines.length === 0 && !data.visionOff) return null
  const kind = data.visionOff ? 'off' : data.profileNodesError ? 'unreadable' : 'partial'
  return (
    <div
      role="alert"
      data-vision-warning={kind}
      className="border-l-4 border-m-red bg-surface-card p-6"
    >
      <span className="text-xs font-bold uppercase tracking-[1.5px] text-m-red">
        {visionBannerHeading(data)}
      </span>
      <ul className="mt-2 space-y-1">
        {(lines.length > 0 ? lines : ['profile_nodes is empty on this row']).map((line) => (
          <li key={line} className="text-sm font-light leading-relaxed text-body-strong">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

function InsufficientBlock({ reasons }: { reasons: readonly string[] }) {
  return (
    <div
      role="alert"
      data-insufficient
      className="border border-m-red border-t-2 border-t-m-red bg-surface-card p-6"
    >
      <h3 className="text-xl font-bold uppercase tracking-tight text-m-red">
        Insufficient — no plays
      </h3>
      <p className="mt-2 text-sm font-light leading-relaxed text-body">
        The geometry parsed but the planner would not arm anything (R13 / core geometry). Reasons:
      </p>
      <ul className="mt-3 space-y-2">
        {reasons.map((reason) => (
          <li
            key={reason}
            className="flex gap-3 text-sm font-light leading-relaxed text-body-strong"
          >
            <span className="mt-[7px] h-1 w-1 shrink-0 bg-m-red" aria-hidden="true" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TextList({
  title,
  items,
  tone,
  attr,
}: {
  title: string
  items: readonly string[]
  tone: string
  attr: string
}) {
  if (items.length === 0) return null
  return (
    <div className="border border-hairline bg-surface-card p-6" data-list={attr}>
      <span className={`text-xs font-bold uppercase tracking-[1.5px] ${tone}`}>{title}</span>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm font-light leading-relaxed text-body">
            <span className="mt-[7px] h-1 w-1 shrink-0 bg-bmw-blue" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PrunedList({ pruned }: { pruned: JobPlanCardData['plan']['pruned'] }) {
  if (pruned.length === 0) return null
  return (
    <div className="border border-hairline bg-surface-card p-6" data-list="pruned">
      <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">Pruned</span>
      <ul className="mt-3 space-y-2">
        {pruned.map((branch) => (
          <li
            key={`${branch.bandId ?? 'zone'}-${branch.label}`}
            className="text-sm font-light leading-relaxed text-body"
          >
            <span className="font-bold text-ink">{branch.label}</span> — {branch.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FrameBlock({ frame }: { frame: NonNullable<JobPlanCardData['plan']['frame']> }) {
  const tone =
    frame.side === 'above'
      ? { border: 'border-t-2 border-t-bmw-blue', label: 'text-bmw-blue' }
      : frame.side === 'below'
        ? { border: 'border-t-2 border-t-m-red', label: 'text-m-red' }
        : { border: '', label: 'text-muted' }
  return (
    <div
      className={`border border-hairline ${tone.border} bg-surface-card p-6`}
      data-section="frame"
    >
      <span className={`text-xs font-bold uppercase tracking-[1.5px] ${tone.label}`}>
        Frame · {frame.side} the {frame.label}
      </span>
      <p className="mt-3 text-base font-light leading-relaxed text-body">{frame.text}</p>
    </div>
  )
}

function LeanBlock({ lean }: { lean: JobPlanCardData['plan']['lean'] }) {
  return (
    <div
      className="border border-hairline border-t-2 border-t-bmw-blue bg-surface-card p-6"
      data-section="lean"
    >
      <span className="text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue">
        Primary lean · {lean.basis}
        {lean.playId ? ` · ${lean.playId}` : ''}
      </span>
      <p className="mt-3 text-xl font-bold tracking-tight text-ink">{lean.text}</p>
    </div>
  )
}

export function JobPlanCard({ data }: { data: JobPlanCardData }) {
  const plan = data.plan
  return (
    <div className="flex flex-col gap-6" data-job-plan={data.id}>
      <MetaStrip data={data} />
      <VisionWarningBanner data={data} />
      {plan.status === 'insufficient' && <InsufficientBlock reasons={plan.standDownReasons} />}
      <JobContextHeader context={plan.context} />
      {plan.status === 'ready' && plan.frame != null && <FrameBlock frame={plan.frame} />}
      {plan.status === 'ready' && <LeanBlock lean={plan.lean} />}
      {plan.plays.length > 0 && (
        <div className="grid items-start gap-6 xl:grid-cols-2" data-section="plays">
          {plan.plays.map((play) => (
            <JobPlayCard key={play.id} play={play} />
          ))}
        </div>
      )}
      {plan.status === 'ready' && (
        <TextList
          title="Stand-down reasons"
          items={plan.standDownReasons}
          tone="text-warning"
          attr="stand-down"
        />
      )}
      <PrunedList pruned={plan.pruned} />
      <TextList title="Warnings" items={data.warnings} tone="text-warning" attr="warnings" />
      {data.profileNodes && <JobProfilePanels nodes={data.profileNodes} />}
    </div>
  )
}
