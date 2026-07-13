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
 * - "Run Update" (feat-038) → POST /api/briefings/update → update-task
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
  /** 'sm' renders the compact nav variant with a floating status note. */
  size?: 'md' | 'sm'
}

export function TriggerRunButton({
  url,
  label,
  successHint,
  variant = 'primary',
  size = 'md',
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

  // Compact (nav) buttons float their status note below the header so the
  // 64px nav row never reflows.
  const statusClass =
    size === 'sm'
      ? 'absolute right-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-right'
      : ''

  return (
    <div className={size === 'sm' ? 'relative' : ''}>
      <Button
        variant={variant}
        size={size}
        onClick={run}
        disabled={state.phase === 'pending'}
      >
        {state.phase === 'pending' ? 'Queuing…' : label}
      </Button>
      <div role="status">
        {state.phase === 'success' && (
          <p className={`mt-2 text-xs font-light tracking-wide text-success ${statusClass}`}>
            Queued — run {state.runId}. {successHint}
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
      label="Run Briefing"
      successHint="Reload in a minute for the new briefing."
      size={size}
    />
  )
}

export function RunUpdateButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/briefings/update"
      label="Run Update"
      successHint="Reload in a minute for the updated read."
      variant="outline"
      size={size}
    />
  )
}

export function CheckEntryButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/eval/run"
      label="Check Entry at Current Price"
      successHint="Reload in a minute for the eval verdict."
      variant="outline"
      size={size}
    />
  )
}
