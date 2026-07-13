import type { Terrain } from '@/knowledge/schema/briefing.schema'
import {
  CHART_LEVEL_STYLES,
  CURRENT_PRICE_STYLE,
  DEFAULT_ZONE_FILL,
  ZONE_FILLS,
  type ExecutionChartModel,
} from '@/lib/briefing/executionChart'
import { formatPrice } from '@/lib/briefing/format'
import { ExecutionChart } from './execution-chart'

/**
 * Terrain section body: the execution candlestick chart plus its legend, the
 * off-map level list, and the campaign zones strip. Server component — only
 * the chart canvas itself is a client island.
 */

const LEGEND: { label: string; color: string; dash: boolean }[] = [
  { label: 'Trench', color: CHART_LEVEL_STYLES.trench.color, dash: true },
  { label: 'Wall', color: CHART_LEVEL_STYLES.wall.color, dash: false },
  { label: 'Magnet', color: CHART_LEVEL_STYLES.magnet.color, dash: true },
  { label: 'MGI', color: CHART_LEVEL_STYLES.mgi.color, dash: true },
  { label: 'Current Price', color: CURRENT_PRICE_STYLE.color, dash: false },
]

function ZonesStrip({ zones }: { zones: Terrain['zones'] }) {
  if (zones.length === 0) return null
  const sorted = [...zones].sort((a, b) => b.top - a.top)
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
        Campaign Zones · Stratosphere → Abyss
      </h3>
      <div className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-3">
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
            {LEGEND.map(({ label, color, dash }) => (
              <span key={label} className="flex items-center gap-2">
                <svg width="24" height="4" aria-hidden="true">
                  <line
                    x1={0}
                    x2={24}
                    y1={2}
                    y2={2}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={dash ? '4 3' : undefined}
                  />
                </svg>
                <span className="text-xs font-light uppercase tracking-wide text-muted">
                  {label}
                </span>
              </span>
            ))}
          </div>

          {model.offMapLevels.length > 0 && (
            <p className="mt-3 text-xs font-light leading-relaxed text-muted">
              Beyond the traded range:{' '}
              {model.offMapLevels
                .map((level) => `${level.label} (${formatPrice(level.price)})`)
                .join(' · ')}
            </p>
          )}
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
