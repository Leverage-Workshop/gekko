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
 *   1. CRITERIA — distilled from docs/jba-research/lvn-corpus.md sections B1–B12
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

export const VISION_PROMPT_REVISION = 'vision-2026-08-22.1'

/** Which few-shot set is in knowledge/job-plan/few-shot/ — mirrors manifest.json `source`. */
export const FEW_SHOT_SOURCE =
  'lvn-fixtures stand-in (fixture-5 double distribution, fixture-3 trend-up) until feat-119/120 golden exports'

export const FEW_SHOT_DIR = 'knowledge/job-plan/few-shot'

/** One criterion: the rule, and the corpus line it is distilled from (quoted in the prompt). */
type Criterion = { readonly rule: string; readonly example: string }

export const CRITERIA: readonly Criterion[] = [
  {
    rule: 'DEPTH RANKS. The primary LVN is the deepest trough — the least volume relative to the nodes on either side — ranked WITHIN this profile only. Mark exactly one lvn primary (prominence 1).',
    example: '"this is the deepest LVN. So deepest meaning primary"',
  },
  {
    rule: 'DEPARTURE SCAR, NOT RANDOM DIP. A notable LVN is where price drove through quickly and left a thin zone behind — the initiation of a leg — not any dip inside a fat node.',
    example: '"We drove up and out of that area. We left an LVN in this area"',
  },
  {
    rule: "ADJACENT TO A HIGH-VOLUME EDGE. The notable LVN is the thin shelf immediately outside a fat node's boundary. Report the hvn-edge and the lvn next to it as two separate nodes.",
    example: '"primary LVN… right around high volume edge is 7412 to 14.5"',
  },
  {
    rule: 'WIDTH IS A QUALIFIER. A wide LVN is reported as a band spanning the whole thin zone (and listed in thinZones); a narrow one as a 2–4 point band. Never collapse a wide zone to a single price.',
    example: '"wide LVN 682 to 6806" / "nice little LVN"',
  },
  {
    rule: 'GROUP TINY STICKS. A run of tiny adjacent nodes is one mass; read the LVNs at the boundaries of the grouped mass, not between every stick.',
    example:
      '"a bunch of sticks… I\'m going to group this like this. Use this an LVN, and this is an LVN"',
  },
  {
    rule: 'EXTREMES ARE EXHAUSTIVE-NODE TERRITORY. At the top or bottom of the profile look for the anatomy: a spike, a small volume build just inside it, then an aggressive departure. Mark it exhaustive-node; a thin parabolic run into an extreme with no build is a taper-tail.',
    example:
      '"a spike up, and you get a volume build from that, traverse back across… a small build above this"; "a nice taper tail"',
  },
  {
    rule: 'HIGH-VOLUME EDGES ON BOTH SIDES. Every fat node has a boundary above and below where volume drops off a cliff; report both as hvn-edge. They are distribution boundaries, the edges to lean on.',
    example: '"high volume edge, 34s… LVN… at 34 to 32"',
  },
  {
    rule: 'HVN-CORE ONLY FOR THE PEAK. Use hvn-core only for the POC-class peak of each distribution (usually one per hump), never for every fat bar.',
    example: '"the dominant peak of each distribution"',
  },
  {
    rule: 'THIN ZONES. List up to three spans where the profile is thin across many rows (the "kennel" / wide LVN spans); these are traversed fast.',
    example:
      '"where we just absolutely slammed through, where we expanded very quickly and left a wide kennel"',
  },
  {
    rule: 'UNFINISHED. Set unfinished = true when an extreme shows neither a taper nor an exhaustive node — the build just stops.',
    example: '"unfinished build… the LVN above is an offer, not a bid"',
  },
  {
    rule: 'NEGATIVE — DO NOT PAD. Report only what is there; fewer nodes is better than invented ones. Do not mark every minor local minimum.',
    example: '"Which of several is most prominent cannot always be eyeballed"',
  },
  {
    rule: 'NEGATIVE — NO PRIMARY INSIDE THE VALUE BULK. A trough inside the value-area bulk of a fat distribution is not the primary LVN; the primary sits at a distribution edge or between distributions.',
    example: '"An LVN inside value is not an entry"',
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per criterion. */
export const CRITERIA_CANARIES = CRITERIA.map((c) => c.example)

function criteriaText(): string {
  return CRITERIA.map((c, i) => `${i + 1}. ${c.rule}\n   Corpus: ${c.example}`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- nodes: at most 8. kind is one of lvn | hvn-edge | hvn-core | exhaustive-node | taper-tail.
- priceLow / priceHigh: a band in price read off the axis; equal for a point. Snap to the row step.
- prominence: 1 (most prominent in THIS image) to 5. primary: true on exactly one lvn.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- shape: valley (trough between two nodes) | shelf-edge (thin shelf just outside a node) | wide-gap (a long thin span) | notch (a fat peak, for hvn kinds).
- rationale: at most 20 words.
- thinZones: at most 3 { low, high } spans. profileShape: bell | double | multi | trend-up | trend-down | thin. unfinished: boolean.
- Read prices from the axis labels; do not guess beyond the image's span. Ignore anything you believe about the market — this is perception only.`

const ROLE = `You are reading a volume-by-price profile image the way a professional futures trader reads it on screen: horizontal bars grow LEFT from the price axis on the right; a longer bar means more volume traded at that price. Identify the low-volume nodes (LVNs), high-volume edges, peaks, and extreme anatomy the trader would mark, using the criteria below.`

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
    profile: parseVbpProfile(readFileSync(join(dir, ex.profile), 'utf8')),
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
    "CRITERIA (each with the trader's own words from the corpus):",
    criteriaText(),
    OUTPUT_RULES,
    fewShot.length > 0 ? `WORKED EXAMPLES:\n${examples}` : '',
    `${target}\nThis is the ${ctx.profileName} over ${ctx.lookback}. Read it now and return the JSON.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')
}
