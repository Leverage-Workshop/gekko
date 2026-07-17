'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from './button'

/**
 * Shared trigger button for the dashboard's on-demand runs. POSTs an API
 * route that queues exactly one trigger.dev run, then subscribes to that run
 * via Realtime (`useRealtimeRun` with the run-scoped public access token the
 * route returns) and calls `router.refresh()` the moment the run completes —
 * no manual reload needed. Styling per DESIGN.md — bmw-blue primary CTA (or
 * outline secondary), m-red reserved for the failure callout. The status line
 * is a polite live region so screen readers hear each phase change.
 *
 * - "Run Briefing" (feat-020) → POST /api/briefings/run → analyze-task
 * - "Run Update" (feat-038) → POST /api/briefings/update → update-task
 * - "Check Entry at Current Price" (feat-025) → POST /api/eval/run → eval-task
 */

type RunState =
  | { phase: 'idle' }
  | { phase: 'queuing' }
  | { phase: 'watching'; runId: string; publicAccessToken: string }
  /** Queued but the route returned no token — the pre-Realtime fallback. */
  | { phase: 'queued-untracked'; runId: string }
  | { phase: 'error'; message: string }

interface RunResponse {
  success?: boolean
  data?: { runId?: string; publicAccessToken?: string }
  error?: string
}

interface TriggerRunButtonProps {
  url: string
  label: string
  /** Trails "Run complete — dashboard refreshed." in the done note. */
  doneHint: string
  variant?: 'primary' | 'outline'
  /** 'sm' renders the compact nav variant with a floating status note. */
  size?: 'md' | 'sm'
}

/**
 * v4 run statuses that mean the run is over, success or otherwise. Kept as a
 * plain set (not the SDK's RunStatus type) so an unknown future status simply
 * reads as still-in-flight rather than breaking the build.
 */
const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT',
])

/** Human label for the v4 Realtime statuses (REATTEMPTING no longer exists). */
function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'EXECUTING':
      return 'Running'
    case 'DEQUEUED':
      return 'Starting'
    case 'WAITING':
      return 'Waiting'
    case 'DELAYED':
      return 'Delayed'
    default:
      return 'Queued'
  }
}

export function TriggerRunButton({
  url,
  label,
  doneHint,
  variant = 'primary',
  size = 'md',
}: TriggerRunButtonProps) {
  const [state, setState] = useState<RunState>({ phase: 'idle' })
  const router = useRouter()

  const watching = state.phase === 'watching' ? state : null
  const { run, error: realtimeError } = useRealtimeRun(watching?.runId, {
    accessToken: watching?.publicAccessToken,
    enabled: watching !== null,
    // Status-only subscription: the dashboard re-fetches its own data on
    // refresh, so never ship the run payload/output over the wire.
    skipColumns: ['payload', 'output'],
  })

  // Completion is derived from the run STATUS, not the hook's `onComplete`:
  // onComplete additionally gates on `finishedAt`, and the Realtime stream
  // can deliver the terminal status in a frame without it (observed live on
  // eval runs: Running → "Queued" → stuck until a manual reload). A terminal
  // status alone finishes the watch — the done/failed presentation is derived
  // at render, and only the dashboard refresh is an actual side effect.
  const runStatus = run?.status
  const terminalStatus =
    watching !== null && runStatus && TERMINAL_STATUSES.has(runStatus)
      ? runStatus
      : null
  const completed = terminalStatus === 'COMPLETED'
  const failedStatus = terminalStatus && !completed ? terminalStatus : null

  useEffect(() => {
    if (completed) {
      // Re-render the server component tree so the fresh briefing/eval
      // rows appear without a manual reload.
      router.refresh()
    }
  }, [completed, router])

  async function runAction() {
    setState({ phase: 'queuing' })
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
      if (!body.data.publicAccessToken) {
        setState({ phase: 'queued-untracked', runId: body.data.runId })
        return
      }
      setState({
        phase: 'watching',
        runId: body.data.runId,
        publicAccessToken: body.data.publicAccessToken,
      })
    } catch {
      setState({ phase: 'error', message: 'Network error — is the app server running?' })
    }
  }

  // If the Realtime subscription itself fails, the run is still going — drop
  // the auto-refresh promise but don't block a re-run behind a dead socket.
  const watchBroken = watching !== null && realtimeError !== undefined
  const inFlight =
    state.phase === 'queuing' ||
    (state.phase === 'watching' && !watchBroken && terminalStatus === null)

  const buttonLabel =
    state.phase === 'queuing'
      ? 'Queuing…'
      : inFlight && state.phase === 'watching'
        ? `${statusLabel(runStatus)}…`
        : label

  // Compact (nav) buttons float their status note below the header so the
  // 64px nav row never reflows.
  const statusClass =
    size === 'sm'
      ? 'absolute right-0 top-full z-30 mt-2 w-72 border border-hairline bg-surface-card px-3 py-2 text-right'
      : ''

  return (
    <div className={size === 'sm' ? 'relative' : ''}>
      <Button variant={variant} size={size} onClick={runAction} disabled={inFlight}>
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
      label="Run Briefing"
      doneHint="The new briefing is below."
      size={size}
    />
  )
}

export function RunUpdateButton({ size }: { size?: 'md' | 'sm' }) {
  return (
    <TriggerRunButton
      url="/api/briefings/update"
      label="Run Update"
      doneHint="The updated read is below."
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
      doneHint="The eval verdict is below."
      variant="outline"
      size={size}
    />
  )
}
