'use client'

import { useEffect, useState } from 'react'
import { statusLabel, useTriggeredRun } from './use-triggered-run'

/**
 * Directive textbox in an objective card's header (feat-061). The operator
 * types where they think the objective should anchor — a symbolic level
 * ("ONL"), a price ("move the entry to 27950"), or short prose — and Enter
 * POSTs /api/briefings/update with `{ directive: { objective, text } }`. The
 * update-task regenerates THAT objective honoring the directive (the other
 * objective is hard-frozen server-side) and the dashboard refreshes itself
 * when the run completes, via the shared {@link useTriggeredRun} watch.
 *
 * Styling: DESIGN.md text-input token at the header `sm` scale (h-9 like the
 * compact buttons — the 48px settings input would blow out the card header
 * row). The status note floats below like the compact buttons' so the header
 * never reflows.
 */
export function ObjectiveDirectiveInput({ slot }: { slot: 'primary' | 'secondary' }) {
  const [text, setText] = useState('')
  const { state, runStatus, inFlight, completed, failedStatus, watchBroken, runAction } =
    useTriggeredRun('/api/briefings/update')

  // Clear the box once the directive-driven briefing has landed — the card
  // now shows the applied directive as an annotation instead. Deferred a tick:
  // the hooks lint forbids synchronous setState inside an effect.
  useEffect(() => {
    if (completed) {
      const clear = setTimeout(() => setText(''), 0)
      return () => clearTimeout(clear)
    }
  }, [completed])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || inFlight) return
    void runAction({ directive: { objective: slot, text: trimmed } })
  }

  return (
    <div className="relative">
      <form onSubmit={submit}>
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={inFlight}
          maxLength={280}
          placeholder="Redirect…"
          aria-label={`Directive for the ${slot} objective`}
          className="h-9 w-44 rounded-none border border-hairline bg-surface-card px-3 text-xs font-light text-ink outline-none transition-colors placeholder:text-muted focus:border-ink disabled:opacity-50"
        />
      </form>
      <div role="status">
        {inFlight && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-muted">
            {state.phase === 'queuing'
              ? 'Queuing…'
              : `${statusLabel(runStatus)} — revising the ${slot} objective. The dashboard refreshes automatically.`}
          </p>
        )}
        {watchBroken && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-warning">
            Queued, but live status is unavailable. Reload in a minute for the result.
          </p>
        )}
        {state.phase === 'queued-untracked' && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-success">
            Queued — reload in a minute for the result.
          </p>
        )}
        {completed && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-success">
            Directive applied — the revised objective is below.
          </p>
        )}
        {failedStatus && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-m-red">
            Run finished as {failedStatus} — the directive may conflict with the
            other objective&apos;s anchor. Check the trigger.dev dashboard.
          </p>
        )}
        {state.phase === 'error' && (
          <p className="absolute left-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-xs font-light tracking-wide text-m-red">
            {state.message}
          </p>
        )}
      </div>
    </div>
  )
}
