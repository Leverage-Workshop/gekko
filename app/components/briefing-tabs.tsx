'use client'

import { useState, type ReactNode } from 'react'

/**
 * Tab shell for the whole briefing body, spanning the full page width:
 * Objectives (the latest entry eval beside the objective cards), Tactical
 * Overview, and Features (the harness's feature_list.json as a table). Content
 * arrives as ReactNode props so the panes stay server-rendered; this island
 * only owns which pane is visible.
 */

const TABS = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'overview', label: 'Tactical Overview' },
  { id: 'features', label: 'Features' },
] as const

type TabId = (typeof TABS)[number]['id']

export function BriefingTabs({
  objectives,
  overview,
  features,
  actions,
}: {
  objectives: ReactNode
  overview: ReactNode
  features: ReactNode
  /** Trigger buttons parked at the right end of the tab row (feat-020 / feat-038). */
  actions?: ReactNode
}) {
  const [active, setActive] = useState<TabId>('objectives')
  const panes: { id: TabId; content: ReactNode }[] = [
    { id: 'objectives', content: objectives },
    { id: 'overview', content: overview },
    { id: 'features', content: features },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline">
        <div className="flex" role="tablist" aria-label="Briefing sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active === tab.id}
              onClick={() => setActive(tab.id)}
              className={`-mb-px border-b-2 px-5 py-4 text-sm font-bold uppercase tracking-[1.5px] transition-colors ${
                active === tab.id
                  ? 'border-bmw-blue text-ink'
                  : 'border-transparent text-muted hover:text-body'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {actions && <div className="flex items-center gap-3 pb-3">{actions}</div>}
      </div>

      {panes.map((pane) => (
        <div key={pane.id} role="tabpanel" hidden={active !== pane.id} className="pt-6">
          {pane.content}
        </div>
      ))}
    </div>
  )
}
