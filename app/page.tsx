import type { DangerZone, Objective, Overview } from '@/knowledge/schema/briefing.schema'
import {
  buildExecutionChart,
  buildHighlightTerms,
  formatPrice,
  loadDashboardData,
  realDashboardDeps,
  type DashboardData,
  type DashboardEvalRow,
} from '@/lib/briefing'
import type { Briefing } from '@/knowledge/schema/briefing.schema'
import { BriefingTabs } from './components/briefing-tabs'
import { ExecutionChartSection } from './components/execution-chart-section'
import { Footer } from './components/footer'
import { HighlightedText } from './components/highlighted-text'
import { MStripe } from './components/m-stripe'
import { CheckEntryButton, RunBriefingButton } from './components/trigger-run-button'
import { TopNav } from './components/top-nav'

/**
 * Gekko dashboard (feat-019) — a server component that fetches the latest
 * briefing, eval result, and bundle freshness via the service-role client,
 * then renders the briefing as a dense tool view: compact meta strip, a
 * two-tab body (Objectives = execution chart + objective cards + danger
 * zones; Tactical Overview = the stacked prose read), and the latest entry
 * eval. The trigger buttons ("Run Briefing" feat-020, "Check Entry" feat-025)
 * live in the top-right of the nav.
 */

// Always render at request time: the page reads the live DB and must never be
// statically prerendered (build machines have no Supabase env).
export const dynamic = 'force-dynamic'

// All operator-facing times are Chicago (CME) time.
const CT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  dateStyle: 'short',
  timeStyle: 'short',
  hour12: false,
})

function fmtDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${CT_FORMAT.format(date).replace(', ', ' ')} CT`
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue">
      {children}
    </span>
  )
}

function BulletList({ items, terms }: { items: string[]; terms: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm font-light text-muted">—</p>
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm font-light leading-relaxed text-body">
          <span className="mt-[7px] h-1 w-1 shrink-0 bg-bmw-blue" aria-hidden="true" />
          <span>
            <HighlightedText text={item} terms={terms} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Rip-status condition color: Green/Yellow/Red map onto the semantic tones. */
function ripStatusTone(status: string): string {
  const value = status.toLowerCase()
  if (value.includes('green')) return 'text-success'
  if (value.includes('red')) return 'text-m-red'
  if (value.includes('yellow') || value.includes('amber')) return 'text-warning'
  return 'text-ink'
}

/** Tactical Overview tab: the three prose groups as stacked cards. */
function OverviewPane({ overview, terms }: { overview: Overview; terms: string[] }) {
  const groups: { title: string; items: string[] }[] = [
    { title: 'Current Position', items: overview.currentPosition },
    { title: 'Structural Architecture', items: overview.structuralArchitecture },
    { title: 'Order Flow Context', items: overview.orderFlowContext },
  ]
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <article
          key={group.title}
          className="border border-hairline border-t-2 border-t-hairline bg-surface-card p-6"
        >
          <div className="border-b border-hairline pb-4">
            <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink">
              {group.title}
            </span>
          </div>
          <div className="mt-4">
            <BulletList items={group.items} terms={terms} />
          </div>
        </article>
      ))}
    </div>
  )
}

/** Compact meta strip under the nav: price, rip status, HTF trend, run meta. */
function MetaStrip({
  briefing,
  payload,
  isStale,
  staleWarning,
  terms,
}: {
  briefing: { createdAt: string; triggerReason: string; modelId: string | null }
  payload: Briefing
  isStale: boolean
  staleWarning: string | null
  terms: string[]
}) {
  return (
    <section className="border-b border-hairline bg-surface-soft">
      <div className="mx-auto max-w-[1800px] px-6 py-4">
        <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-[auto_auto_1fr_auto]">
          <div className="bg-surface-soft px-5 py-4">
            <p className="text-2xl font-bold tracking-tight text-bmw-blue">
              {formatPrice(payload.meta.currentPrice)}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Current Price
            </p>
          </div>
          <div className="bg-surface-soft px-5 py-4">
            <p
              className={`text-2xl font-bold uppercase tracking-tight ${ripStatusTone(
                payload.meta.ripStatus,
              )}`}
            >
              {payload.meta.ripStatus}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Rip Status
            </p>
          </div>
          <div className="min-w-[280px] bg-surface-soft px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
              HTF Trend
            </p>
            <p className="mt-1 text-sm font-light leading-relaxed text-body-strong">
              <HighlightedText text={payload.meta.htfTrend} terms={terms} />
            </p>
          </div>
          <div className="bg-surface-soft px-5 py-4 md:text-right">
            <p className="text-xs font-light tracking-wide text-body">
              {fmtDate(briefing.createdAt)}
              {isStale && (
                <span
                  className="ml-3 border border-m-red px-2 py-0.5 text-xs font-bold uppercase tracking-[1.5px] text-m-red"
                  title={staleWarning ?? undefined}
                >
                  Stale
                </span>
              )}
            </p>
            <p className="mt-2 text-xs font-light tracking-wide text-muted">
              {briefing.triggerReason}
              {briefing.modelId && ` · ${briefing.modelId}`}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ObjectiveCard({
  heading,
  objective,
  terms,
}: {
  heading: string
  objective: Objective
  terms: string[]
}) {
  const rows: { point: string; price: number; description: string }[] = [
    ...objective.entries.map((entry) => ({
      point: entry.label,
      price: entry.price,
      description: entry.trigger,
    })),
    ...objective.stops.map((stop) => ({
      point: stop.label,
      price: stop.price,
      description: stop.invalidation,
    })),
    ...objective.targets.map((target) => ({
      point: `Target ${target.label.slice(1)} (${target.label})`,
      price: target.price,
      description: target.description,
    })),
  ]
  const sequence = objective.targets.map((t) => t.label).join(' → ')

  // Direction identity: bullish campaigns read bmw-blue, bearish read m-red.
  const isLong = objective.direction === 'long'
  const accentText = isLong ? 'text-bmw-blue' : 'text-m-red'
  const accentTop = isLong ? 'border-t-bmw-blue' : 'border-t-m-red'
  const accentBadge = isLong
    ? 'border-bmw-blue text-bmw-blue'
    : 'border-m-red text-m-red'

  return (
    <article
      className={`border border-hairline border-t-2 ${accentTop} bg-surface-card p-6`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink">
          {heading}
        </span>
        <span className="flex items-center gap-4">
          <span
            className={`border px-2.5 py-1 text-xs font-bold uppercase tracking-[1.5px] ${accentBadge}`}
          >
            {isLong ? 'Long · Bullish' : 'Short · Bearish'}
          </span>
          <span className="text-xs font-bold uppercase tracking-[1.5px] text-body-strong">
            R/R {objective.rr.toFixed(1)} : 1
          </span>
        </span>
      </div>

      <h3 className={`mt-4 text-xl font-bold tracking-tight ${accentText}`}>
        {objective.macroGoal}
      </h3>
      <p className="mt-2 text-sm font-light leading-relaxed text-body">
        <HighlightedText text={objective.rationale} terms={terms} />
      </p>
      {sequence && (
        <p className="mt-3 text-xs font-light uppercase tracking-wide text-muted">
          Target Sequence: <span className="text-body-strong">{sequence}</span>
        </p>
      )}

      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Action Point
            </th>
            <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Price
            </th>
            <th className="py-2 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Level / Description
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.point}-${row.price}`} className="border-b border-hairline-strong">
              <td className="py-2 pr-3 text-sm font-bold text-ink">{row.point}</td>
              <td
                className={`py-2 pr-3 text-sm font-bold tracking-tight ${accentText}`}
              >
                {formatPrice(row.price)}
              </td>
              <td className="py-2 text-sm font-light leading-relaxed text-body">
                <HighlightedText text={row.description} terms={terms} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

/** Danger Zones tab: one card per no-trade area. */
function DangerZones({ zones, terms }: { zones: DangerZone[]; terms: string[] }) {
  if (zones.length === 0) {
    return <p className="text-sm font-light text-muted">None flagged.</p>
  }
  return (
    <ul className="flex flex-col gap-6">
      {zones.map((zone) => (
        <li
          key={`${zone.area}-${zone.why}`}
          className="border border-hairline border-t-2 border-t-m-red bg-surface-card p-6"
        >
          <p className="text-sm font-bold uppercase tracking-wide text-m-red">
            Avoid: {zone.area}
          </p>
          <p className="mt-2 text-sm font-light leading-relaxed text-body">
            <HighlightedText text={zone.why} terms={terms} />
          </p>
        </li>
      ))}
    </ul>
  )
}

const EVAL_STATUS_CLASS: Record<string, string> = {
  ENTER: 'text-success border-success',
  WAIT: 'text-warning border-warning',
  NOT_VALID: 'text-m-red border-m-red',
  NO_ENTRY_NEAR: 'text-muted border-muted',
}

function EvalSection({
  evalResult,
  unavailable,
  terms,
}: {
  evalResult: DashboardEvalRow | null
  /** Dashboard load failed — don't render the run-your-first-eval CTA. */
  unavailable: boolean
  terms: string[]
}) {
  return (
    <section id="eval" className="border-b border-hairline">
      <div className="mx-auto max-w-[1800px] px-6 py-16">
        <SectionLabel>Latest Entry Eval</SectionLabel>
        {evalResult === null ? (
          <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted">
            {unavailable
              ? 'Entry evals unavailable — the database could not be reached.'
              : 'No entry evals yet — press Check Entry at Current Price above to run the first check against the active entry levels.'}
          </p>
        ) : (
          <div className="mt-6 border border-hairline bg-surface-card p-6">
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={`border px-3 py-1 text-sm font-bold uppercase tracking-[1.5px] ${
                  EVAL_STATUS_CLASS[evalResult.status] ?? 'text-body border-hairline'
                }`}
              >
                {evalResult.status.replaceAll('_', ' ')}
              </span>
              {evalResult.direction && (
                <span className="text-xs font-bold uppercase tracking-[1.5px] text-body-strong">
                  {evalResult.direction}
                </span>
              )}
              <span className="text-xs font-light uppercase tracking-wide text-muted">
                {fmtDate(evalResult.created_at)}
                {evalResult.current_price !== null &&
                  ` · at ${formatPrice(evalResult.current_price)}`}
              </span>
            </div>

            <div className="mt-5 grid gap-px bg-hairline sm:grid-cols-3">
              <div className="bg-surface-card p-4">
                <p className="text-xs font-light uppercase tracking-wide text-muted">Trigger</p>
                <p className="mt-1 text-sm font-light leading-relaxed text-body-strong">
                  {evalResult.trigger ?? '—'}
                </p>
              </div>
              <div className="bg-surface-card p-4">
                <p className="text-xs font-light uppercase tracking-wide text-muted">Stop</p>
                <p className="mt-1 text-lg font-bold tracking-tight text-ink">
                  {evalResult.stop !== null ? formatPrice(evalResult.stop) : '—'}
                </p>
              </div>
              <div className="bg-surface-card p-4">
                <p className="text-xs font-light uppercase tracking-wide text-muted">Targets</p>
                <p className="mt-1 text-lg font-bold tracking-tight text-ink">
                  {evalResult.targets && evalResult.targets.length > 0
                    ? evalResult.targets.map(formatPrice).join(' → ')
                    : '—'}
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm font-light leading-relaxed text-body">
              <HighlightedText text={evalResult.reason ?? ''} terms={terms} />
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export default async function Home() {
  let data: DashboardData | null = null
  let loadError: string | null = null
  try {
    data = await loadDashboardData(realDashboardDeps())
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load dashboard data'
  }

  const briefing = data?.briefing ?? null
  const payload = briefing?.payload ?? null
  const terms = payload ? buildHighlightTerms(payload) : []
  const chartModel =
    payload && data?.execBars
      ? buildExecutionChart(data.execBars, [payload.primary, payload.secondary])
      : null

  return (
    <>
      <TopNav
        actions={
          <>
            <CheckEntryButton size="sm" />
            <RunBriefingButton size="sm" />
          </>
        }
      />
      <MStripe className="mx-auto max-w-[1800px]" />

      <main className="flex flex-1 flex-col">
        {loadError && (
          <div className="mx-auto w-full max-w-[1800px] px-6 pt-6">
            <div className="border-l-4 border-m-red bg-surface-card p-6">
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
                Data Unavailable
              </span>
              <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">
                Could not reach the database: {loadError}
              </p>
            </div>
          </div>
        )}
        {data?.briefingError && (
          <div className="mx-auto w-full max-w-[1800px] px-6 pt-6">
            <p className="text-sm font-light text-m-red">{data.briefingError}</p>
          </div>
        )}

        {payload && briefing ? (
          <>
            <MetaStrip
              briefing={briefing}
              payload={payload}
              isStale={data?.staleness.isStale ?? false}
              staleWarning={data?.staleness.warning ?? null}
              terms={terms}
            />

            <section className="border-b border-hairline">
              <div className="mx-auto max-w-[1800px] px-6 py-8">
                <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
                  {/* Chart column: always visible */}
                  <ExecutionChartSection model={chartModel} terrain={payload.terrain} />

                  {/* Tabbed column */}
                  <BriefingTabs
                    objectives={
                      <div className="flex flex-col gap-6">
                        <ObjectiveCard
                          heading="I · Primary Objective"
                          objective={payload.primary}
                          terms={terms}
                        />
                        <ObjectiveCard
                          heading="II · Secondary Objective"
                          objective={payload.secondary}
                          terms={terms}
                        />
                      </div>
                    }
                    overview={<OverviewPane overview={payload.overview} terms={terms} />}
                    danger={<DangerZones zones={payload.dangerZones} terms={terms} />}
                  />
                </div>
              </div>
            </section>
          </>
        ) : (
          !loadError && (
            <section className="border-b border-hairline">
              <div className="mx-auto max-w-[1800px] px-6 py-24">
                <div className="mx-auto max-w-xl border border-hairline bg-surface-card p-10 text-center">
                  <h2 className="text-2xl font-bold uppercase tracking-tight text-ink">
                    No Briefing Yet
                  </h2>
                  <p className="mt-4 text-sm font-light leading-relaxed text-body">
                    Once Sierra Chart bundles are flowing, press Run Briefing (top right) to
                    produce the first tactical read. The objectives, execution chart, and
                    tactical overview render here.
                  </p>
                </div>
              </div>
            </section>
          )
        )}

        <EvalSection
          evalResult={data?.evalResult ?? null}
          unavailable={loadError !== null}
          terms={terms}
        />
      </main>

      <Footer />
    </>
  )
}
