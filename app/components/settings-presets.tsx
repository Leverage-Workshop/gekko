'use client'

import { useState } from 'react'
import type { ConfigPreset } from '@/lib/config'
import { PRESET_NAME_MAX } from '@/lib/config/presets'
import { Button } from './button'
import { FieldLabel, inputClass } from './settings-field'
import type { PresetMessage, PresetStatus } from './use-config-presets'

// Preset controls for the settings form (feat-155). The picker sits at the top
// of the form, the actions beside Save Settings at the bottom. Picking a
// preset loads the form and never writes; every write here is to the presets
// table, never to the config singleton.

const STATUS_LABELS: Record<PresetStatus, { text: string; className: string }> = {
  active: { text: 'Active', className: 'text-success' },
  'not-applied': { text: 'Not applied — Save Settings to make it live', className: 'text-warning' },
  edited: { text: 'Edited — update the preset or save as new', className: 'text-body' },
}

export function PresetPicker({
  presets,
  selected,
  status,
  tableMissing,
  onSelect,
}: {
  presets: ConfigPreset[]
  selected: ConfigPreset | null
  status: PresetStatus | null
  tableMissing: boolean
  onSelect: (id: string | null) => void
}) {
  return (
    <div className="border-b border-hairline pb-8">
      <FieldLabel htmlFor="config_preset">Preset</FieldLabel>
      <select
        id="config_preset"
        name="config_preset"
        value={selected?.id ?? ''}
        onChange={(e) => onSelect(e.target.value === '' ? null : e.target.value)}
        className={inputClass}
        disabled={tableMissing}
      >
        <option value="">{presets.length === 0 ? 'No presets saved yet' : 'Custom (no preset)'}</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      {status && (
        <p role="status" className={`mt-1 text-xs font-light tracking-wide ${STATUS_LABELS[status].className}`}>
          {STATUS_LABELS[status].text}
        </p>
      )}
      <p className="mt-1 text-xs font-light text-muted">
        Picking a preset fills the form below; nothing goes live until you Save Settings.
      </p>
      {tableMissing && (
        <p className="mt-2 text-xs font-light tracking-wide text-warning">
          The config_presets table is not in the live database yet — apply the
          config_presets migration to use presets.
        </p>
      )}
    </div>
  )
}

export function PresetActions({
  selected,
  busy,
  message,
  tableMissing,
  onSaveAs,
  onUpdate,
  onDelete,
}: {
  selected: ConfigPreset | null
  busy: boolean
  message: PresetMessage | null
  tableMissing: boolean
  onSaveAs: (name: string) => Promise<boolean>
  onUpdate: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function confirmSaveAs() {
    if (name.trim() === '') return
    const ok = await onSaveAs(name.trim())
    if (ok) {
      setNaming(false)
      setName('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {naming ? (
          <>
            <label htmlFor="preset_name" className="sr-only">
              Preset name
            </label>
            <input
              id="preset_name"
              name="preset_name"
              type="text"
              value={name}
              maxLength={PRESET_NAME_MAX}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void confirmSaveAs()
                }
              }}
              className={`${inputClass} mt-0 h-9 w-56 px-3 text-sm`}
              placeholder="Preset name"
            />
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={busy || name.trim() === ''}
              onClick={() => void confirmSaveAs()}
            >
              {busy ? 'Saving…' : 'Save preset'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setNaming(false)
                setName('')
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={busy || tableMissing}
            onClick={() => {
              setConfirmingDelete(false)
              setNaming(true)
            }}
          >
            Save as new preset
          </Button>
        )}

        {selected && !naming && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onUpdate()}
            >
              Update &ldquo;{selected.name}&rdquo;
            </Button>
            {confirmingDelete ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingDelete(false)
                    void onDelete()
                  }}
                >
                  Confirm delete
                </Button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs font-light uppercase tracking-wide text-muted underline underline-offset-4 hover:no-underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
                className="text-xs font-light uppercase tracking-wide text-muted underline underline-offset-4 hover:no-underline"
              >
                Delete preset
              </button>
            )}
          </>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={`text-xs font-light tracking-wide ${message.kind === 'ok' ? 'text-success' : 'text-m-red'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
