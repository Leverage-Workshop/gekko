'use client'

import { useState } from 'react'
import type { ConfigPreset, ConfigUpdate } from '@/lib/config'
import { applyPresetValues, findActivePreset, presetValuesEqual } from '@/lib/config/presets'

// Preset state + API calls for the settings form (feat-155). Presets are
// snapshots: nothing here writes the config singleton. Selecting one LOADS
// the form (via onLoad); the form's own Save Settings makes it live.

/**
 * How the selected preset relates to the form and the live row:
 * - active       form == preset == live (the pipelines are running it)
 * - not-applied  form == preset, live differs (save to make it live)
 * - edited       form drifted from the preset (update it, or save as new)
 */
export type PresetStatus = 'active' | 'not-applied' | 'edited'

export function presetStatus(
  selected: ConfigPreset | null,
  form: ConfigUpdate,
  live: ConfigUpdate,
): PresetStatus | null {
  if (!selected) return null
  if (!presetValuesEqual(form, selected.values)) return 'edited'
  return presetValuesEqual(live, form) ? 'active' : 'not-applied'
}

export type PresetMessage = { kind: 'ok' | 'error'; text: string }

interface PresetResponse {
  success?: boolean
  data?: { preset?: ConfigPreset }
  error?: string
  fieldErrors?: Record<string, string[]>
}

interface Options {
  initialPresets: ConfigPreset[]
  live: ConfigUpdate
  /** The form's current values, or null when they fail client-side validation. */
  readForm: () => ConfigUpdate | null
  /** Replace the form's values (a preset was picked). */
  onLoad: (values: ConfigUpdate) => void
}

async function call(url: string, method: string, body?: unknown): Promise<PresetResponse & { status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const parsed = (await res.json().catch(() => null)) as PresetResponse | null
    return { ...(parsed ?? {}), status: res.status }
  } catch {
    return { success: false, error: 'Network error — is the app server running?', status: 0 }
  }
}

function failureText(res: PresetResponse & { status: number }): string {
  const fieldError = res.fieldErrors ? Object.values(res.fieldErrors).flat()[0] : undefined
  return fieldError ?? res.error ?? `Request failed (HTTP ${res.status})`
}

export function useConfigPresets({ initialPresets, live, readForm, onLoad }: Options) {
  const [presets, setPresets] = useState<ConfigPreset[]>(initialPresets)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => findActivePreset(initialPresets, live)?.id ?? null,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<PresetMessage | null>(null)

  const selected = presets.find((preset) => preset.id === selectedId) ?? null

  function select(id: string | null) {
    setMessage(null)
    setSelectedId(id)
    const preset = presets.find((candidate) => candidate.id === id)
    if (preset) {
      // Merge over the LIVE row, never the half-edited form: a preset saved
      // before a config column existed inherits that column's live value, so
      // an unrelated unsaved edit can't ride along into the next save.
      onLoad(applyPresetValues(live, preset.values))
    }
  }

  async function saveAs(name: string): Promise<boolean> {
    const values = readForm()
    if (!values) return false
    setBusy(true)
    setMessage(null)
    const res = await call('/api/config/presets', 'POST', { name, values })
    setBusy(false)
    if (!res.success || !res.data?.preset) {
      setMessage({ kind: 'error', text: failureText(res) })
      return false
    }
    const created = res.data.preset
    setPresets((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setSelectedId(created.id)
    setMessage({ kind: 'ok', text: `Saved preset "${created.name}" — Save Settings to make it live.` })
    return true
  }

  async function update(): Promise<void> {
    if (!selected) return
    const values = readForm()
    if (!values) return
    setBusy(true)
    setMessage(null)
    const res = await call(`/api/config/presets/${selected.id}`, 'PUT', { values })
    setBusy(false)
    if (!res.success || !res.data?.preset) {
      setMessage({ kind: 'error', text: failureText(res) })
      return
    }
    const updated = res.data.preset
    setPresets((current) => current.map((preset) => (preset.id === updated.id ? updated : preset)))
    setMessage({ kind: 'ok', text: `Updated preset "${updated.name}".` })
  }

  async function remove(): Promise<void> {
    if (!selected) return
    setBusy(true)
    setMessage(null)
    const res = await call(`/api/config/presets/${selected.id}`, 'DELETE')
    setBusy(false)
    if (!res.success) {
      setMessage({ kind: 'error', text: failureText(res) })
      return
    }
    const removedName = selected.name
    setPresets((current) => current.filter((preset) => preset.id !== selected.id))
    setSelectedId(null)
    setMessage({ kind: 'ok', text: `Deleted preset "${removedName}" — live settings unchanged.` })
  }

  return { presets, selected, busy, message, select, saveAs, update, remove }
}
