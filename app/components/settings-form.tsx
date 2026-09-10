'use client'

import { useState, type FormEvent } from 'react'
import type { ConfigPreset, ConfigUpdate } from '@/lib/config'
import { RECOMMENDED_PROFILE_VISION } from '@/lib/job-plan/profile-vision/recommended'
import { Button } from './button'
import { EffortSelect, FieldError, FieldLabel, inputClass } from './settings-field'
import { PresetActions, PresetPicker } from './settings-presets'
import { presetStatus, useConfigPresets } from './use-config-presets'

// Settings form (feat-028): edits the config singleton via POST /api/config.
// DESIGN.md text-input styling (surface-card, rounded-none, hairline border,
// 48px tall), uppercase letterspaced labels, bmw-blue primary save button,
// m-red reserved for error states, success color for the saved confirmation.
//
// Hidden fields (operator ask, 2026-09-10): the triage model + effort,
// minimum R/R, significant move, execution bar volume and the whole
// high-conviction block are no longer rendered. The config row still carries
// them and the API still requires them, so the form holds the stored values
// and passes them through unchanged on save — nothing is reset, the knobs are
// just off-screen. Presets (feat-155) snapshot them too, so a restore is whole.

/** The editable config fields — exactly what POST /api/config accepts. */
export type SettingsInitialValues = ConfigUpdate

interface SettingsFormProps {
  initial: SettingsInitialValues
  updatedAt: string | null
  /** Saved presets (feat-155); empty when the table is missing. */
  presets: ConfigPreset[]
  /** Live DB predates the config_presets migration (feat-155). */
  presetsTableMissing: boolean
  /** Live DB predates the high_conviction_flag migration (feat-031). */
  highConvictionColumnsMissing: boolean
  /** Live DB predates the model_reasoning_effort migration. */
  effortColumnsMissing: boolean
  /** Live DB predates the execution_bar_volume migration (feat-079). */
  barVolumeColumnMissing: boolean
  /** Live DB predates the significant_move_sigma migration (feat-096). */
  significantMoveColumnMissing: boolean
  /** Live DB predates the profile_vision_config migration (feat-124). */
  profileVisionColumnsMissing: boolean
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

function fmtUpdatedAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/**
 * The form's values as the API wants them: trimmed ids, blank vision model →
 * null, the samples text parsed. Null when the samples text is not a number
 * (the one check the server can't phrase better than "Must be a number").
 */
function readForm(values: ConfigUpdate, pvSamplesText: string): ConfigUpdate | null {
  const samples = Number(pvSamplesText)
  if (pvSamplesText.trim() === '' || Number.isNaN(samples)) return null
  const pvModelId = values.profile_vision_model_id?.trim() ?? ''
  return {
    ...values,
    model_id: values.model_id.trim(),
    profile_vision_model_id: pvModelId === '' ? null : pvModelId,
    profile_vision_samples: samples,
  }
}

export function SettingsForm({
  initial,
  updatedAt,
  presets: initialPresets,
  presetsTableMissing,
  highConvictionColumnsMissing,
  effortColumnsMissing,
  barVolumeColumnMissing,
  significantMoveColumnMissing,
  profileVisionColumnsMissing,
}: SettingsFormProps) {
  const [values, setValues] = useState<ConfigUpdate>(initial)
  const [pvSamplesText, setPvSamplesText] = useState(String(initial.profile_vision_samples))
  const [live, setLive] = useState<ConfigUpdate>(initial)
  const [state, setState] = useState<SaveState>({ phase: 'idle' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState(updatedAt)

  function set<K extends keyof ConfigUpdate>(key: K, value: ConfigUpdate[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function loadValues(next: ConfigUpdate) {
    setValues(next)
    setPvSamplesText(String(next.profile_vision_samples))
    setFieldErrors({})
    setState({ phase: 'idle' })
  }

  function readValidated(): ConfigUpdate | null {
    const body = readForm(values, pvSamplesText)
    if (!body) {
      setFieldErrors({ profile_vision_samples: ['Must be a number'] })
    }
    return body
  }

  const presetsApi = useConfigPresets({
    initialPresets,
    live,
    readForm: readValidated,
    onLoad: loadValues,
  })
  const formValues = readForm(values, pvSamplesText) ?? values
  const status = presetStatus(presetsApi.selected, formValues, live)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ phase: 'saving' })
    setFieldErrors({})

    const body = readValidated()
    if (!body) {
      setState({ phase: 'error', message: 'Validation failed' })
      return
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const parsed = (await res.json().catch(() => null)) as ConfigResponse | null
      if (!res.ok || !parsed?.success) {
        setFieldErrors(parsed?.fieldErrors ?? {})
        setState({
          phase: 'error',
          message: parsed?.error ?? `Request failed (HTTP ${res.status})`,
        })
        return
      }
      setLive(body)
      setLastUpdatedAt(parsed.data?.config?.updated_at ?? lastUpdatedAt)
      setState({ phase: 'saved' })
    } catch {
      setState({ phase: 'error', message: 'Network error — is the app server running?' })
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-8" noValidate>
      <PresetPicker
        presets={presetsApi.presets}
        selected={presetsApi.selected}
        status={status}
        tableMissing={presetsTableMissing}
        onSelect={presetsApi.select}
      />

      <div>
        <FieldLabel htmlFor="model_id">Briefing Model</FieldLabel>
        <input
          id="model_id"
          name="model_id"
          type="text"
          value={values.model_id}
          onChange={(e) => set('model_id', e.target.value)}
          className={inputClass}
          placeholder="provider/model"
        />
        <FieldError messages={fieldErrors.model_id} />
        <p className="mt-1 text-xs font-light text-muted">
          OpenRouter id used by the full analyze-task briefing.
        </p>
        <EffortSelect
          id="model_effort"
          value={values.model_effort}
          onChange={(effort) => set('model_effort', effort)}
          messages={fieldErrors.model_effort}
        />
      </div>

      <div className="border-t border-hairline pt-8">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-body">
          Job Planner — Profile Vision
        </span>
        <p className="mt-2 text-xs font-light text-muted">
          LLM read of the rendered balance-area / 400-pt rotation volume profiles for the Job
          plan (feat-123). Leave the model blank to keep the read OFF — the
          planner degrades with a warning (R14). Only enable after ratifying the
          bench numbers (R15).
        </p>

        <div className="mt-6">
          <FieldLabel htmlFor="profile_vision_model_id">Profile Vision Model</FieldLabel>
          <input
            id="profile_vision_model_id"
            name="profile_vision_model_id"
            type="text"
            value={values.profile_vision_model_id ?? ''}
            onChange={(e) => set('profile_vision_model_id', e.target.value)}
            className={inputClass}
            placeholder={`${RECOMMENDED_PROFILE_VISION.modelId} (blank = read OFF)`}
          />
          <FieldError messages={fieldErrors.profile_vision_model_id} />
          <p className="mt-1 text-xs font-light text-muted">
            Blank turns the vision read off; feat-128 then reports profile nodes
            unavailable rather than calling a model.
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => {
                setValues((current) => ({
                  ...current,
                  profile_vision_model_id: RECOMMENDED_PROFILE_VISION.modelId,
                  profile_vision_model_effort: RECOMMENDED_PROFILE_VISION.effort,
                  profile_vision_samples: RECOMMENDED_PROFILE_VISION.samples,
                }))
                setPvSamplesText(String(RECOMMENDED_PROFILE_VISION.samples))
              }}
              className="text-xs font-light uppercase tracking-wide text-accent underline underline-offset-4 hover:no-underline"
            >
              Use recommended
            </button>
            <span className="text-xs font-light text-muted">
              {RECOMMENDED_PROFILE_VISION.modelId} · {RECOMMENDED_PROFILE_VISION.effort} effort ·{' '}
              {RECOMMENDED_PROFILE_VISION.samples} samples ({RECOMMENDED_PROFILE_VISION.evidence})
            </span>
          </div>
          <EffortSelect
            id="profile_vision_model_effort"
            value={values.profile_vision_model_effort}
            onChange={(effort) => set('profile_vision_model_effort', effort)}
            messages={fieldErrors.profile_vision_model_effort}
          />
        </div>

        <div className="mt-6">
          <FieldLabel htmlFor="profile_vision_samples">Vision Samples per Image</FieldLabel>
          <input
            id="profile_vision_samples"
            name="profile_vision_samples"
            type="number"
            step="1"
            min="1"
            max="5"
            value={pvSamplesText}
            onChange={(e) => setPvSamplesText(e.target.value)}
            className={inputClass}
          />
          <FieldError messages={fieldErrors.profile_vision_samples} />
          <p className="mt-1 text-xs font-light text-muted">
            S in the per-profile consensus (1–5) — a node needs a majority of
            samples to survive. Default 3.
          </p>
        </div>

        {profileVisionColumnsMissing && (
          <p className="mt-2 text-xs font-light tracking-wide text-warning">
            The profile-vision columns are not in the live database yet — apply
            the profile_vision_config migration before saving.
          </p>
        )}
      </div>

      {effortColumnsMissing && (
        <p className="text-xs font-light tracking-wide text-warning">
          The reasoning-effort columns are not in the live database yet — apply the
          model_reasoning_effort migration before saving.
        </p>
      )}
      {(highConvictionColumnsMissing || barVolumeColumnMissing || significantMoveColumnMissing) && (
        <p className="text-xs font-light tracking-wide text-warning">
          Some config columns are not in the live database yet — apply the
          {highConvictionColumnsMissing ? ' high_conviction_flag' : ''}
          {barVolumeColumnMissing ? ' execution_bar_volume' : ''}
          {significantMoveColumnMissing ? ' volatility_scaled_gates' : ''} migration(s)
          before saving.
        </p>
      )}

      <div className="space-y-6 border-t border-hairline pt-8">
        <div className="flex flex-wrap items-center gap-6">
          <Button type="submit" disabled={state.phase === 'saving' || presetsApi.busy}>
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
        <PresetActions
          selected={presetsApi.selected}
          busy={presetsApi.busy || state.phase === 'saving'}
          message={presetsApi.message}
          tableMissing={presetsTableMissing}
          onSaveAs={presetsApi.saveAs}
          onUpdate={presetsApi.update}
          onDelete={presetsApi.remove}
        />
      </div>

      <p className="text-xs font-light tracking-wide text-muted">
        Last updated: {fmtUpdatedAt(lastUpdatedAt)}
      </p>
    </form>
  )
}
