import type { EvalCheck } from '@/knowledge/schema/briefing.schema'
import {
  formatPrice,
  parseEvalChecks,
  parseEvalWarnings,
  type DashboardEvalRow,
} from '@/lib/briefing'
import { HighlightedText } from './highlighted-text'
import { CheckEntryButton } from './trigger-run-button'

/**
 * Latest Entry Eval column — the most actionable read on the page. Renders
 * column content only (no section chrome); the page composes it into the
 * left body column beside the tabbed briefing. A cell row carries the verdict
 * chip, the evaluated entry level (direction-colored like the objective
 * cards) and the accent "Eval" trigger button that runs the check; the
 * structured condition checks (schema `checks`, when present)
 * render always visible below it as a table with per-condition notes, caution
 * and the reason summary. Pre-migration rows without checks degrade to the
 * reason prose. Stop / trigger / next-signal / targets are persisted but
 * deliberately not displayed (operator calls, 2026-07-16 and 2026-07-19).
 * Persisted runtime warnings render as a warning-toned Enforcement callout
 * above the checks — that is what explains a code-demoted WAIT whose checks
 * all pass (operator call, 2026-07-20).
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

/** Always-visible condition checks with per-condition notes. */
function ConditionsDetail({
  checks,
  caution,
  reason,
  warnings,
  terms,
}: {
  checks: EvalCheck[] | null
  caution: string | null
  reason: string | null
  warnings: string[] | null
  terms: string[]
}) {
  return (
    <div className="border border-t-0 border-hairline bg-surface-soft">
      <div className="px-5 py-4">
        {warnings && (
          <div className="mb-4 border-l-2 border-warning pl-3">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-warning">
              Enforcement
            </p>
            {warnings.map((warning) => (
              <p
                key={warning}
                className="mt-1 text-sm font-light leading-relaxed text-body"
              >
                {warning}
              </p>
            ))}
          </div>
        )}
        {!checks && (
          <p className="text-xs font-light tracking-wide text-body">
            No structured checks on this eval.
          </p>
        )}
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
          <p className="mt-4 text-sm leading-relaxed">
            <span className="font-bold uppercase tracking-wide text-m-red">Caution </span>
            <span className="font-light text-body">
              <HighlightedText text={caution} terms={terms} />
            </span>
          </p>
        )}
        {reason && (
          <p className="mt-4 text-sm font-light leading-relaxed text-body">
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
      <div
        id="eval"
        className="flex flex-wrap items-center justify-between gap-4 border border-hairline bg-surface-soft px-5 py-3"
      >
        <p className="text-sm font-light leading-relaxed text-muted">
          {unavailable
            ? 'Entry evals unavailable — the database could not be reached.'
            : 'No entry evals yet — press Eval to run the first check against the active entry levels.'}
        </p>
        {!unavailable && <CheckEntryButton size="sm" />}
      </div>
    )
  }

  const checks = parseEvalChecks(evalResult.checks)
  const statusStyle = EVAL_STATUS_STYLE[evalResult.status] ?? DEFAULT_STATUS_STYLE

  // The evaluated entry level, colored by direction like the objective cards:
  // long reads bmw-blue, short reads m-red.
  const evaluatedLevel = evalResult.evaluated_level
  const levelDirection = evaluatedLevel?.direction ?? evalResult.direction
  const levelTone =
    levelDirection === 'long'
      ? 'text-bmw-blue'
      : levelDirection === 'short'
        ? 'text-m-red'
        : 'text-ink'

  return (
    <div id="eval">
      <div
        className={`grid gap-px border border-hairline border-t-2 ${statusStyle.accent} bg-hairline md:grid-cols-[1fr_auto_auto]`}
      >
        <div className="flex items-center bg-surface-soft px-5 py-3">
          <p className="flex flex-wrap items-center gap-3">
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
        <div className="flex items-center bg-surface-soft px-5 py-3">
          {evaluatedLevel ? (
            <p className="flex items-center gap-3">
              {evaluatedLevel.label && (
                <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
                  {evaluatedLevel.label}
                </span>
              )}
              {evaluatedLevel.price !== null && (
                <span className={`text-lg font-bold tracking-tight ${levelTone}`}>
                  {formatPrice(evaluatedLevel.price)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm font-light text-muted">—</p>
          )}
        </div>
        <div className="flex items-center bg-surface-soft px-5 py-3">
          <CheckEntryButton size="sm" />
        </div>
      </div>

      <ConditionsDetail
        checks={checks}
        caution={evalResult.caution}
        reason={evalResult.reason}
        warnings={parseEvalWarnings(evalResult.warnings)}
        terms={terms}
      />
    </div>
  )
}
