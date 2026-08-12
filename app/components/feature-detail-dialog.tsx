'use client'

import { useEffect, useRef } from 'react'
import type { FeatureRow } from '@/lib/features/featureList'
import { statusTone } from './feature-status'

/**
 * Row-detail modal for the Features tab: the full description, which the grid
 * truncates to a scannable line.
 *
 * Built on the native `<dialog>` element rather than a component library —
 * TanStack ships no dialog package, and `showModal()` already gives the top
 * layer, the backdrop, focus trapping and Escape-to-close for free. React only
 * mirrors the open/closed prop onto the element and reports closes back up, so
 * the element stays the single owner of "is it open".
 */
export function FeatureDetailDialog({
  feature,
  onClose,
}: {
  /** The row to show; `null` closes the dialog. */
  feature: FeatureRow | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (feature && !dialog.open) dialog.showModal()
    if (!feature && dialog.open) dialog.close()
  }, [feature])

  return (
    <dialog
      ref={ref}
      // Escape and the backdrop close it; both land here as the native event.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-label={feature ? `${feature.id} details` : undefined}
      className="m-auto max-h-[80vh] w-[min(1000px,92vw)] overflow-y-auto rounded-none border border-hairline border-t-2 border-t-bmw-blue bg-surface-card p-0 text-ink backdrop:bg-black/70"
    >
      {feature && (
        <div className="p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
            <span className="flex flex-wrap items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue">
                {feature.id}
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-[1.5px] ${statusTone(
                  feature.status
                )}`}
              >
                {feature.status}
              </span>
            </span>
            <button
              onClick={onClose}
              className="border border-hairline px-3 py-1.5 text-xs font-bold uppercase tracking-[1.5px] text-body transition-colors hover:border-ink hover:text-ink"
            >
              Close
            </button>
          </div>

          <h3 className="mt-5 text-xl font-bold tracking-tight text-ink">{feature.name}</h3>

          <p className="mt-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
            Depends On:{' '}
            <span className="font-light normal-case tracking-wide text-body">
              {feature.dependencies.length > 0 ? feature.dependencies.join(', ') : '—'}
            </span>
          </p>

          <section className="mt-6">
            <h4 className="border-b border-hairline pb-2 text-xs font-bold uppercase tracking-[1.5px] text-ink">
              Description
            </h4>
            <p className="mt-3 whitespace-pre-wrap text-sm font-light leading-relaxed text-body">
              {feature.description || '—'}
            </p>
          </section>
        </div>
      )}
    </dialog>
  )
}
