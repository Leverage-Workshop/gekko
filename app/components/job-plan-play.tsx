import type { DestinationStage, Play } from '@/knowledge/schema/job-plan.schema'
import { formatBand, formatPts, formatWallClock } from '@/lib/job-plan/dashboard/format'

/**
 * One play card (feat-129): stance / direction, the trigger band with its
 * members named by MGI / study label, activation evidence + the rule IDs
 * that fired, the staged destination chain IN ORDER, the R11 response
 * deadline as text, invalidation (+ the flip clause), the explicit `dont`,
 * and the box-expansion band rendered as UNCERTAINTY only. Direction color
 * follows the objective cards: long bmw-blue, short m-red, two-way hairline.
 */

const LABEL = 'text-xs font-bold uppercase tracking-[1.5px] text-muted'

function directionAccent(direction: Play['direction']) {
  switch (direction) {
    case 'long':
      return {
        top: 'border-t-bmw-blue',
        text: 'text-bmw-blue',
        badge: 'border-bmw-blue text-bmw-blue',
      }
    case 'short':
      return { top: 'border-t-m-red', text: 'text-m-red', badge: 'border-m-red text-m-red' }
    case 'two-way':
      return {
        top: 'border-t-hairline',
        text: 'text-ink',
        badge: 'border-hairline text-body-strong',
      }
  }
}

function StageRow({ stage }: { stage: DestinationStage }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed">
      <span className="w-6 shrink-0 font-bold text-ink">{stage.order}</span>
      <span className="font-light text-body">
        <span className="font-bold text-ink">{stage.label}</span>{' '}
        {formatBand(stage.low, stage.high)} ·{' '}
        <span className="uppercase tracking-wide">{stage.expect}</span> — {stage.text}
        {stage.beeline && (
          <span className="mt-1 block text-xs font-bold uppercase tracking-wide text-warning">
            Beeline · don&apos;t counter → {stage.beeline.destinationLabel}{' '}
            {formatBand(stage.beeline.destinationLow, stage.beeline.destinationHigh)}
          </span>
        )}
      </span>
    </li>
  )
}

function Activation({ play }: { play: Play }) {
  const a = play.activation
  return (
    <div>
      <p className={LABEL}>
        Activation · {a.state} · {a.grounding}
        {a.demoted ? ' · demoted (R9)' : ''}
      </p>
      <p className="mt-1 text-sm font-light leading-relaxed text-body">{a.evidence}</p>
      <p className="mt-1 text-xs font-light tracking-wide text-muted">
        {a.factAt ? `fact at ${formatWallClock(a.factAt)} · ` : ''}as of {formatWallClock(a.asOf)}
        {a.rulesFired.length > 0 && (
          <span className="ml-3 inline-flex flex-wrap gap-1 align-middle">
            {a.rulesFired.map((rule) => (
              <span
                key={rule}
                className="border border-hairline px-1.5 py-0.5 text-[10px] font-bold tracking-[1px] text-body-strong"
              >
                {rule}
              </span>
            ))}
          </span>
        )}
      </p>
    </div>
  )
}

function Invalidation({ play }: { play: Play }) {
  const inv = play.invalidation
  return (
    <div>
      <p className={LABEL}>Invalidation · {inv.side}</p>
      <p className="mt-1 text-sm font-light leading-relaxed text-body">
        <span className="font-bold text-ink">{formatBand(inv.low, inv.high)}</span> —{' '}
        {inv.condition}
      </p>
      {inv.thenSeek && (
        <p className="mt-1 text-xs font-light leading-relaxed text-body">
          then seek <span className="font-bold text-ink">{inv.thenSeek.label}</span>{' '}
          {formatBand(inv.thenSeek.low, inv.thenSeek.high)} — {inv.thenSeek.text}
        </p>
      )}
    </div>
  )
}

export function JobPlayCard({ play }: { play: Play }) {
  const accent = directionAccent(play.direction)
  const band = play.band
  return (
    <article
      data-play={play.id}
      data-stance={play.stance}
      className={`border border-hairline border-t-2 ${accent.top} bg-surface-card p-6`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink">
            {play.rank} · {play.primary ? 'Primary lean' : 'Play'}
          </span>
          <span className="text-xs font-light uppercase tracking-wide text-muted">
            {play.condition}
          </span>
        </span>
        <span
          className={`border px-2.5 py-1 text-xs font-bold uppercase tracking-[1.5px] ${accent.badge}`}
        >
          {play.stance} · {play.direction}
        </span>
      </div>

      <h3 className={`mt-4 text-xl font-bold tracking-tight ${accent.text}`}>{play.summary}</h3>

      <div className="mt-4">
        <p className={LABEL}>
          Trigger band · {band.role} · {band.side} {formatPts(band.distancePts)} ·{' '}
          {band.triggerStatus}
        </p>
        <p className="mt-1 text-sm font-light leading-relaxed text-body">
          <span className="font-bold text-ink">{band.label}</span> {formatBand(band.low, band.high)}
          {band.anchorSource ? ` · anchor ${band.anchorSource}` : ''}
        </p>
        <p className="mt-1 text-xs font-light leading-relaxed text-body">
          members: {band.memberLabels.join(' · ')}
        </p>
        <p className="mt-2 text-sm font-light leading-relaxed text-body-strong">{play.trigger}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Activation play={play} />
        <Invalidation play={play} />
      </div>

      <div className="mt-4">
        <p className={LABEL}>Destinations · in order</p>
        {play.destinations.length === 0 ? (
          <p className="mt-1 text-sm font-light text-muted">—</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {play.destinations.map((stage) => (
              <StageRow key={stage.order} stage={stage} />
            ))}
          </ol>
        )}
      </div>

      {play.responseDeadline && (
        <p className="mt-4 text-xs font-light leading-relaxed text-body">
          <span className={LABEL}>Response deadline (R11, text only)</span>
          <span className="mt-1 block">{play.responseDeadline.text}</span>
        </p>
      )}

      <p className="mt-4 text-sm font-light leading-relaxed text-body">
        <span className="font-bold uppercase tracking-wide text-m-red">Don&apos;t</span> —{' '}
        {play.dont}
      </p>

      {play.uncertaintyBand && (
        <p
          className="mt-4 border border-dashed border-hairline px-4 py-3 text-xs font-light leading-relaxed text-body"
          data-uncertainty="box-expansion"
        >
          <span className="font-bold uppercase tracking-[1.5px] text-warning">
            Uncertainty · box expansion · not a trigger
          </span>
          <span className="mt-1 block">
            {formatBand(play.uncertaintyBand.low, play.uncertaintyBand.high)} —{' '}
            {play.uncertaintyBand.text}
          </span>
        </p>
      )}
    </article>
  )
}
