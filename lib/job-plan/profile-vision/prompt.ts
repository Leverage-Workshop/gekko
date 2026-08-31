import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import type { Instrument } from './instrument'
import type { RenderMeta, TileSpan } from './renderProfile'
import { profileNodesReadSchema, type ProfileNodesRead } from './schema'

/**
 * The vision prompt for the profile read (feat-123, docs/job-planning-task-plan.md
 * "The perception contract"). Three parts:
 *
 *   1. CRITERIA — distilled from docs/jba-research/lvn-corpus.md sections B1–B16
 *      (what makes an LVN notable / primary) and D (the negative set), each with
 *      one quoted example from the corpus. Static across calls.
 *   2. FEW-SHOT — a fixed set of example profiles with their expected JSON,
 *      loaded from knowledge/job-plan/few-shot/ (see FEW_SHOT_SOURCE). The
 *      example images are rendered at call time with the SAME RenderOptions as
 *      the profile being read, so the bake-off variants never mismatch their
 *      examples.
 *   3. PER-CALL TEXT — instrument, profile name / lookback, price span, row step,
 *      POC / VAH / VAL, current price. NO structure (no boxes, MGI, pivots):
 *      relating nodes to structure is planner math, and showing the boxes would
 *      invite the model to find LVNs where the boxes suggest.
 *
 * VISION_PROMPT_REVISION bumps whenever the criteria or the few-shot set change;
 * feat-128 persists it with every read and feat-124's bench cache keys on it.
 */

export const VISION_PROMPT_REVISION = 'vision-2026-08-31.1'

/** Which few-shot set is in knowledge/job-plan/few-shot/ — mirrors manifest.json `source`. */
export const FEW_SHOT_SOURCE =
  'golden-set replay exports (feat-119): 2026-02-13 NQ 5-day rolling (double distribution, primary LVN on the wall) and 2026-06-02 ES 5-day rolling (shelf-edge primary + exhaustive node on top)'

export const FEW_SHOT_DIR = 'knowledge/job-plan/few-shot'

/**
 * One rule the model applies when reading the profile.
 *
 * OPERATOR-AUTHORED (feat-137). These replace the 18 criteria mined from
 * docs/jba-research/lvn-corpus.md. Two problems the operator named directly:
 * the set was too long, and an audit of all 18 found only FIVE were the trader
 * speaking about which low-volume node to pick — the rest described
 * high-volume structure, extreme anatomy, or output bookkeeping, and pulled the
 * model's attention away from the question that matters.
 *
 * These are deliberately NOT corpus quotes. A vision model already knows what a
 * volume profile and a low-volume node are, so re-teaching the vocabulary spends
 * attention that should go on WHICH levels are decisive. The corpus remains the
 * evidence base for the golden labels and for the explainer
 * (docs/jba-research/lvn-criteria-explained.md); it is no longer the source of
 * the prompt, and the section-A sourcing test is retired with it.
 */
type Rule = { readonly title: string; readonly text: string }

/**
 * Why any of these levels matter, stated FIRST and as a mechanism rather than a
 * checklist — a mechanism lets the model reason about profiles nobody
 * enumerated, which a list of shapes cannot.
 */
export const MECHANISM =
  'A volume profile shows where participants traded. What you are looking for is the price at which that participation dried up. Those levels matter because the participants who traded the volume beside them have to defend them: if price leaves, there is little volume to slow it down, so it can travel a long way before finding any, and they take a loss. Every rule below follows from that.'

export const CRITERIA: readonly Rule[] = [
  {
    title: 'PROMINENCE IS THE SIZE OF THE DROP',
    text: 'Rank a low-volume node by how large a change in volume it represents, not by how thin it looks on its own. The most prominent ones sit against the most prominent distributions: a trough beside a very large build outranks a thinner trough beside a small one, because far more participation ended there.',
  },
  {
    title: 'A DISTRIBUTION GIVES WAY IN ONE OF TWO WAYS',
    text: 'A LEDGE is significant volume that drops off very quickly — a cliff. A TAPER is a distribution thinning gradually into the low-volume area. Both are edges of a low-volume node, and both occur anywhere in the profile, not only at the top and bottom.',
  },
  {
    title: 'WHAT LIES BEYOND THE NODE LOCATES IT, IT DOES NOT RANK IT',
    text: 'Past a low-volume node you will find either a flat, low-volume stretch or the start of a new distribution. Use that to find the node and to set its far bound. Neither changes how prominent the node is.',
  },
  {
    title: 'HIGH-VOLUME NODES ARE THE PEAKS OF LARGE DISTRIBUTIONS',
    text: 'Report the peak of each significant distribution — not every fat bar.',
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per rule. */
export const CRITERIA_CANARIES = CRITERIA.map((c) => c.title)

function criteriaText(): string {
  return CRITERIA.map((c, i) => `${i + 1}. ${c.title}. ${c.text}`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- Report only the DECISIVE levels: the most prominent low-volume node, the next two or three, and the peak of each significant distribution. Three to five nodes is normal. The schema caps you at 8; that is a ceiling, never a target, and padding the list makes the read worse.
- kind: lvn (a low-volume node) | hvn-core (the peak of a distribution) | hvn-edge (where a distribution gives way to a low-volume node) | exhaustive-node | taper-tail.
- shape: ledge (volume drops off a cliff) | taper (a distribution thinning gradually) | valley (a trough between two nodes) | shelf-edge (a thin shelf just outside a node) | wide-gap (a long thin span) | notch (a fat peak).
- priceLow / priceHigh: a band in price read off the axis; equal for a point. Snap to the row step, and report the span you can actually see — never pad a narrow node or collapse a wide one to a single price.
- prominence: 1 (largest drop in volume in THIS image) to 5 (weakest worth keeping), on ONE scale across all kinds — the planner ranks nodes against each other regardless of kind. Ties are allowed.
- primary: when you report any lvn, exactly one carries true — the one with the largest drop. When the image shows no lvn at all, every node is false.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- rationale: at most 20 words, describing only what is visible.
- thinZones: at most 3 { low, high } spans that are thin across many rows. profileShape: bell | double | multi | trend-up | trend-down | thin. unfinished: true when a distribution simply stops at an extreme instead of tapering out.
- Read prices from the axis labels; do not guess beyond the image's span. Ignore anything you believe about the market — this is perception only.`

const ROLE = `You are reading a volume-by-price profile image the way a professional futures trader reads it on screen: horizontal bars grow LEFT from the price axis on the right; a longer bar means more volume traded at that price. You know what a volume profile is — the job here is to pick out the few levels that are decisive, and the rules below say which ones those are.`

/** A loaded few-shot example: the parsed profile plus its expected read. */
export type FewShotExample = {
  readonly id: string
  readonly instrument: Instrument
  readonly profile: VbpProfile
  readonly expected: ProfileNodesRead
}

const manifestSchema = z.object({
  source: z.string().min(1),
  examples: z
    .array(
      z.object({
        id: z.string().min(1),
        instrument: z.enum(['NQ', 'ES']),
        profile: z.string().min(1),
        expected: z.string().min(1),
      })
    )
    .min(1)
    .max(3),
})

/**
 * Load the few-shot set from disk. Throws on a malformed manifest or an
 * expected read that fails the schema — a packaging error, not a runtime one.
 */
export function loadFewShot(baseDir: string = process.cwd()): FewShotExample[] {
  const dir = join(baseDir, FEW_SHOT_DIR)
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  )
  return manifest.examples.map((ex) => ({
    id: ex.id,
    instrument: ex.instrument,
    profile: parseVbpProfile(readFileSync(join(dir, ex.profile), 'utf8'), {
      fillMissingRows: true,
    }),
    expected: profileNodesReadSchema.parse(
      JSON.parse(readFileSync(join(dir, ex.expected), 'utf8'))
    ),
  }))
}

/** Per-call facts for the profile being read. Deliberately carries NO structure. */
export type ProfileCallContext = {
  readonly instrument: Instrument
  readonly profileName: string
  readonly lookback: string
  readonly meta: RenderMeta
  readonly tile: TileSpan
}

function price2(n: number): string {
  return n.toFixed(2)
}

function describeImage(
  label: string,
  instrument: Instrument,
  meta: RenderMeta,
  tile: TileSpan
): string {
  const tileNote =
    tile.of > 1
      ? ` This is tile ${tile.index + 1} of ${tile.of}; the full profile spans ${price2(meta.priceLow)}–${price2(meta.priceHigh)} and the tiles overlap.`
      : ''
  const current =
    meta.currentPrice === null
      ? 'not shown'
      : `${price2(meta.currentPrice)} (orange line if inside the image)`
  return (
    `${label}: ${instrument}, row step ${meta.step} pts, image spans ${price2(tile.priceLow)}–${price2(tile.priceHigh)}.` +
    ` POC ${price2(meta.poc)} (solid line), VAH ${price2(meta.vah)} / VAL ${price2(meta.val)} (dashed, value area shaded), current price ${current}.` +
    tileNote
  )
}

/**
 * Build the per-call prompt text. Images are attached in this order: the
 * few-shot examples first (one each, rendered with the same options), then the
 * profile to read — the text refers to them by that order.
 */
export function buildVisionPrompt(
  ctx: ProfileCallContext,
  fewShot: readonly { example: FewShotExample; meta: RenderMeta; tile: TileSpan }[]
): string {
  const examples = fewShot
    .map(
      (f, i) =>
        `${describeImage(`Example ${i + 1} (image ${i + 1})`, f.example.instrument, f.meta, f.tile)}\n` +
        `Expected JSON for example ${i + 1}:\n${JSON.stringify(f.example.expected)}`
    )
    .join('\n\n')
  const target = describeImage(
    `Profile to read (image ${fewShot.length + 1})`,
    ctx.instrument,
    ctx.meta,
    ctx.tile
  )
  return [
    ROLE,
    MECHANISM,
    'RULES:',
    criteriaText(),
    OUTPUT_RULES,
    fewShot.length > 0 ? `WORKED EXAMPLES:\n${examples}` : '',
    `${target}\nThis is the ${ctx.profileName} over ${ctx.lookback}. Read it now and return the JSON.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')
}
