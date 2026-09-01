import { JobPlanSchema, type DestinationStage, type GeometryRefs, type JobPlan, type PlanFrame, type PlanMeta, type PlayBand, type PrunedBranch } from '@/knowledge/schema/job-plan.schema'
import type { EnclosingZone, JobContext, Reference } from './contextTypes'
import { planFrame } from './planFrame'
import { rankPlays } from './planPrecedence'
import type { PlayDraft } from './planTypes'
import { selectCandidates } from './playCandidates'
import { buildBandPlay } from './playGrammar'
import { fmtPrice, fmtRange, membersAtPrice, referenceProvenance } from './playText'
import { PLANNER_REVISION } from './rules'

/**
 * `buildPlan` (feat-127; grammar rebuilt 2026-08-31 to the operator's
 * forward-conditional correction): play generation + the precedence table
 * over feat-126's `JobContext` → `JobPlan`. Pure and deterministic — same
 * context + revision ⇒ deep-equal output; no clock, no I/O, no LLM.
 *
 *   1. Sufficiency: an `insufficient` data quality (R13) or missing CORE
 *      geometry (current daily + weekly pivot, at least one band, a price)
 *      → `status: 'insufficient'`, zero plays, reasons spelled out.
 *   2. The FRAME (planFrame.ts): price vs the nearer of the G line and the
 *      weekly Job Pivot names the productive side.
 *   3. R12 actionable set (playCandidates.ts).
 *   4. One forward-conditional play per candidate — the expected response on
 *      arrival with both outcomes stated (playGrammar.ts); a mid-zone
 *      context (R10) adds the two-way stand-down play.
 *   5. The precedence table ranks by frame alignment + structure, caps at
 *      four and names the primary look (planPrecedence.ts). Whatever is
 *      pruned says why.
 *
 * Every play price traces to the inventory (`geometryRefs`) or is a labeled
 * derivation; the schema parse at the end is the contract's boundary check.
 */

export type PlanMetaInput = {
  readonly bundleId?: string | null
  readonly inputFingerprint?: string | null
  readonly sourceHashes?: Partial<PlanMeta['sourceHashes']>
  readonly visionPromptRevision?: string | null
  readonly visionModelId?: string | null
  /** Overrides {@link PLANNER_REVISION} — the LLM assembler stamps its combined revision (feat-145). */
  readonly plannerRevision?: string
  readonly jobPlanner?: PlanMeta['jobPlanner']
  readonly llmModelId?: string | null
  readonly llmPromptRevision?: string | null
}

export type BuildPlanInput = {
  readonly context: JobContext
  readonly meta?: PlanMetaInput
}

const EMPTY_HASHES: PlanMeta['sourceHashes'] = {
  jobStudyDaily: null,
  jobStudyWeekly: null,
  mgi: null,
  execBars: null,
  htfBars: null,
  balanceAreaProfile: null,
  rotationProfile: null,
}

/** Only the seven known per-source hashes are carried — an unknown key never reaches the plan. */
function sourceHashes(meta: PlanMetaInput): PlanMeta['sourceHashes'] {
  const given = meta.sourceHashes ?? {}
  return Object.fromEntries(
    (Object.keys(EMPTY_HASHES) as Array<keyof PlanMeta['sourceHashes']>).map((key) => [key, given[key] ?? null]),
  ) as PlanMeta['sourceHashes']
}

export function planMeta(context: JobContext, meta: PlanMetaInput): PlanMeta {
  return {
    plannerRevision: meta.plannerRevision ?? PLANNER_REVISION,
    asOf: context.asOf,
    instrument: context.instrument,
    symbol: context.symbol,
    tradingDay: context.dataQuality.tradingDay.study,
    bundleId: meta.bundleId ?? null,
    inputFingerprint: meta.inputFingerprint ?? null,
    sourceHashes: sourceHashes(meta),
    visionPromptRevision: meta.visionPromptRevision ?? null,
    visionModelId: meta.visionModelId ?? null,
    ...(meta.jobPlanner === undefined
      ? {}
      : {
          jobPlanner: meta.jobPlanner,
          llmModelId: meta.llmModelId ?? null,
          llmPromptRevision: meta.llmPromptRevision ?? null,
        }),
  }
}

export function geometryRefs(context: JobContext): GeometryRefs {
  return {
    price: context.price.value,
    references: context.references.map((r) => ({
      id: r.id,
      label: r.label,
      source: r.source,
      price: r.price,
      priceLow: r.priceLow,
      priceHigh: r.priceHigh,
      destinationOnly: r.destinationOnly,
    })),
    bands: context.bands.map((b) => ({ id: b.id, low: b.low, high: b.high, anchorId: b.anchorId, memberIds: b.members.map((m) => m.id) })),
  }
}

/** Why the context cannot yield a `ready` plan, or an empty list. */
export function insufficiencyReasons(context: JobContext): string[] {
  const reasons = context.dataQuality.issues.filter((i) => i.severity === 'insufficient').map((i) => `${i.code}: ${i.message}`)
  const sources = new Set(context.references.map((r) => r.source))
  if (!sources.has('daily-job-pivot')) reasons.push('core geometry missing: no current daily Job Pivot in the inventory')
  if (!sources.has('weekly-job-pivot')) reasons.push('core geometry missing: no weekly Job Pivot in the inventory')
  if (context.bands.length === 0) reasons.push('core geometry missing: no confluence bands to plan from')
  if (!Number.isFinite(context.price.value) || context.price.value <= 0) reasons.push('core geometry missing: no current price')
  return reasons
}

type ZoneEdge = EnclosingZone['lowerEdge']

/** An enclosing-zone edge always comes from the inventory (a JBA edge or a band member); anything else is a broken context. */
function edgeMembers(context: JobContext, edge: ZoneEdge): Reference[] {
  const members = membersAtPrice(context, edge.price, edge.bandId)
  if (members.length === 0) throw new Error(`buildPlan: enclosing zone edge ${edge.label} ${edge.price} is not in the reference inventory`)
  return members
}

function zoneStage(edge: ZoneEdge, order: number, expect: 'rebid' | 'reoffer', context: JobContext): DestinationStage {
  const members = edgeMembers(context, edge)
  return {
    order,
    bandId: edge.bandId,
    label: edge.label,
    low: edge.price,
    high: edge.price,
    expect,
    beeline: null,
    text: `${edge.label} ${fmtPrice(edge.price)}: play the edge — expect the ${expect} on arrival; a look beyond and fail is the rotation back`,
    provenance: referenceProvenance(members),
  }
}

function zoneBand(zone: EnclosingZone, context: JobContext): PlayBand {
  const members = [...edgeMembers(context, zone.lowerEdge), ...edgeMembers(context, zone.upperEdge)]
  return {
    bandId: null,
    label: `${zone.lowerEdge.label} ${fmtPrice(zone.lowerEdge.price)} – ${zone.upperEdge.label} ${fmtPrice(zone.upperEdge.price)}`,
    low: zone.lowerEdge.price,
    high: zone.upperEdge.price,
    anchorSource: null,
    memberLabels: [zone.lowerEdge.label, zone.upperEdge.label],
    role: 'enclosing-zone',
    side: 'inside',
    distancePts: 0,
    triggerStatus: 'fresh',
    provenance: referenceProvenance(members),
  }
}

/** The mid-zone (R10) two-way declaration: stand down in the middle, play the named edges. */
export function zoneDraft(zone: EnclosingZone, context: JobContext): PlayDraft {
  const band = zoneBand(zone, context)
  return {
    stance: 'stand-down',
    direction: 'two-way',
    condition: 'mid-zone-two-way',
    band,
    trigger: `Inside ${band.label}, ${fmtPrice(zone.fromLowerPts)} / ${fmtPrice(zone.fromUpperPts)} pts from the edges (> ${fmtPrice(zone.midZoneLimitPts)}, R10) → two-way trade between the named edges; stand down in the middle`,
    activation: {
      state: 'armed',
      grounding: 'mid-zone',
      evidence: `Price ${fmtPrice(context.price.value)} is ${fmtPrice(zone.fromLowerPts)} pts above ${zone.lowerEdge.label} and ${fmtPrice(zone.fromUpperPts)} pts below ${zone.upperEdge.label} — more than ${fmtPrice(zone.midZoneLimitPts)} from both (R10 purgatory)`,
      factAt: null,
      asOf: context.asOf,
      rulesFired: ['R10', 'R12'],
      demoted: false,
    },
    invalidation: {
      low: zone.lowerEdge.price,
      high: zone.upperEdge.price,
      side: 'either',
      condition: `Acceptance beyond either edge (R6) ends the two-way trade — then trade the break, not the middle`,
      thenSeek: null,
      provenance: band.provenance,
    },
    destinations: [zoneStage(zone.lowerEdge, 1, 'rebid', context), zoneStage(zone.upperEdge, 2, 'reoffer', context)],
    responseDeadline: null,
    dont: "Don't trade full size in the middle — nobody wants to be full size in the middle; wait for the edges",
    uncertaintyBand: null,
    summary: `Stay inside ${fmtRange(zone.lowerEdge.price, zone.upperEdge.price)} (${zone.lowerEdge.label} – ${zone.upperEdge.label}) → balance; play the edges, stand down in the middle`,
    precedence: { tier: 0, aligned: true, enclosingEdge: false, significance: -1, distancePts: 0, bandKey: 'zone' },
  }
}

function draftPlays(context: JobContext, frame: PlanFrame | null): { drafts: PlayDraft[]; pruned: PrunedBranch[] } {
  const selection = selectCandidates(context)
  const drafts: PlayDraft[] = []
  const pruned: PrunedBranch[] = [...selection.pruned]
  for (const candidate of selection.candidates) {
    const result = buildBandPlay(candidate, context, frame)
    if ('draft' in result) drafts.push(result.draft)
    else pruned.push({ bandId: candidate.band.id, label: `${candidate.band.members[0].label} ${fmtRange(candidate.band.low, candidate.band.high)}`, reason: result.pruned })
  }
  const zone = context.location.enclosingZone
  if (zone !== null && zone.midZone) drafts.push(zoneDraft(zone, context))
  return { drafts, pruned }
}

function insufficientPlan(context: JobContext, meta: PlanMetaInput, reasons: readonly string[]): JobPlan {
  return {
    meta: planMeta(context, meta),
    geometryRefs: geometryRefs(context),
    context,
    frame: null,
    lean: { playId: null, basis: 'none', text: 'Insufficient input — no plan (fail closed)' },
    plays: [],
    pruned: [],
    standDownReasons: [...reasons],
    warnings: [...context.warnings],
    status: 'insufficient',
  }
}

export function buildPlan(input: BuildPlanInput): JobPlan {
  const { context } = input
  const meta = input.meta ?? {}
  const reasons = insufficiencyReasons(context)
  if (reasons.length > 0) {
    const plan = insufficientPlan(context, meta, reasons)
    JobPlanSchema.parse(plan)
    return plan
  }

  const frame = planFrame(context)
  const { drafts, pruned } = draftPlays(context, frame)
  const ranked = rankPlays(drafts, frame)
  const standDown = ranked.plays.filter((p) => p.stance === 'stand-down').map((p) => p.activation.evidence)
  const plan: JobPlan = {
    meta: planMeta(context, meta),
    geometryRefs: geometryRefs(context),
    context,
    frame,
    lean: ranked.lean,
    plays: [...ranked.plays],
    pruned: [...pruned, ...ranked.pruned],
    standDownReasons: ranked.plays.length === 0 ? ['no playable band in the actionable set — nothing to watch; destinations only'] : standDown,
    warnings: [...context.warnings],
    status: 'ready',
  }
  JobPlanSchema.parse(plan)
  return plan
}
