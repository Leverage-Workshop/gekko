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
import type { StalenessAssessment } from '@/lib/engine/staleness'
import { ExecutionChartSection } from './components/execution-chart-section'
import { Footer } from './components/footer'
import { HighlightedText } from './components/highlighted-text'
import { MStripe } from './components/m-stripe'
import { CheckEntryButton, RunBriefingButton } from './components/trigger-run-button'
import { TopNav } from './components/top-nav'

/**
 * Gekko dashboard (feat-019) — replaces the filler marketing page. A server
 * component that fetches the latest briefing, latest eval result, and latest
 * bundle freshness via the service-role client, then renders the full Gem
 * "Morning Briefing" parity view: tactical overview, terrain zone map,
 * primary/secondary objectives, danger zones, and the latest entry eval.
 * Hosts both trigger buttons ("Run Briefing" wired via feat-020; "Check Entry
 * at Current Price" wired via feat-025 → POST /api/eval/run → eval-task).
 */

// Always render at request time: the page reads the live DB and must never be
// statically prerendered (build machines have no Supabase env).
export const dynamic = 'force-dynamic'

function fmtDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
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

function StaleBanner({ staleness }: { staleness: StalenessAssessment }) {
  if (!staleness.isStale) return null
  return (
    <div className="border-l-4 border-m-red bg-surface-card p-6">
      <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
        Stale Data
      </span>
      <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">
        {staleness.warning}
      </p>
    </div>
  )
}

function OverviewSection({ overview, terms }: { overview: Overview; terms: string[] }) {
  return (
    <section id="overview" className="border-b border-hairline">
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <SectionLabel>1 · Tactical Overview</SectionLabel>
        <div className="mt-8 grid gap-10 md:grid-cols-3">
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-ink">
              Current Position
            </h3>
            <BulletList items={overview.currentPosition} terms={terms} />
          </div>
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-ink">
              Structural Architecture
            </h3>
            <BulletList items={overview.structuralArchitecture} terms={terms} />
          </div>
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-ink">
              Order Flow Context
            </h3>
            <BulletList items={overview.orderFlowContext} terms={terms} />
          </div>
        </div>

        <div className="mt-12">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-ink">
            Key Inflection Points
          </h3>
          {overview.keyInflections.length === 0 ? (
            <p className="text-sm font-light text-muted">—</p>
          ) : (
            <div className="grid gap-px bg-hairline sm:grid-cols-2">
              {overview.keyInflections.map((inflection) => (
                <div
                  key={`${inflection.level}-${inflection.why}`}
                  className="bg-surface-card p-4"
                >
                  <p className="text-2xl font-bold tracking-tight text-ink">
                    {formatPrice(inflection.level)}
                  </p>
                  <p className="mt-1 text-sm font-light leading-relaxed text-body">
                    <HighlightedText text={inflection.why} terms={terms} />
                  </p>
                </div>
              ))}
            </div>
          )}
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

function DangerZones({ zones, terms }: { zones: DangerZone[]; terms: string[] }) {
  return (
    <div className="mt-10">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-m-red">
        III · Danger Zones
      </h3>
      {zones.length === 0 ? (
        <p className="text-sm font-light text-muted">None flagged.</p>
      ) : (
        <ul className="space-y-3">
          {zones.map((zone) => (
            <li
              key={`${zone.area}-${zone.why}`}
              className="border-l-4 border-m-red bg-surface-card p-4"
            >
              <p className="text-sm font-bold text-ink">Avoid: {zone.area}</p>
              <p className="mt-1 text-sm font-light leading-relaxed text-body">
                <HighlightedText text={zone.why} terms={terms} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <div className="mx-auto max-w-[1440px] px-6 py-16">
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
      ? buildExecutionChart(data.execBars, payload.terrain, payload.meta.currentPrice)
      : null

  return (
    <>
      <TopNav />
      <MStripe className="mx-auto max-w-[1440px]" />

      <main className="flex flex-1 flex-col">
        {/* Header band: title, meta, freshness, both trigger buttons */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-[1440px] px-6 py-12">
            {data && (
              <div className="mb-8">
                <StaleBanner staleness={data.staleness} />
              </div>
            )}
            {loadError && (
              <div className="mb-8 border-l-4 border-m-red bg-surface-card p-6">
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
                  Data Unavailable
                </span>
                <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">
                  Could not reach the database: {loadError}
                </p>
              </div>
            )}

            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
                  Advisory Only · NQ Futures
                </span>
                <h1 className="mt-4 text-4xl font-bold uppercase leading-none tracking-[-0.5px] text-ink sm:text-6xl">
                  Morning
                  <br />
                  Briefing.
                </h1>
                {briefing ? (
                  <p className="mt-6 text-sm font-light tracking-wide text-body">
                    {fmtDate(briefing.createdAt)} · trigger: {briefing.triggerReason}
                    {briefing.modelId && ` · ${briefing.modelId}`}
                    {data?.staleness.isStale && (
                      <span className="ml-3 border border-m-red px-2 py-0.5 text-xs font-bold uppercase tracking-[1.5px] text-m-red">
                        Stale
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-6 text-sm font-light tracking-wide text-muted">
                    No briefing yet — run one to generate the first tactical read.
                  </p>
                )}

                <div className="mt-8 flex flex-wrap items-start gap-x-4 gap-y-3">
                  <RunBriefingButton />
                  <CheckEntryButton />
                </div>
              </div>

              {/* Meta spec cells */}
              {payload && (
                <div className="grid grid-cols-2 gap-px bg-hairline">
                  <div className="bg-surface-soft p-5">
                    <p className="text-3xl font-bold tracking-tight text-bmw-blue">
                      {formatPrice(payload.meta.currentPrice)}
                    </p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[1.5px] text-muted">
                      Current Price
                    </p>
                  </div>
                  <div className="bg-surface-soft p-5">
                    <p
                      className={`text-3xl font-bold uppercase tracking-tight ${ripStatusTone(
                        payload.meta.ripStatus,
                      )}`}
                    >
                      {payload.meta.ripStatus}
                    </p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[1.5px] text-muted">
                      Rip Status
                    </p>
                  </div>
                  <div className="col-span-2 bg-surface-soft p-5">
                    <p className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
                      HTF Trend
                    </p>
                    <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">
                      <HighlightedText text={payload.meta.htfTrend} terms={terms} />
                    </p>
                  </div>
                </div>
              )}
            </div>

            {data?.briefingError && (
              <p className="mt-6 text-sm font-light text-m-red">{data.briefingError}</p>
            )}
          </div>
        </section>

        {payload ? (
          <>
            <OverviewSection overview={payload.overview} terms={terms} />

            {/* Execution chart: candles + terrain-level overlay */}
            <section id="terrain" className="border-b border-hairline bg-surface-soft">
              <div className="mx-auto max-w-[1440px] px-6 py-16">
                <SectionLabel>Terrain · Campaign Map</SectionLabel>
                <h2 className="mt-4 text-3xl font-bold uppercase tracking-tight text-ink">
                  Stratosphere to Abyss.
                </h2>
                <div className="mt-8">
                  <ExecutionChartSection model={chartModel} terrain={payload.terrain} />
                </div>
              </div>
            </section>

            {/* Strategic alignment */}
            <section id="objectives" className="border-b border-hairline">
              <div className="mx-auto max-w-[1440px] px-6 py-16">
                <SectionLabel>2 · Strategic Alignment</SectionLabel>
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
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
                <DangerZones zones={payload.dangerZones} terms={terms} />
              </div>
            </section>
          </>
        ) : (
          !loadError && (
            <section className="border-b border-hairline">
              <div className="mx-auto max-w-[1440px] px-6 py-24">
                <div className="mx-auto max-w-xl border border-hairline bg-surface-card p-10 text-center">
                  <h2 className="text-2xl font-bold uppercase tracking-tight text-ink">
                    No Briefing Yet
                  </h2>
                  <p className="mt-4 text-sm font-light leading-relaxed text-body">
                    Once Sierra Chart bundles are flowing, press Run Briefing above to produce
                    the first tactical read. The overview, terrain map, and objectives render
                    here.
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
