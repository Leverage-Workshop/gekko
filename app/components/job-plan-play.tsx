import type { Play } from '@/knowledge/schema/job-plan.schema'
import { formatBand, formatPts, formatWallClock } from '@/lib/job-plan/dashboard/format'
import { HighlightedText } from './highlighted-text'

/**
 * One play card (feat-129, reformatted feat-143 to the objective-card shape):
 * rank/stance header, a SHORT accent headline (condition at the trigger band →
 * the chain's conclusion, level names only — no price ranges), the activation
 * evidence as the description with level names bolded (names carry emphasis,
 * prices ride unemphasized — briefing doctrine), then the trigger band,
 * invalidation and destination stages as Action Point / Price / Description
 * table rows. Band meta, rule chips, the R11 deadline, the DON'T and the
 * box-expansion uncertainty band survive as compact footer rows. Direction
 * color follows the objective cards: long bmw-blue, short m-red; the
 * invalidation price flips to the counter accent.
 */

/** Direction colors: long bmw-blue, short m-red, the two-way play (feat-152) purple — the same colour the Sierra study draws a two-sided level in; the R10 stand-down stays neutral. */
function directionAccent(play: Pick<Play, 'direction' | 'stance'>) {
  if (play.stance === 'two-way') {
    return {
      top: 'border-t-two-way',
      text: 'text-two-way',
      counterText: 'text-body-strong',
      badge: 'border-two-way text-two-way',
    }
  }
  switch (play.direction) {
    case 'long':
      return {
        top: 'border-t-bmw-blue',
        text: 'text-bmw-blue',
        counterText: 'text-m-red',
        badge: 'border-bmw-blue text-bmw-blue',
      }
    case 'short':
      return {
        top: 'border-t-m-red',
        text: 'text-m-red',
        counterText: 'text-bmw-blue',
        badge: 'border-m-red text-m-red',
      }
    case 'two-way':
      return {
        top: 'border-t-hairline',
        text: 'text-ink',
        counterText: 'text-body-strong',
        badge: 'border-hairline text-body-strong',
      }
  }
}

/** The level names this play quotes — what the description and table bold. */
function playTerms(play: Play): string[] {
  const labels = [
    play.band.label,
    ...play.band.memberLabels,
    ...play.destinations.map((stage) => stage.label),
    ...(play.invalidation.thenSeek ? [play.invalidation.thenSeek.label] : []),
  ]
  return [...new Set(labels.filter((label) => label.trim().length > 0))]
}

/** The compact headline: condition at the trigger band → the chain's conclusion. Names only. */
export function playHeadline(play: Play): string {
  const isLong = play.direction === 'long'
  const name = play.band.label
  const last = play.destinations[play.destinations.length - 1]
  const final = last?.label ?? null
  switch (play.condition) {
    case 'look-and-fail':
      return `Look-${isLong ? 'below' : 'above'}-and-fail at ${name} → rotate back across to ${final ?? 'the far edge'}`
    case 'hold-traverse':
      return `${isLong ? 'Rebid' : 'Reoffer'} ${name} on the arrival → traverse to ${final ?? 'the far edge'}`
    case 'build-beyond-continuation':
      return `Build ${isLong ? 'above' : 'below'} ${name} → attack ${final ?? 'the next structure'}`
    case 'approach-failure':
      return `Stall short of ${name} → ${isLong ? 'long' : 'short'} the stall, target ${final ?? 'back across'}`
    case 'mid-zone-two-way':
      return `${name} — two-way, wait for the edges`
    case 'fail-or-hold': {
      const legs = play.destinations.map((stage) => stage.label)
      return `Two-way at ${name} — fail back across or build through${legs.length > 0 ? ` → ${legs.join(' / ')}` : ''}`
    }
  }
}

type ActionRow = {
  point: string
  price: string
  description: string
  counter: boolean
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/** Rows labeled the way the objective card labels its action points. */
function actionRows(play: Play): ActionRow[] {
  const inv = play.invalidation
  const flip = inv.thenSeek ? `; ${inv.thenSeek.text}` : ''
  const stop =
    inv.side === 'either'
      ? 'Structural stop — either side'
      : `Structural stop ${inv.side} ${play.band.label}`
  return [
    {
      point: `Entry (${capitalize(play.stance)}) — ${play.band.label}`,
      price: formatBand(play.band.low, play.band.high),
      description: play.trigger,
      counter: false,
    },
    {
      point: stop,
      price: formatBand(inv.low, inv.high),
      description: `${inv.condition}${flip}`,
      counter: true,
    },
    ...play.destinations.map((stage) => ({
      // feat-152: a two-way play's stages are the first stop of EACH leg — alternatives, never a sequence
      point: play.stance === 'two-way' ? legLabel(stage.text) : `Target ${stage.order} (T${stage.order})`,
      price: formatBand(stage.low, stage.high),
      description: stage.text,
      counter: false,
    })),
  ]
}

/** "Fail leg (short): …" → "Fail leg (short)". */
function legLabel(text: string): string {
  const colon = text.indexOf(':')
  return colon > 0 ? text.slice(0, colon) : 'Leg'
}

export function JobPlayCard({ play }: { play: Play }) {
  const accent = directionAccent(play)
  const band = play.band
  const terms = playTerms(play)
  const twoWay = play.stance === 'two-way'
  const sequence = play.destinations.map((stage) => stage.label).join(twoWay ? ' / ' : ' → ')
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
            {play.activation.demoted ? ' · demoted (R9)' : ''}
          </span>
        </span>
        <span
          className={`border px-2.5 py-1 text-xs font-bold uppercase tracking-[1.5px] ${accent.badge}`}
        >
          {play.stance} · {play.direction}
        </span>
      </div>

      <h3 className={`mt-4 text-xl font-bold tracking-tight ${accent.text}`}>
        {playHeadline(play)}
      </h3>

      <p className="mt-2 text-sm font-light leading-relaxed text-body">
        <HighlightedText text={play.activation.evidence} terms={terms} />
      </p>
      <p className="mt-1 text-xs font-light tracking-wide text-muted">
        {play.activation.state} · {play.activation.grounding} ·{' '}
        {play.activation.factAt ? `fact at ${formatWallClock(play.activation.factAt)} · ` : ''}as of{' '}
        {formatWallClock(play.activation.asOf)}
        {play.activation.rulesFired.length > 0 && (
          <span className="ml-3 inline-flex flex-wrap gap-1 align-middle">
            {play.activation.rulesFired.map((rule) => (
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
      <p className="mt-2 text-xs font-light tracking-wide text-muted">
        <span className="font-bold text-body-strong">{band.label}</span> · {band.role} · {band.side}{' '}
        {formatPts(band.distancePts)} · {band.triggerStatus}
        {band.anchorSource ? ` · anchor ${band.anchorSource}` : ''} · members:{' '}
        {band.memberLabels.join(' · ')}
      </p>
      {sequence && (
        <p className="mt-3 text-xs font-light uppercase tracking-wide text-muted">
          {twoWay ? 'Legs (either, not a sequence): ' : 'Target sequence: '}
          <span className="text-body-strong">{sequence}</span>
        </p>
      )}

      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Action Point
            </th>
            <th className="py-2 pr-3 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Price
            </th>
            <th className="py-2 text-xs font-bold uppercase tracking-[1.5px] text-muted">
              Level / Description
            </th>
          </tr>
        </thead>
        <tbody>
          {actionRows(play).map((row) => (
            <tr key={row.point} className="border-b border-hairline-strong">
              <td className="py-2 pr-3 align-top text-sm font-bold text-ink">{row.point}</td>
              <td
                className={`py-2 pr-3 align-top text-sm font-bold tracking-tight ${
                  row.counter ? accent.counterText : accent.text
                }`}
              >
                {row.price}
              </td>
              <td className="py-2 text-sm font-light leading-relaxed text-body">
                <HighlightedText text={row.description} terms={terms} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {play.responseDeadline && (
        <p className="mt-3 text-xs font-light leading-relaxed text-muted">
          <span className="font-bold uppercase tracking-[1.5px]">Response deadline (R11)</span> —{' '}
          {play.responseDeadline.text}
        </p>
      )}

      <p className="mt-3 text-sm font-light leading-relaxed text-body">
        <span className="font-bold uppercase tracking-wide text-m-red">Don&apos;t</span> —{' '}
        <HighlightedText text={play.dont} terms={terms} />
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
