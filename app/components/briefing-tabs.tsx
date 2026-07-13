'use client'

import { useState, type ReactNode } from 'react'

/**
 * Tab shell for the briefing's right column: Objectives, Tactical Overview,
 * and Danger Zones (the chart stays pinned in the left column). Content
 * arrives as ReactNode props so the panes stay server-rendered; this island
 * only owns which pane is visible.
 */

const TABS = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'overview', label: 'Tactical Overview' },
  { id: 'danger', label: 'Danger Zones' },
] as const

type TabId = (typeof TABS)[number]['id']

export function BriefingTabs({
  objectives,
  overview,
  danger,
}: {
  objectives: ReactNode
  overview: ReactNode
  danger: ReactNode
}) {
  const [active, setActive] = useState<TabId>('objectives')
  const panes: { id: TabId; content: ReactNode }[] = [
    { id: 'objectives', content: objectives },
    { id: 'overview', content: overview },
    { id: 'danger', content: danger },
  ]

  return (
    <div>
      <div className="border-b border-hairline" role="tablist" aria-label="Briefing sections">
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

      {panes.map((pane) => (
        <div key={pane.id} role="tabpanel" hidden={active !== pane.id} className="pt-6">
          {pane.content}
        </div>
      ))}
    </div>
  )
}
