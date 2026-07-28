'use client'

import { Button } from './button'
import { statusLabel, useTriggeredRun } from './use-triggered-run'

/**
 * Shared trigger button for the dashboard's on-demand runs. The queue → watch
 * → refresh state machine lives in {@link useTriggeredRun}; this component is
 * the button presentation. Styling per DESIGN.md — bmw-blue primary CTA (or
 * bmw-blue accent outline), m-red reserved for the failure callout. The status
 * line is a polite live region so screen readers hear each phase change.
 *
 * The buttons live inside the sections they act on: "Briefing" and "Update"
 * in the Objectives pane, "Eval" / "Long" / "Short" in the entry-eval column
 * (EvalStrip).
 *
 * - "Briefing" (feat-020) → POST /api/briefings/run → analyze-task
 * - "Update" (feat-038) → POST /api/briefings/update → update-task
 * - "Eval" (feat-025) → POST /api/eval/run → eval-task (entry check)
 * - "Long" / "Short" → POST /api/eval/run {direction} → eval-task
 *   (hold-or-exit read on the open position at the current price)
 */

interface TriggerRunButtonProps {
  url: string
  label: string
  /** Trails "Run complete — dashboard refreshed." in the done note. */
  doneHint: string
  variant?: 'primary' | 'outline' | 'accent' | 'red-accent'
  /** 'sm' renders the compact variant with a floating status note. */
  size?: 'md' | 'sm'
  /** Optional JSON body for the POST (e.g. the position direction). */
  body?: Record<string, unknown>
}

export function TriggerRunButton({
  url,
  label,
  doneHint,
  variant = 'primary',
  size = 'md',
  body,
}: TriggerRunButtonProps) {
  const { state, runStatus, inFlight, completed, failedStatus, watchBroken, runAction } =
    useTriggeredRun(url)

  const buttonLabel =
    state.phase === 'queuing'
      ? 'Queuing…'
      : inFlight && state.phase === 'watching'
        ? `${statusLabel(runStatus)}…`
        : label

  // Compact buttons float their status note below the button so the host
  // section header row never reflows.
  const statusClass =
    size === 'sm'
      ? 'absolute right-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-right'
      : ''

  return (
    <div className={size === 'sm' ? 'relative' : ''}>
      <Button variant={variant} size={size} onClick={() => runAction(body)} disabled={inFlight}>
        {buttonLabel}
      </Button>
      <div role="status">
        {inFlight && state.phase === 'watching' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-muted ${statusClass}`}>
            {statusLabel(runStatus)} — run {state.runId}. The dashboard refreshes
            automatically when it finishes.
          </p>
        )}
        {watchBroken && (
          <p className={`mt-2 text-xs font-light tracking-wide text-warning ${statusClass}`}>
            Queued — run {state.phase === 'watching' ? state.runId : ''}, but live
            status is unavailable. Reload in a minute for the result.
          </p>
        )}
        {state.phase === 'queued-untracked' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-success ${statusClass}`}>
            Queued — run {state.runId}. Reload in a minute for the result.
          </p>
        )}
        {completed && state.phase === 'watching' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-success ${statusClass}`}>
            Run complete — dashboard refreshed. {doneHint}
          </p>
        )}
        {failedStatus && state.phase === 'watching' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-m-red ${statusClass}`}>
            Run {state.runId} finished as {failedStatus} — check the trigger.dev
            dashboard.
          </p>
        )}
        {state.phase === 'error' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-m-red ${statusClass}`}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  )
}

export function RunBriefingButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/briefings/run"
      label="Briefing"
      doneHint="The new briefing is below."
      size={size}
    />
  )
}

export function RunUpdateButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/briefings/update"
      label="Update"
      doneHint="The updated read is below."
      variant="accent"
      size={size}
    />
  )
}

export function CheckEntryButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/eval/run"
      label="Eval"
      doneHint="The eval verdict is beside it."
      variant="accent"
      size={size}
    />
  )
}

/**
 * Position check ("Long" / "Short"): the same eval-task, but the body carries
 * the open position's direction so the verdict is a hold-or-exit read at the
 * current price instead of an entry check against the active levels. Colored
 * by direction like the objective cards: long bmw-blue, short m-red.
 */
export function CheckPositionButton({
  direction,
  size,
}: {
  direction: 'long' | 'short'
  size?: 'md' | 'sm'
}) {
  return (
    <TriggerRunButton
      url="/api/eval/run"
      body={{ direction }}
      label={direction === 'long' ? 'Long' : 'Short'}
      doneHint="The position verdict is beside it."
      variant={direction === 'long' ? 'accent' : 'red-accent'}
      size={size}
    />
  )
}
