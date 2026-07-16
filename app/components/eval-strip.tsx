import type { EvalCheck } from '@/knowledge/schema/briefing.schema'
import { formatPrice, parseEvalChecks, type DashboardEvalRow } from '@/lib/briefing'
import { HighlightedText } from './highlighted-text'

/**
 * Latest Entry Eval strip — the most actionable read on the page, so it sits
 * directly beneath the meta strip instead of below the fold. One cell row
 * carries the verdict chip, stop, targets, trigger and next-signal; the
 * structured condition checks (schema `checks`, when present) render as an
 * always-visible chip rail that expands (native <details>) into per-condition
 * notes, caution and the reason summary. Pre-migration rows without checks
 * degrade to the reason prose inside the same expander.
 */

const EVAL_STATUS_CLASS: Record<string, string> = {
  ENTER: 'text-success border-success',
  WAIT: 'text-warning border-warning',
  NOT_VALID: 'text-m-red border-m-red',
  NO_ENTRY_NEAR: 'text-muted border-muted',
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

function VerdictMark({ verdict }: { verdict: EvalCheck['verdict'] }) {
  const mark = VERDICT_MARK[verdict]
  return (
    <span className={`font-bold ${mark.tone}`} aria-label={verdict}>
      {mark.glyph}
    </span>
  )
}

/** Chip rail + expandable notes for the structured condition checks. */
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
    <details className="border border-t-0 border-hairline bg-surface-soft">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
          Conditions
        </span>
        {checks ? (
          checks.map((check) => (
            <span
              key={check.name}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[1.5px] text-body-strong"
            >
              <VerdictMark verdict={check.verdict} />
              {check.name}
            </span>
          ))
        ) : (
          <span className="text-xs font-light tracking-wide text-body">
            No structured checks on this eval — expand for the reasoning.
          </span>
        )}
        <span className="ml-auto text-xs font-light uppercase tracking-wide text-muted">
          Detail ▾
        </span>
      </summary>
      <div className="border-t border-hairline px-5 py-4">
        {checks && (
          <ul className="space-y-2">
            {checks.map((check) => (
              <li key={check.name} className="flex gap-3 text-sm leading-relaxed">
                <VerdictMark verdict={check.verdict} />
                <span className="w-28 shrink-0 font-bold uppercase tracking-wide text-ink">
                  {check.name}
                </span>
                <span className="font-light text-body">
                  <HighlightedText text={check.note} terms={terms} />
                </span>
              </li>
            ))}
          </ul>
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
    </details>
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
      <section id="eval" className="border-b border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1800px] px-6 pb-4">
          <div className="border border-hairline bg-surface-soft px-5 py-3">
            <CellLabel>Latest Entry Eval</CellLabel>
            <p className="mt-1 text-sm font-light leading-relaxed text-muted">
              {unavailable
                ? 'Entry evals unavailable — the database could not be reached.'
                : 'No entry evals yet — press Check Entry at Current Price above to run the first check against the active entry levels.'}
            </p>
          </div>
        </div>
      </section>
    )
  }

  const checks = parseEvalChecks(evalResult.checks)

  return (
    <section id="eval" className="border-b border-hairline bg-surface-soft">
      <div className="mx-auto max-w-[1800px] px-6 pb-4">
        <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-[auto_auto_auto_1fr_1fr]">
          <div className="bg-surface-soft px-5 py-3">
            <CellLabel>Latest Entry Eval</CellLabel>
            <p className="mt-1 flex flex-wrap items-center gap-3">
              <span
                className={`border px-2.5 py-0.5 text-sm font-bold uppercase tracking-[1.5px] ${
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
            </p>
          </div>
          <div className="bg-surface-soft px-5 py-3">
            <CellLabel>Stop</CellLabel>
            <p className="mt-1 text-lg font-bold tracking-tight text-ink">
              {evalResult.stop !== null ? formatPrice(evalResult.stop) : '—'}
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
          <div className="bg-surface-soft px-5 py-3">
            <CellLabel>Trigger</CellLabel>
            <p className="mt-1 text-sm font-light leading-relaxed text-body-strong">
              {evalResult.trigger ? (
                <HighlightedText text={evalResult.trigger} terms={terms} />
              ) : (
                '—'
              )}
            </p>
          </div>
          <div className="bg-surface-soft px-5 py-3">
            <CellLabel>Next Signal</CellLabel>
            <p className="mt-1 text-sm font-light leading-relaxed text-body-strong">
              {evalResult.next_signal ? (
                <HighlightedText text={evalResult.next_signal} terms={terms} />
              ) : (
                '—'
              )}
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
    </section>
  )
}
