import Image from 'next/image'
import {
  profileOverlays,
  type OverlayBox,
  type OverlayKind,
  type TileOverlay,
} from '@/lib/job-plan/dashboard/overlay'
import type {
  PersistedProfileNodes,
  PersistedProfileNodesEntry,
} from '@/lib/job-plan/dashboard/schema'
import { PROFILE_KEYS, PROFILE_NAMES, type ProfileKey } from '@/lib/job-plan/profile-vision/types'

/**
 * Rendered profiles with the consensus nodes overlaid (feat-129 step 7): the
 * PNG the model looked at, served by hash from the private bucket through
 * /api/job-plans/images/[hash], under an SVG in the image's own coordinate
 * space (viewBox = render width x height) so each band lands where the
 * renderer drew that price. Kind, band, primary and agreement k/S per node,
 * on the image and in the table beneath it, so the operator grades the read
 * without leaving the dashboard. Grading marks are feat-130's.
 */

export const PROFILE_IMAGE_ROUTE = '/api/job-plans/images'

/** DESIGN.md tokens only: LVNs carry the significant accent, HVNs the brand blue, tails / thin zones the warning tone. */
const KIND_COLOR: Readonly<Record<OverlayKind, string>> = {
  lvn: 'var(--color-m-red)',
  'hvn': 'var(--color-bmw-blue)',
  'exhaustive-node': 'var(--color-warning)',
  'thin-zone': 'var(--color-muted)',
}

const LABEL_FONT_PX = 16
const LABEL_INSET_PX = 6

function OverlayRect({ box }: { box: OverlayBox }) {
  const color = KIND_COLOR[box.kind]
  const labelY = box.y + box.height + LABEL_FONT_PX + 2
  return (
    <g data-node-kind={box.kind} data-node-primary={box.primary}>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill={color}
        fillOpacity={box.kind === 'thin-zone' ? 0.12 : 0.22}
        stroke={color}
        strokeWidth={box.primary ? 3 : 1.5}
        strokeDasharray={box.kind === 'thin-zone' ? '6 4' : undefined}
      />
      <text
        x={box.x + LABEL_INSET_PX}
        y={labelY}
        fill={color}
        fontSize={LABEL_FONT_PX}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
        stroke="var(--color-canvas)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {box.primary ? '★ ' : ''}
        {box.label} · {box.agreement}
      </text>
    </g>
  )
}

function TileFigure({ overlay, name }: { overlay: TileOverlay; name: string }) {
  return (
    <figure className="relative w-full max-w-[640px]" data-tile-hash={overlay.hash}>
      {/* unoptimized: the operator grades the EXACT render the model saw; the
          PNGs are content-addressed and already cached immutably by the route. */}
      <Image
        src={`${PROFILE_IMAGE_ROUTE}/${overlay.hash}`}
        width={overlay.width}
        height={overlay.height}
        alt={`${name}, tile ${overlay.index + 1} of ${overlay.of}: ${overlay.priceLow.toFixed(2)} – ${overlay.priceHigh.toFixed(2)}`}
        className="block h-auto w-full border border-hairline"
        unoptimized
      />
      <svg
        viewBox={`0 0 ${overlay.width} ${overlay.height}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {overlay.boxes.map((box) => (
          <OverlayRect key={box.key} box={box} />
        ))}
      </svg>
      <figcaption className="mt-1 text-xs font-light tracking-wide text-muted">
        tile {overlay.index + 1}/{overlay.of} · {overlay.priceLow.toFixed(2)} –{' '}
        {overlay.priceHigh.toFixed(2)} ·{' '}
        <span title={overlay.hash}>{overlay.hash.slice(0, 12)}…</span>
      </figcaption>
    </figure>
  )
}

function NodeTable({ entry }: { entry: PersistedProfileNodesEntry }) {
  const consensus = entry.consensus
  if (!consensus) return null
  const th = 'py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted'
  const td = 'py-2 pr-3 text-sm font-light text-body'
  return (
    <table className="mt-4 w-full border-collapse text-left" data-node-table>
      <thead>
        <tr className="border-b border-hairline">
          <th className={th}>Kind</th>
          <th className={th}>Band</th>
          <th className={th}>Prom.</th>
          <th className={th}>Position · shape</th>
          <th className={th}>Agreement</th>
        </tr>
      </thead>
      <tbody>
        {consensus.nodes.map((node, i) => (
          <tr
            key={`${node.kind}-${node.priceLow}-${i}`}
            className="border-b border-hairline-strong"
          >
            <td
              className={`${td} font-bold uppercase tracking-wide ${node.kind === 'lvn' ? 'text-m-red' : 'text-ink'}`}
            >
              {node.primary ? '★ ' : ''}
              {node.kind}
            </td>
            <td className={`${td} font-bold text-ink`}>
              {node.priceLow.toFixed(2)} – {node.priceHigh.toFixed(2)}
            </td>
            <td className={td}>{node.prominence}</td>
            <td className={td}>
              {node.position} · {node.edgeBelow}/{node.edgeAbove}
            </td>
            <td className={`${td} font-bold text-ink`}>
              {node.agreement}/{node.samples}
            </td>
          </tr>
        ))}
        {consensus.thinZones.map((zone, i) => (
          <tr key={`thin-${i}`} className="border-b border-hairline-strong">
            <td className={`${td} uppercase tracking-wide`}>thin zone</td>
            <td className={`${td} font-bold text-ink`}>
              {zone.low.toFixed(2)} – {zone.high.toFixed(2)}
            </td>
            <td className={td}>—</td>
            <td className={td}>—</td>
            <td className={`${td} font-bold text-ink`}>
              {zone.agreement}/{zone.samples}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ProfilePanel({
  profileKey,
  entry,
}: {
  profileKey: ProfileKey
  entry: PersistedProfileNodesEntry
}) {
  const name = PROFILE_NAMES[profileKey].name
  const consensus = entry.consensus
  const overlays = profileOverlays(entry)
  return (
    <article
      className="border border-hairline border-t-2 border-t-hairline bg-surface-card p-6"
      data-profile={profileKey}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink">{name}</span>
        {consensus ? (
          <span className="text-xs font-light uppercase tracking-wide text-muted">
            {consensus.successfulSamples}/{consensus.samples} samples ·{' '}
            {consensus.nodes.length} nodes
          </span>
        ) : (
          <span className="border border-m-red px-2 py-0.5 text-xs font-bold uppercase tracking-[1.5px] text-m-red">
            No consensus · profile_nodes_unavailable:{profileKey}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        {overlays.map((overlay) => (
          <TileFigure key={overlay.hash} overlay={overlay} name={name} />
        ))}
        {overlays.length === 0 && (
          <p className="text-sm font-light text-muted">No stored image for this profile.</p>
        )}
      </div>
      <NodeTable entry={entry} />
    </article>
  )
}

export function JobProfilePanels({ nodes }: { nodes: PersistedProfileNodes }) {
  const present = PROFILE_KEYS.flatMap((key) => {
    const entry = nodes.profiles[key]
    return entry ? [{ key, entry }] : []
  })
  return (
    <section aria-label="Profile vision read" data-section="profiles">
      <p className="text-xs font-light tracking-wide text-muted">
        Vision read · {nodes.modelId}
        {nodes.effort ? ` · effort ${nodes.effort}` : ''} · {nodes.samples} samples · prompt{' '}
        {nodes.promptRevision}
      </p>
      <div className="mt-3 grid items-start gap-6 xl:grid-cols-2">
        {present.map(({ key, entry }) => (
          <ProfilePanel key={key} profileKey={key} entry={entry} />
        ))}
      </div>
    </section>
  )
}
