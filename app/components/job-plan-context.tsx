import type { JobContextView } from '@/lib/job-plan/dashboard/schema'
import { formatBand, formatPts, formatWallClock } from '@/lib/job-plan/dashboard/format'

/**
 * Context header of the Job plan card (feat-129): every classifyContext
 * dimension rendered MECHANICALLY with its evidence and asOf scope — the
 * location reads, the JBA boxes, the enclosing zone, the cross-read with any
 * weekly / JBA / daily disagreement spelled out, observation coverage, and
 * the data-quality flags. Nothing here is prose the surface invents; every
 * string is a field of the persisted context.
 */

const LABEL = 'text-xs font-bold uppercase tracking-[1.5px] text-muted'
const VALUE = 'mt-1 text-sm font-bold uppercase tracking-wide text-ink'
const DETAIL = 'mt-1 text-xs font-light leading-relaxed text-body'
const CELL = 'bg-surface-soft px-5 py-3'

function ValueZoneCell({
  title,
  zone,
}: {
  title: string
  zone: JobContextView['location']['vsWeeklyValue']
}) {
  const e = zone.evidence
  return (
    <div className={CELL}>
      <p className={LABEL}>{title}</p>
      <p className={VALUE}>{zone.read}</p>
      <p className={DETAIL}>
        VAL {e.valueLow.toFixed(2)} · pivot {e.pivot.toFixed(2)} · VAH {e.valueHigh.toFixed(2)} ·
        from pivot {formatPts(e.fromPivotPts)} (merge ±{e.mergeTolerancePts})
      </p>
    </div>
  )
}

function BoxesCell({ boxes }: { boxes: JobContextView['location']['vsBoxes'] }) {
  return (
    <div className={CELL}>
      <p className={LABEL}>JBA boxes</p>
      {boxes.length === 0 ? (
        <p className={VALUE}>none</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {boxes.map((box) => (
            <li key={box.boxIndex} className="text-xs font-light leading-relaxed text-body">
              <span className="font-bold uppercase tracking-wide text-ink">
                Box {box.boxIndex + 1}: {box.read} · {box.side}
              </span>{' '}
              {formatBand(box.evidence.low, box.evidence.high)} · from low{' '}
              {formatPts(box.evidence.fromLowPts)} · from high {formatPts(box.evidence.fromHighPts)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EnclosingZoneCell({ zone }: { zone: JobContextView['location']['enclosingZone'] }) {
  return (
    <div className={CELL}>
      <p className={LABEL}>Enclosing zone</p>
      {zone === null ? (
        <p className={VALUE}>none</p>
      ) : (
        <>
          <p className={`${VALUE} ${zone.midZone ? 'text-warning' : ''}`}>
            {zone.kind}
            {zone.midZone ? ' · mid-zone (R10)' : ''}
          </p>
          <p className={DETAIL}>
            {zone.lowerEdge.label} {zone.lowerEdge.price.toFixed(2)} ({formatPts(zone.fromLowerPts)}
            ) → {zone.upperEdge.label} {zone.upperEdge.price.toFixed(2)} (
            {formatPts(zone.fromUpperPts)})
          </p>
        </>
      )}
    </div>
  )
}

function CrossReadCell({ cross }: { cross: JobContextView['location']['crossRead'] }) {
  return (
    <div className={CELL} data-cross-read={cross.unanimous ? 'unanimous' : 'disagreement'}>
      <p className={LABEL}>Cross-read</p>
      <p className={VALUE}>
        weekly {cross.weekly} · daily {cross.daily} · JBA {cross.jba}
      </p>
      {cross.unanimous ? (
        <p className={DETAIL}>unanimous</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {cross.disagreements.map((line) => (
            <li key={line} className="text-xs font-bold leading-relaxed text-warning">
              Disagreement: {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CoverageCell({
  coverage,
  scale,
}: {
  coverage: JobContextView['origin']['coverage']
  scale: JobContextView['scale']
}) {
  const session = coverage.sessionStarted
    ? `session ${coverage.minutesSinceOpen ?? '?'} min after open${coverage.earlyWindow ? ' · EARLY window (R5)' : ''}`
    : 'pre-session'
  return (
    <div className={CELL}>
      <p className={LABEL}>Observation as of</p>
      <p className={VALUE}>{formatWallClock(coverage.asOf)}</p>
      <p className={DETAIL}>
        {session} · overnight {coverage.overnightBars} bars · session {coverage.sessionBars} bars ·
        last completed bar{' '}
        {coverage.lastCompletedBarAt ? formatWallClock(coverage.lastCompletedBarAt) : '—'}
      </p>
      <p className={DETAIL}>
        scale {scale.source}
        {scale.sessionSigmaPts !== null ? ` · σ ${scale.sessionSigmaPts.toFixed(2)} pts` : ''} ·
        reach {scale.reachPts.toFixed(2)} pts (R4)
      </p>
    </div>
  )
}

function DataQualityCell({ dq }: { dq: JobContextView['dataQuality'] }) {
  const tone = dq.sufficient ? 'text-success' : 'text-m-red'
  return (
    <div className={CELL} data-data-quality={dq.sufficient ? 'sufficient' : 'insufficient'}>
      <p className={LABEL}>Data quality</p>
      <p className={`${VALUE} ${tone}`}>{dq.sufficient ? 'sufficient' : 'insufficient (R13)'}</p>
      <p className={DETAIL}>
        exports daily {formatWallClock(dq.exportTimes.daily)} · weekly{' '}
        {formatWallClock(dq.exportTimes.weekly)} · MGI{' '}
        {dq.exportTimes.mgi ? formatWallClock(dq.exportTimes.mgi) : '—'} · bars{' '}
        {dq.exportTimes.bars ? formatWallClock(dq.exportTimes.bars) : '—'}
        {dq.maxSkewSeconds !== null ? ` · max skew ${dq.maxSkewSeconds}s` : ''}
      </p>
      <p className={DETAIL}>
        trading day study {dq.tradingDay.study} / bundle {dq.tradingDay.bundle}{' '}
        {dq.tradingDay.match ? '(match)' : '(MISMATCH)'} · boxes{' '}
        {dq.boxesProvisional ? 'provisional' : 'final'} · profile nodes {dq.profileNodes}
      </p>
      {dq.issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {dq.issues.map((issue) => (
            <li
              key={`${issue.code}-${issue.message}`}
              className={`text-xs font-light leading-relaxed ${issue.severity === 'insufficient' ? 'text-m-red' : 'text-warning'}`}
            >
              <span className="font-bold uppercase tracking-wide">{issue.code}</span> ·{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function JobContextHeader({ context }: { context: JobContextView }) {
  return (
    <section aria-label="Context" data-section="context">
      <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-2 xl:grid-cols-3">
        <ValueZoneCell title="vs weekly value" zone={context.location.vsWeeklyValue} />
        <ValueZoneCell title="vs daily value" zone={context.location.vsDailyValue} />
        <BoxesCell boxes={context.location.vsBoxes} />
        <EnclosingZoneCell zone={context.location.enclosingZone} />
        <CrossReadCell cross={context.location.crossRead} />
        <CoverageCell coverage={context.origin.coverage} scale={context.scale} />
      </div>
      <div className="mt-px border border-t-0 border-hairline">
        <DataQualityCell dq={context.dataQuality} />
      </div>
    </section>
  )
}
