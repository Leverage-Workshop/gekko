'use client'

import { useState } from 'react'
import { Button } from './button'

/**
 * Shared trigger button for the dashboard's on-demand runs. POSTs an API
 * route that queues exactly one trigger.dev run and reports queue/success/
 * error states per DESIGN.md — bmw-blue primary CTA (or outline secondary),
 * m-red reserved for the failure callout. The status line is a polite live
 * region so screen readers hear the queued/failed outcome.
 *
 * - "Run Briefing" (feat-020) → POST /api/briefings/run → analyze-task
 * - "Check Entry at Current Price" (feat-025) → POST /api/eval/run → eval-task
 */

type RunState =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'success'; runId: string }
  | { phase: 'error'; message: string }

interface RunResponse {
  success?: boolean
  data?: { runId?: string }
  error?: string
}

interface TriggerRunButtonProps {
  url: string
  label: string
  /** Trails "Queued — run <id>." in the success note. */
  successHint: string
  variant?: 'primary' | 'outline'
}

export function TriggerRunButton({
  url,
  label,
  successHint,
  variant = 'primary',
}: TriggerRunButtonProps) {
  const [state, setState] = useState<RunState>({ phase: 'idle' })

  async function run() {
    setState({ phase: 'pending' })
    try {
      const res = await fetch(url, { method: 'POST' })
      const body = (await res.json().catch(() => null)) as RunResponse | null
      if (!res.ok || !body?.success || !body.data?.runId) {
        setState({
          phase: 'error',
          message: body?.error ?? `Request failed (HTTP ${res.status})`,
        })
        return
      }
      setState({ phase: 'success', runId: body.data.runId })
    } catch {
      setState({ phase: 'error', message: 'Network error — is the app server running?' })
    }
  }

  return (
    <div>
      <Button variant={variant} onClick={run} disabled={state.phase === 'pending'}>
        {state.phase === 'pending' ? 'Queuing…' : label}
      </Button>
      <div role="status">
        {state.phase === 'success' && (
          <p className="mt-2 text-xs font-light tracking-wide text-success">
            Queued — run {state.runId}. {successHint}
          </p>
        )}
        {state.phase === 'error' && (
          <p className="mt-2 text-xs font-light tracking-wide text-m-red">{state.message}</p>
        )}
      </div>
    </div>
  )
}

export function RunBriefingButton() {
  return (
    <TriggerRunButton
      url="/api/briefings/run"
      label="Run Briefing"
      successHint="Reload in a minute for the new briefing."
    />
  )
}

export function CheckEntryButton() {
  return (
    <TriggerRunButton
      url="/api/eval/run"
      label="Check Entry at Current Price"
      successHint="Reload in a minute for the eval verdict."
      variant="outline"
    />
  )
}
