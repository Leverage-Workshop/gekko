'use client'

import { useState, type FormEvent } from 'react'
import { Button } from './button'

// Settings form (feat-028): edits the config singleton via POST /api/config.
// DESIGN.md text-input styling (surface-card, rounded-none, hairline border,
// 48px tall), uppercase letterspaced labels, bmw-blue primary save button,
// m-red reserved for error states, success color for the saved confirmation.

export interface SettingsInitialValues {
  model_id: string
  triage_model_id: string
  rr_min: number
  high_conviction_enabled: boolean
  high_conviction_model_id: string
}

interface SettingsFormProps {
  initial: SettingsInitialValues
  updatedAt: string | null
  /** Live DB predates the high_conviction_flag migration (feat-031). */
  highConvictionColumnsMissing: boolean
}

type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'error'; message: string }

interface ConfigResponse {
  success?: boolean
  data?: { config?: { updated_at?: string } }
  error?: string
  fieldErrors?: Record<string, string[]>
}

const inputClass =
  'mt-2 h-12 w-full rounded-none border border-hairline bg-surface-card px-4 text-base font-light text-ink outline-none transition-colors focus:border-ink'

function fmtUpdatedAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-bold uppercase tracking-[1.5px] text-body"
    >
      {children}
    </label>
  )
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null
  return <p className="mt-1 text-xs font-light tracking-wide text-m-red">{messages[0]}</p>
}

export function SettingsForm({ initial, updatedAt, highConvictionColumnsMissing }: SettingsFormProps) {
  const [modelId, setModelId] = useState(initial.model_id)
  const [triageModelId, setTriageModelId] = useState(initial.triage_model_id)
  const [rrMin, setRrMin] = useState(String(initial.rr_min))
  const [hcEnabled, setHcEnabled] = useState(initial.high_conviction_enabled)
  const [hcModelId, setHcModelId] = useState(initial.high_conviction_model_id)
  const [state, setState] = useState<SaveState>({ phase: 'idle' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState(updatedAt)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ phase: 'saving' })
    setFieldErrors({})

    const rr = Number(rrMin)
    if (rrMin.trim() === '' || Number.isNaN(rr)) {
      setFieldErrors({ rr_min: ['Must be a number'] })
      setState({ phase: 'error', message: 'Validation failed' })
      return
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId.trim(),
          triage_model_id: triageModelId.trim(),
          rr_min: rr,
          high_conviction_enabled: hcEnabled,
          high_conviction_model_id: hcModelId.trim(),
        }),
      })
      const body = (await res.json().catch(() => null)) as ConfigResponse | null
      if (!res.ok || !body?.success) {
        setFieldErrors(body?.fieldErrors ?? {})
        setState({
          phase: 'error',
          message: body?.error ?? `Request failed (HTTP ${res.status})`,
        })
        return
      }
      setLastUpdatedAt(body.data?.config?.updated_at ?? lastUpdatedAt)
      setState({ phase: 'saved' })
    } catch {
      setState({ phase: 'error', message: 'Network error — is the app server running?' })
    }
  }

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <div>
        <FieldLabel htmlFor="model_id">Briefing Model</FieldLabel>
        <input
          id="model_id"
          name="model_id"
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={inputClass}
          placeholder="provider/model"
        />
        <FieldError messages={fieldErrors.model_id} />
        <p className="mt-1 text-xs font-light text-muted">
          OpenRouter id used by the full analyze-task briefing.
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="triage_model_id">Triage Model</FieldLabel>
        <input
          id="triage_model_id"
          name="triage_model_id"
          type="text"
          value={triageModelId}
          onChange={(e) => setTriageModelId(e.target.value)}
          className={inputClass}
          placeholder="provider/model"
        />
        <FieldError messages={fieldErrors.triage_model_id} />
        <p className="mt-1 text-xs font-light text-muted">
          Cheap tier for the Check Entry eval-task — never the full briefing model.
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="rr_min">Minimum R/R</FieldLabel>
        <input
          id="rr_min"
          name="rr_min"
          type="number"
          step="0.1"
          min="0.5"
          max="10"
          value={rrMin}
          onChange={(e) => setRrMin(e.target.value)}
          className={inputClass}
        />
        <FieldError messages={fieldErrors.rr_min} />
        <p className="mt-1 text-xs font-light text-muted">
          Risk/reward gate applied to objectives (0.5–10).
        </p>
      </div>

      <div className="border-t border-hairline pt-8">
        <label htmlFor="high_conviction_enabled" className="flex cursor-pointer items-center gap-3">
          <input
            id="high_conviction_enabled"
            name="high_conviction_enabled"
            type="checkbox"
            checked={hcEnabled}
            onChange={(e) => setHcEnabled(e.target.checked)}
            className="h-5 w-5 rounded-none accent-bmw-blue"
          />
          <span className="text-xs font-bold uppercase tracking-[1.5px] text-body">
            High-Conviction Reviews
          </span>
        </label>
        <p className="mt-2 text-xs font-light text-muted">
          Route full briefings to the high-conviction model (Opus tier) for max
          fidelity at higher cost. Eval triage is unaffected.
        </p>
        {highConvictionColumnsMissing && (
          <p className="mt-2 text-xs font-light tracking-wide text-warning">
            The high-conviction columns are not in the live database yet — apply the
            high_conviction_flag migration before saving.
          </p>
        )}

        <div className="mt-6">
          <FieldLabel htmlFor="high_conviction_model_id">High-Conviction Model</FieldLabel>
          <input
            id="high_conviction_model_id"
            name="high_conviction_model_id"
            type="text"
            value={hcModelId}
            onChange={(e) => setHcModelId(e.target.value)}
            className={inputClass}
            placeholder="provider/model"
          />
          <FieldError messages={fieldErrors.high_conviction_model_id} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-8">
        <Button type="submit" disabled={state.phase === 'saving'}>
          {state.phase === 'saving' ? 'Saving…' : 'Save Settings'}
        </Button>
        {state.phase === 'saved' && (
          <p role="status" className="text-xs font-light tracking-wide text-success">
            Saved — applies from the next run.
          </p>
        )}
        {state.phase === 'error' && (
          <p role="status" className="text-xs font-light tracking-wide text-m-red">
            {state.message}
          </p>
        )}
      </div>

      <p className="text-xs font-light tracking-wide text-muted">
        Last updated: {fmtUpdatedAt(lastUpdatedAt)}
      </p>
    </form>
  )
}
