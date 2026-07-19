import type { EvalCheck } from '@/knowledge/schema/briefing.schema'
import { formatPrice, parseEvalChecks, type DashboardEvalRow } from '@/lib/briefing'
import { HighlightedText } from './highlighted-text'

/**
 * Latest Entry Eval column — the most actionable read on the page. Renders
 * column content only (no section chrome); the page composes it into the
 * left body column beside the tabbed briefing. A cell row carries the verdict
 * chip and targets; the structured condition checks (schema `checks`, when
 * present) render always visible below it with per-condition notes, caution
 * and the reason summary. Pre-migration rows without checks degrade to the
 * reason prose. Stop / trigger / next-signal are persisted but deliberately
 * not displayed (operator call, 2026-07-16).
 */

/**
 * Verdict presentation: a solid-fill chip (black label on the status color,
 * mirroring the solid primary button) plus a status-colored top accent border
 * across the whole card — the same border-t-2 accent language the objective
 * cards use for direction, so the verdict reads at a glance.
 */
const EVAL_STATUS_STYLE: Record<string, { chip: string; accent: string }> = {
  ENTER: { chip: 'bg-success text-canvas', accent: 'border-t-success' },
  WAIT: { chip: 'bg-warning text-canvas', accent: 'border-t-warning' },
  NOT_VALID: { chip: 'bg-m-red text-canvas', accent: 'border-t-m-red' },
  NO_ENTRY_NEAR: { chip: 'bg-muted text-canvas', accent: 'border-t-muted' },
}

const DEFAULT_STATUS_STYLE = {
  chip: 'bg-surface-elevated text-body',
  accent: 'border-t-hairline',
}

const VERDICT_MARK: Record<EvalCheck['verdict'], { glyph: string; tone: string }> = {
  pass: { glyph: '✓', tone: 'text-success' },
  fail: { glyph: '✗', tone: 'text-m-red' },
  pending: { glyph: '─', tone: 'text-warning' },
}

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

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[1.5px] text-muted">{children}</p>
  )
}

/** Always-visible condition checks with per-condition notes. */
function ConditionsDetail({
  checks,
  caution,
  reason,
  terms,
}: {
  checks: EvalCheck[] | null
  caution: string | null
  reason: string | null
  terms: string[]
}) {
  return (
    <div className="border border-t-0 border-hairline bg-surface-soft">
      <div className="border-b border-hairline px-5 py-3">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
          Conditions
        </span>
        {!checks && (
          <span className="ml-6 text-xs font-light tracking-wide text-body">
            No structured checks on this eval.
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {checks && (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
                  Condition
                </th>
                <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
                  Status
                </th>
                <th className="py-2 text-xs font-bold uppercase tracking-[1.5px] text-muted">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const mark = VERDICT_MARK[check.verdict]
                return (
                  <tr key={check.name} className="border-b border-hairline-strong">
                    <td className="py-2 pr-3 text-sm font-bold text-ink">{check.name}</td>
                    <td
                      className={`whitespace-nowrap py-2 pr-3 text-sm font-bold uppercase tracking-wide ${mark.tone}`}
                    >
                      {mark.glyph} {check.verdict}
                    </td>
                    <td className="py-2 text-sm font-light leading-relaxed text-body">
                      <HighlightedText text={check.note} terms={terms} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {caution && (
          <p className={`${checks ? 'mt-4' : ''} text-sm leading-relaxed`}>
            <span className="font-bold uppercase tracking-wide text-m-red">Caution </span>
            <span className="font-light text-body">
              <HighlightedText text={caution} terms={terms} />
            </span>
          </p>
        )}
        {reason && (
          <p
            className={`${checks || caution ? 'mt-4' : ''} text-sm font-light leading-relaxed text-body`}
          >
            <HighlightedText text={reason} terms={terms} />
          </p>
        )}
      </div>
    </div>
  )
}

export function EvalStrip({
  evalResult,
  unavailable,
  terms,
}: {
  evalResult: DashboardEvalRow | null
  /** Dashboard load failed — don't render the run-your-first-eval CTA. */
  unavailable: boolean
  terms: string[]
}) {
  if (evalResult === null) {
    return (
      <div id="eval" className="border border-hairline bg-surface-soft px-5 py-3">
        <CellLabel>Latest Entry Eval</CellLabel>
        <p className="mt-1 text-sm font-light leading-relaxed text-muted">
          {unavailable
            ? 'Entry evals unavailable — the database could not be reached.'
            : 'No entry evals yet — press Check Entry at Current Price above to run the first check against the active entry levels.'}
        </p>
      </div>
    )
  }

  const checks = parseEvalChecks(evalResult.checks)
  const statusStyle = EVAL_STATUS_STYLE[evalResult.status] ?? DEFAULT_STATUS_STYLE

  return (
    <div id="eval">
      <div
        className={`grid gap-px border border-hairline border-t-2 ${statusStyle.accent} bg-hairline md:grid-cols-[1fr_auto]`}
      >
        <div className="bg-surface-soft px-5 py-3">
          <CellLabel>Latest Entry Eval</CellLabel>
          <p className="mt-1 flex flex-wrap items-center gap-3">
            <span
              className={`px-3 py-1 text-sm font-bold uppercase tracking-[1.5px] ${statusStyle.chip}`}
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
          </p>
        </div>
        <div className="bg-surface-soft px-5 py-3">
          <CellLabel>Targets</CellLabel>
          <p className="mt-1 text-lg font-bold tracking-tight text-ink">
            {evalResult.targets && evalResult.targets.length > 0
              ? evalResult.targets.map(formatPrice).join(' → ')
              : '—'}
          </p>
        </div>
      </div>

      <ConditionsDetail
        checks={checks}
        caution={evalResult.caution}
        reason={evalResult.reason}
        terms={terms}
      />
    </div>
  )
}
