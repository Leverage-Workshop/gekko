import type { Terrain } from '@/knowledge/schema/briefing.schema'
import {
  DEFAULT_ZONE_FILL,
  ZONE_FILLS,
  type ExecutionChartModel,
} from '@/lib/briefing/executionChart'
import { formatPrice } from '@/lib/briefing/format'
import { ExecutionChart } from './execution-chart'

/**
 * Chart column: the execution candlestick chart (with objective entry zones),
 * a minimal legend, and the campaign zones strip. Server component — only the
 * chart canvas itself is a client island.
 */

function ZonesStrip({ zones }: { zones: Terrain['zones'] }) {
  if (zones.length === 0) return null
  const sorted = [...zones].sort((a, b) => b.top - a.top)
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
        Campaign Zones · Stratosphere → Abyss
      </h3>
      <div className="grid gap-px bg-hairline sm:grid-cols-2">
        {sorted.map((zone) => (
          <div
            key={`${zone.label}-${zone.top}`}
            className="flex items-center gap-3 bg-surface-card px-4 py-3"
          >
            <span
              className="h-8 w-1 shrink-0"
              style={{ backgroundColor: ZONE_FILLS[zone.color] ?? DEFAULT_ZONE_FILL }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase tracking-wide text-ink">
                {zone.label}
              </p>
              <p className="text-xs font-light tracking-wide text-muted">
                {formatPrice(zone.top)} – {formatPrice(zone.bottom)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ExecutionChartSection({
  model,
  terrain,
}: {
  model: ExecutionChartModel | null
  terrain: Terrain
}) {
  return (
    <div>
      {model ? (
        <div className="border border-hairline bg-canvas p-4">
          <ExecutionChart model={model} />

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline pt-4">
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 border-t-2 border-bmw-blue bg-bmw-blue/20" aria-hidden="true" />
              <span className="text-xs font-light uppercase tracking-wide text-muted">
                Long entry zone
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 border-b-2 border-m-red bg-m-red/20" aria-hidden="true" />
              <span className="text-xs font-light uppercase tracking-wide text-muted">
                Short entry zone
              </span>
            </span>
            <span className="text-xs font-light uppercase tracking-wide text-muted">
              All times CT
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm font-light text-muted">
          No execution bars available for this briefing — the chart renders once a
          bundle with execution_bars.csv has been ingested.
        </p>
      )}

      <ZonesStrip zones={terrain.zones} />
    </div>
  )
}
