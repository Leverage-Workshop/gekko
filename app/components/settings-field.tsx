'use client'

import { REASONING_EFFORTS, type ReasoningEffort } from '@/lib/llm/reasoning'

// Shared field chrome for the settings form and its preset controls
// (feat-028 / feat-155). DESIGN.md text-input styling: surface-card,
// rounded-none, hairline border, 48px tall; uppercase letterspaced labels;
// m-red reserved for error states.

export const inputClass =
  'mt-2 h-12 w-full rounded-none border border-hairline bg-surface-card px-4 text-base font-light text-ink outline-none transition-colors focus:border-ink'

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-bold uppercase tracking-[1.5px] text-body"
    >
      {children}
    </label>
  )
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null
  return <p className="mt-1 text-xs font-light tracking-wide text-m-red">{messages[0]}</p>
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max',
}

/**
 * Reasoning-effort selector rendered under each model input. Empty value maps
 * to null (provider default — no reasoning parameter sent with the call).
 */
export function EffortSelect({
  id,
  value,
  onChange,
  messages,
}: {
  id: string
  value: ReasoningEffort | null
  onChange: (value: ReasoningEffort | null) => void
  messages?: string[]
}) {
  return (
    <div className="mt-3">
      <FieldLabel htmlFor={id}>Reasoning Effort</FieldLabel>
      <select
        id={id}
        name={id}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : (e.target.value as ReasoningEffort))
        }
        className={inputClass}
      >
        <option value="">Provider default</option>
        {REASONING_EFFORTS.map((effort) => (
          <option key={effort} value={effort}>
            {EFFORT_LABELS[effort]}
          </option>
        ))}
      </select>
      <FieldError messages={messages} />
    </div>
  )
}
