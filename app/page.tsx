import type {
  DangerZone,
  Objective,
  Overview,
  TacticalRead,
} from '@/knowledge/schema/briefing.schema'
import {
  buildHighlightTerms,
  formatPrice,
  loadDashboardData,
  realDashboardDeps,
  type DashboardData,
} from '@/lib/briefing'
import type { Briefing } from '@/knowledge/schema/briefing.schema'
import { BriefingTabs } from './components/briefing-tabs'
import { EvalStrip } from './components/eval-strip'
import { Footer } from './components/footer'
import { HighlightedText } from './components/highlighted-text'
import { MStripe } from './components/m-stripe'
import { RunBriefingButton, RunUpdateButton } from './components/trigger-run-button'
import { TopNav } from './components/top-nav'
import { UpdateGlow } from './components/update-glow'

/**
 * Gekko dashboard (feat-019) — a server component that fetches the latest
 * briefing, eval result, and bundle freshness via the service-role client,
 * then renders the briefing as a dense tool view: a full-width meta strip
 * (price/rip/HTF-trend/run-meta cells in one row, with the Tactical Read in
 * an expander) above two equal body columns (left = EvalStrip: verdict +
 * targets with the condition checks always visible; right = the tabbed
 * briefing: objective cards, tactical overview, danger zones). The trigger
 * buttons live in the sections they act on: "Briefing" (feat-020) and
 * "Update" (feat-038) at the top of the Objectives pane, "Eval" (feat-025)
 * inside the EvalStrip. Update briefings additionally
 * carry an UPDATE chip and an Immediate Tactical Read strip.
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

/**
 * Meta strip (full-width row above the body columns): price, rip status,
 * HTF trend and run meta as a single cell row, with the Immediate Tactical
 * Read (feat-038; update briefings only) stacked inside an attached
 * <details> expander.
 */
function MetaColumn({
  briefing,
  payload,
  isStale,
  staleWarning,
  terms,
  tacticalRead,
}: {
  briefing: {
    createdAt: string
    triggerReason: string
    modelId: string | null
    kind: 'morning' | 'update'
  }
  payload: Briefing
  isStale: boolean
  staleWarning: string | null
  terms: string[]
  tacticalRead: TacticalRead | null
}) {
  const readRows: { title: string; text: string }[] = tacticalRead
    ? [
        { title: 'Location', text: tacticalRead.location },
        { title: 'Rip Status', text: tacticalRead.ripStatus },
        { title: 'Initiative', text: tacticalRead.initiative },
      ]
    : []

  return (
    <div>
      <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-[auto_auto_1fr_auto]">
        <div className="bg-surface-soft px-5 py-3">
          <p className="text-2xl font-bold tracking-tight text-bmw-blue">
            {formatPrice(payload.meta.currentPrice)}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[1.5px] text-muted">
            Current Price
          </p>
        </div>
        <div className="bg-surface-soft px-5 py-3">
          <p
            className={`text-2xl font-bold uppercase tracking-tight ${ripStatusTone(
              payload.meta.ripStatus
            )}`}
          >
            {payload.meta.ripStatus}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[1.5px] text-muted">Rip Status</p>
        </div>
        <div className="bg-surface-soft px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-[1.5px] text-muted">HTF Trend</p>
          <p className="mt-1 text-sm font-light leading-relaxed text-body-strong">
            <HighlightedText text={payload.meta.htfTrend} terms={terms} />
          </p>
        </div>
        <div className="bg-surface-soft px-5 py-3 md:text-right">
          <p className="text-xs font-light tracking-wide text-body">
            {fmtDate(briefing.createdAt)}
            {briefing.kind === 'update' && (
              <span
                className="ml-3 border border-bmw-blue px-2 py-0.5 text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue"
                title="Update briefing — objectives and danger zones regenerated; overview and terrain inherited from the previous briefing"
              >
                Update
              </span>
            )}
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

      {tacticalRead && (
        <details className="border border-t-0 border-hairline bg-surface-soft">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Tactical Read
            </span>
            <span className="ml-auto text-xs font-light uppercase tracking-wide text-muted">
              Detail ▾
            </span>
          </summary>
          <div className="border-t border-hairline px-5 py-4">
            <ul className="space-y-3">
              {readRows.map((row) => (
                <li key={row.title} className="flex gap-3 text-sm leading-relaxed">
                  <span className="w-28 shrink-0 font-bold uppercase tracking-wide text-ink">
                    {row.title}
                  </span>
                  <span className="font-light text-body">
                    <HighlightedText text={row.text} terms={terms} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
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
  const rows: { point: string; price: number; description: string; isStop: boolean }[] = [
    ...objective.entries.map((entry) => ({
      point: entry.label,
      price: entry.price,
      description: entry.trigger,
      isStop: false,
    })),
    ...objective.stops.map((stop) => ({
      point: stop.label,
      price: stop.price,
      description: stop.invalidation,
      isStop: true,
    })),
    ...objective.targets.map((target) => ({
      point: `Target ${target.label.slice(1)} (${target.label})`,
      price: target.price,
      description: target.description,
      isStop: false,
    })),
  ]
  const sequence = objective.targets.map((t) => t.label).join(' → ')

  // Direction identity: bullish campaigns read bmw-blue, bearish read m-red.
  // Structural invalidation (stop) prices flip to the opposite accent so the
  // level that kills the campaign reads against the direction color.
  const isLong = objective.direction === 'long'
  const accentText = isLong ? 'text-bmw-blue' : 'text-m-red'
  const counterAccentText = isLong ? 'text-m-red' : 'text-bmw-blue'
  const accentTop = isLong ? 'border-t-bmw-blue' : 'border-t-m-red'
  const accentBadge = isLong ? 'border-bmw-blue text-bmw-blue' : 'border-m-red text-m-red'

  return (
    <article className={`border border-hairline border-t-2 ${accentTop} bg-surface-card p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink">{heading}</span>
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
                className={`py-2 pr-3 text-sm font-bold tracking-tight ${
                  row.isStop ? counterAccentText : accentText
                }`}
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
          <p className="text-sm font-bold uppercase tracking-wide text-m-red">Avoid: {zone.area}</p>
          <p className="mt-2 text-sm font-light leading-relaxed text-body">
            <HighlightedText text={zone.why} terms={terms} />
          </p>
        </li>
      ))}
    </ul>
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

  return (
    <>
      <TopNav />
      {/* Full-width tricolor divider between the header and the meta row,
          mirroring the footer's stripe. */}
      <MStripe />

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
            <section className="border-b border-hairline bg-surface-soft">
              <div className="mx-auto max-w-[1800px] px-6 py-4">
                <UpdateGlow updateKey={briefing.id}>
                  <MetaColumn
                    briefing={briefing}
                    payload={payload}
                    isStale={data?.staleness.isStale ?? false}
                    staleWarning={data?.staleness.warning ?? null}
                    terms={terms}
                    tacticalRead={briefing.tacticalRead}
                  />
                </UpdateGlow>
              </div>
            </section>

            <section className="border-b border-hairline">
              <div className="mx-auto max-w-[1800px] px-6 py-8">
                <div className="grid items-start gap-6 xl:grid-cols-2">
                  {/* Eval column: verdict, targets and always-visible conditions */}
                  <UpdateGlow updateKey={data?.evalResult?.id ?? 'no-eval'}>
                    <EvalStrip
                      evalResult={data?.evalResult ?? null}
                      unavailable={false}
                      terms={terms}
                    />
                  </UpdateGlow>

                  {/* Tabbed column */}
                  <UpdateGlow updateKey={briefing.id}>
                    <BriefingTabs
                      objectives={
                        <div className="flex flex-col gap-6">
                          <div className="flex items-center justify-end gap-3">
                            <RunUpdateButton size="sm" />
                            <RunBriefingButton size="sm" />
                          </div>
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
                  </UpdateGlow>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {!loadError && (
              <section className="border-b border-hairline">
                <div className="mx-auto max-w-[1800px] px-6 py-24">
                  <div className="mx-auto max-w-xl border border-hairline bg-surface-card p-10 text-center">
                    <h2 className="text-2xl font-bold uppercase tracking-tight text-ink">
                      No Briefing Yet
                    </h2>
                    <p className="mt-4 text-sm font-light leading-relaxed text-body">
                      Once Sierra Chart bundles are flowing, press Briefing to produce the first
                      tactical read. The objectives, execution chart, and tactical overview render
                      here.
                    </p>
                    <div className="mt-6 flex justify-center">
                      <RunBriefingButton size="sm" />
                    </div>
                  </div>
                </div>
              </section>
            )}
            <section className="border-b border-hairline bg-surface-soft">
              <div className="mx-auto max-w-[1800px] px-6 py-4">
                <EvalStrip
                  evalResult={data?.evalResult ?? null}
                  unavailable={loadError !== null}
                  terms={terms}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </>
  )
}
