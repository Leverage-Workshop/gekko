'use client'

import { useState } from 'react'
import { Button } from './button'

// "Run Briefing" (feat-020): POSTs /api/briefings/run, which triggers one
// analyze-task run. Pending/success/error states per DESIGN.md — bmw-blue
// primary CTA, m-red reserved for the failure callout.

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

export function RunBriefingButton() {
  const [state, setState] = useState<RunState>({ phase: 'idle' })

  async function run() {
    setState({ phase: 'pending' })
    try {
      const res = await fetch('/api/briefings/run', { method: 'POST' })
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
      <Button onClick={run} disabled={state.phase === 'pending'}>
        {state.phase === 'pending' ? 'Queuing…' : 'Run Briefing'}
      </Button>
      {state.phase === 'success' && (
        <p className="mt-2 text-xs font-light tracking-wide text-success">
          Queued — run {state.runId}. Reload in a minute for the new briefing.
        </p>
      )}
      {state.phase === 'error' && (
        <p className="mt-2 text-xs font-light tracking-wide text-m-red">{state.message}</p>
      )}
    </div>
  )
}
