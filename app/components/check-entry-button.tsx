'use client'

import { useState } from 'react'
import { Button } from './button'

// "Check Entry at Current Price" (feat-025): POSTs /api/eval/run, which
// triggers one eval-task run (triage model vs the active entry levels).
// Pending/success/error states mirror the Run Briefing button; outline
// variant — the secondary action next to the bmw-blue primary CTA.

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

export function CheckEntryButton() {
  const [state, setState] = useState<RunState>({ phase: 'idle' })

  async function run() {
    setState({ phase: 'pending' })
    try {
      const res = await fetch('/api/eval/run', { method: 'POST' })
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
      <Button variant="outline" onClick={run} disabled={state.phase === 'pending'}>
        {state.phase === 'pending' ? 'Queuing…' : 'Check Entry at Current Price'}
      </Button>
      {state.phase === 'success' && (
        <p className="mt-2 text-xs font-light tracking-wide text-success">
          Queued — run {state.runId}. Reload in a minute for the eval verdict.
        </p>
      )}
      {state.phase === 'error' && (
        <p className="mt-2 text-xs font-light tracking-wide text-m-red">{state.message}</p>
      )}
    </div>
  )
}
