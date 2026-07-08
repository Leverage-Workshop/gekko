import type { Terrain } from '@/knowledge/schema/briefing.schema'
import { buildTerrainMap, LEVEL_STYLES } from '@/lib/briefing/terrainMap'

// Terrain zone map (feat-019): renders the layout model computed by the pure
// lib/briefing/terrainMap.ts — contiguous zone rectangles (No-Gap invariant),
// a vertical price axis, the trench/wall/magnet/mgi levels overlay, and the
// current-price marker. All geometry lives in the lib module; this component
// only paints the model.

const KIND_LEGEND: { kind: keyof typeof LEVEL_STYLES; label: string }[] = [
  { kind: 'trench', label: 'Trench' },
  { kind: 'wall', label: 'Wall' },
  { kind: 'magnet', label: 'Magnet' },
  { kind: 'mgi', label: 'MGI' },
]

export function TerrainMap({
  terrain,
  currentPrice,
}: {
  terrain: Terrain
  currentPrice: number | null
}) {
  const model = buildTerrainMap(terrain, currentPrice)
  if (!model) {
    return (
      <p className="text-sm font-light text-muted">
        No terrain zones in this briefing.
      </p>
    )
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        className="w-full"
        role="img"
        aria-label="Terrain zone map: contiguous price zones with level overlay and current-price marker"
      >
        {/* Zone rectangles (contiguous Stratosphere→Abyss stack) */}
        {model.zones.map((zone) => (
          <g key={`zone-${zone.topPrice}-${zone.bottomPrice}`}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              fill={zone.fill}
              fillOpacity={zone.fillOpacity}
              stroke="#3c3c3c"
              strokeWidth={1}
            />
            {zone.labelVisible && (
              <text
                x={zone.labelX}
                y={zone.labelY}
                fill="#e6e6e6"
                fontSize={12}
                fontWeight={700}
                letterSpacing={1.5}
              >
                {zone.label.toUpperCase()}
              </text>
            )}
          </g>
        ))}

        {/* Price axis ticks */}
        {model.ticks.map((tick) => (
          <g key={`tick-${tick.price}`}>
            <line
              x1={model.plot.x - 6}
              x2={model.plot.x}
              y1={tick.y}
              y2={tick.y}
              stroke="#3c3c3c"
              strokeWidth={1}
            />
            <text
              x={model.plot.x - 10}
              y={tick.y + 4}
              fill="#7e7e7e"
              fontSize={11}
              fontWeight={300}
              textAnchor="end"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Level overlay (trench / wall / magnet / mgi) */}
        {model.levels.map((level) => (
          <g key={`level-${level.kind}-${level.price}-${level.label}`}>
            <line
              x1={level.x1}
              x2={level.x2}
              y1={level.y}
              y2={level.y}
              stroke={level.color}
              strokeWidth={1.5}
              strokeDasharray={level.dash || undefined}
            />
            <text
              x={level.labelX}
              y={level.labelY}
              fill={level.color}
              fontSize={11}
              fontWeight={400}
              letterSpacing={0.5}
            >
              {level.priceText} · {level.label.toUpperCase()}
            </text>
          </g>
        ))}

        {/* Current-price marker */}
        {model.marker && (
          <g>
            <line
              x1={model.marker.x1}
              x2={model.marker.x2}
              y1={model.marker.y}
              y2={model.marker.y}
              stroke="#1c69d4"
              strokeWidth={2.5}
            />
            <text
              x={model.marker.labelX}
              y={model.marker.labelY}
              fill="#1c69d4"
              fontSize={12}
              fontWeight={700}
              textAnchor="end"
            >
              {model.marker.priceText}
            </text>
          </g>
        )}
      </svg>

      {/* Level-kind legend */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {KIND_LEGEND.map(({ kind, label }) => (
          <span key={kind} className="flex items-center gap-2">
            <svg width="24" height="4" aria-hidden="true">
              <line
                x1={0}
                x2={24}
                y1={2}
                y2={2}
                stroke={LEVEL_STYLES[kind].color}
                strokeWidth={2}
                strokeDasharray={LEVEL_STYLES[kind].dash || undefined}
              />
            </svg>
            <span className="text-xs font-light uppercase tracking-wide text-muted">
              {label}
            </span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <svg width="24" height="4" aria-hidden="true">
            <line x1={0} x2={24} y1={2} y2={2} stroke="#1c69d4" strokeWidth={3} />
          </svg>
          <span className="text-xs font-light uppercase tracking-wide text-muted">
            Current Price
          </span>
        </span>
      </div>
    </div>
  )
}
