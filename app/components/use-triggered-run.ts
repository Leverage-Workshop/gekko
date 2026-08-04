'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Shared state machine for the dashboard's on-demand runs (extracted from
 * TriggerRunButton for feat-061 so the objective-card directive input can
 * reuse it). `runAction` POSTs an API route that queues exactly one
 * trigger.dev run, then the hook subscribes to that run via Realtime
 * (`useRealtimeRun` with the run-scoped public access token the route
 * returns) and calls `router.refresh()` the moment the run completes — no
 * manual reload needed. Consumers render their own controls and status notes
 * from the returned flags.
 */

export type RunState =
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
export function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'EXECUTING':
      return 'Running'
    case 'DEQUEUED':
      return 'Starting'
    case 'WAITING':
      return 'Waiting'
    case 'DELAYED':
      return 'Delayed'
    case undefined:
    default:
      return 'Queued'
  }
}

export interface TriggeredRun {
  state: RunState
  /** Raw Realtime status while watching, for `statusLabel`. */
  runStatus: string | undefined
  inFlight: boolean
  completed: boolean
  /** Terminal status other than COMPLETED, else null. */
  failedStatus: string | null
  /** Realtime subscription died while the run is still going. */
  watchBroken: boolean
  runAction: (body?: Record<string, unknown>) => Promise<void>
}

export function useTriggeredRun(url: string): TriggeredRun {
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
      // rows appear without a manual reload, then dismiss the success note —
      // resetting to idle also clears the floating nav flyout.
      router.refresh()
      const dismiss = setTimeout(() => setState({ phase: 'idle' }), 5000)
      return () => clearTimeout(dismiss)
    }
  }, [completed, router])

  async function runAction(body?: Record<string, unknown>) {
    setState({ phase: 'queuing' })
    try {
      const res = await fetch(
        url,
        body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : { method: 'POST' },
      )
      const answer = (await res.json().catch(() => null)) as RunResponse | null
      if (!res.ok || !answer?.success || !answer.data?.runId) {
        setState({
          phase: 'error',
          message: answer?.error ?? `Request failed (HTTP ${res.status})`,
        })
        return
      }
      if (!answer.data.publicAccessToken) {
        setState({ phase: 'queued-untracked', runId: answer.data.runId })
        return
      }
      setState({
        phase: 'watching',
        runId: answer.data.runId,
        publicAccessToken: answer.data.publicAccessToken,
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

  return { state, runStatus, inFlight, completed, failedStatus, watchBroken, runAction }
}
