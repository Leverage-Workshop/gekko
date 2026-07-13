'use client'

import { useState, type ReactNode } from 'react'

/**
 * Two-tab shell for the briefing body: Objectives (chart + objective cards)
 * and Tactical Overview. Content arrives as ReactNode props so the panes stay
 * server-rendered; this island only owns which pane is visible.
 */

const TABS = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'overview', label: 'Tactical Overview' },
] as const

type TabId = (typeof TABS)[number]['id']

export function BriefingTabs({
  objectives,
  overview,
}: {
  objectives: ReactNode
  overview: ReactNode
}) {
  const [active, setActive] = useState<TabId>('objectives')

  return (
    <div>
      <div className="border-b border-hairline" role="tablist" aria-label="Briefing sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`-mb-px border-b-2 px-6 py-4 text-sm font-bold uppercase tracking-[1.5px] transition-colors ${
              active === tab.id
                ? 'border-bmw-blue text-ink'
                : 'border-transparent text-muted hover:text-body'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" hidden={active !== 'objectives'} className="pt-8">
        {objectives}
      </div>
      <div role="tabpanel" hidden={active !== 'overview'} className="pt-8">
        {overview}
      </div>
    </div>
  )
}
