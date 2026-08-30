import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import type { Instrument } from './instrument'
import type { RenderMeta, TileSpan } from './renderProfile'
import { priceToFraction } from './normalized'
import {
  profileNodesReadNormalizedSchema,
  profileNodesReadSchema,
  type ProfileNodesRead,
  type ProfileNodesReadNormalized,
} from './schema'

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
 *
 * feat-135 adds an AXIS-FREE MODE, selected by `meta.axis === false` (the
 * `axis-free` render variant). The image then has no price axis and no digits
 * at all, so the OUTPUT RULES ask for `yLow`/`yHigh` — normalized vertical
 * positions, 0 = bottom edge, 1 = top — instead of prices, the per-call text
 * gives POC / VAH / VAL / current as fractions ALONGSIDE their prices as
 * calibration anchors, and the few-shot examples ship their expected JSON in
 * the same normalized form. Everything else (role, criteria, image order) is
 * shared: one builder, two modes, so the two arms of the A/B differ only where
 * they must.
 */

export const VISION_PROMPT_REVISION = 'vision-2026-08-30.8'

/** Which few-shot set is in knowledge/job-plan/few-shot/ — mirrors manifest.json `source`. */
export const FEW_SHOT_SOURCE =
  'golden-set replay exports (feat-119): 2026-02-13 NQ 5-day rolling (double distribution, primary LVN on the wall) and 2026-06-02 ES 5-day rolling (shelf-edge primary + exhaustive node on top)'

export const FEW_SHOT_DIR = 'knowledge/job-plan/few-shot'

/**
 * One criterion: the rule, the corpus section(s) it distils, and a VERBATIM
 * line from docs/jba-research/lvn-corpus.md (the prompt test checks every
 * `example` is a substring of that file, so a quote can never drift from the
 * source).
 *
 * Coverage of the corpus: B1, B2, B3, B4, B6, B7, B8, B11, B12, B13, B14, B15,
 * B16 and D3, D7, D10, D11 are perception criteria and live here. B13-B16 come
 * from reference/volume_profile_101.txt (corpus section A4, added 2026-08-30):
 * how to SPOT the primary, the secondary class, distributions-between-primaries,
 * and the taper / ledge / exhaustive discrimination at an extreme. B5 (position vs the JBA
 * boxes), B9 (lookback by purpose), B10 (tolerance scales with lookback) and
 * D1, D2, D4, D5, D6, D8, D9, D12 concern trade selection against structure
 * and are planner / consensus rules by the perception contract — the image
 * carries no structure, so the model cannot and must not apply them.
 */
type Criterion = { readonly rule: string; readonly corpus: string; readonly example: string }

export const CRITERIA: readonly Criterion[] = [
  {
    rule: 'DEPTH RANKS. Rank LVN candidates by depth — the least volume relative to the nodes on either side — WITHIN this profile only, and mark one lvn primary (prominence 1). Depth decides the ranking, with ONE exception, stated in full in the next two criteria: where the thin region is a wide span rather than a narrow notch, the primary is the span edge against the fat node and the deepest point inside the span is the secondary. Apply that exception when it fits; otherwise the deepest candidate is primary.',
    corpus: 'B1, B2',
    example: 'this is the deepest LVN. So deepest meaning primary',
  },
  {
    rule:
      'FIND IT BY BAR TIP, ACROSS THE WHOLE IMAGE. Bars grow left from the price axis, so the primary is the lvn whose bars stay NEAREST the axis — compare tip lengths against every trough in the image, not just its two neighbours. ' +
      'When the thin region is a WIDE SPAN rather than a narrow notch, the primary anchors at the span EDGE against the fat node and the deepest point inside the span is the secondary. Compare INTERNAL troughs only — the profile thins to nothing at both extremes by construction, and a completed taper or exhaustive tail never competes for primary.',
    corpus: 'B13',
    example:
      'the easiest way to spot a primary LVN is just look all the way to the right and see which ones are closest',
  },
  {
    rule: 'SECONDARY LVNs ARE DEMOTED, NOT DROPPED. A shallower trough sitting INSIDE a distribution is a secondary lvn: still report it, with prominence 3-5 and primary false. It gives a first response but gets filled; it never competes for primary.',
    corpus: 'B13, B14',
    example:
      "that's a secondary LVN and although it can offer an initial uh response that it's more likely to be filled",
  },
  {
    rule: 'DISTRIBUTIONS ARE THE ZONES BETWEEN PRIMARY LVNs. Count the humps first: one = bell, two = double, three or more = multi (trend-up / trend-down when the mass climbs or falls across the image, thin when there is no real hump). Set profileShape by this ladder, first match wins: no hump dominates at all = thin; two humps = double; three or more = multi; ONE hump that sits at an end and thins steadily toward the other = trend-up (mass high) or trend-down (mass low); one hump otherwise = bell. Put the primary lvn on a wall BETWEEN humps, never inside one.',
    corpus: 'B14, B15',
    example:
      "here's a primary obn right there and one right here so between the two we have a distribution of volume",
  },
  {
    rule: 'EXTREME ANATOMY: TAPER vs LEDGE vs EXHAUSTIVE. A taper falls off PROGRESSIVELY away from a fat node (parabolic or a straight 45-degree ramp) — that is taper-tail, and the extreme is finished. A LEDGE is a stack of near-EQUAL-length bars where the build just stops — report it as kind hvn-edge with shape ledge and unfinished = true, never as a taper-tail: it is the boundary of a build that stopped, and the line in the sand once price traverses it. An exhaustive node is a spike, a small build, then an immediate step off.',
    corpus: 'B16, B7',
    example:
      'we have a volume build and then we basically have a flat line let it smack you in the face',
  },
  {
    rule: 'DEPARTURE SCAR, NOT RANDOM DIP. A notable LVN is where price drove through quickly and left a thin zone behind — the initiation of a leg — not any dip inside a fat node.',
    corpus: 'B3',
    example: 'We drove up and out of that area. We left an LVN in this area',
  },
  {
    rule: "ADJACENT TO A HIGH-VOLUME EDGE. The notable LVN is the thin shelf immediately outside a fat node's boundary. Report the hvn-edge and the lvn next to it as two separate nodes.",
    corpus: 'B4',
    example:
      'primary LVN between the uh well right around high volume edge is 7412 to like 14 5 area through here',
  },
  {
    rule: 'WIDTH IS A QUALIFIER, NOT A DISQUALIFIER. Report the band you can actually see: a wide LVN spans the whole thin zone (and goes in thinZones), a narrow one is however few points it is. Read the bounds off the axis at the stated row step and impose no fixed width — the corpus runs from 4-point calls to 186-point kennels. Never collapse a wide zone to a single price, and never pad a narrow one.',
    corpus: 'B6, D7',
    example: 'wide LVN 682 to 6806',
  },
  {
    rule: 'GROUP TINY STICKS. A run of tiny adjacent nodes is one mass; read the LVNs at the boundaries of the grouped mass, not between every stick.',
    corpus: 'B11',
    example:
      "these HPNs that are tiny. And then up here, we have a defined node. Therefore, I'm going to group this like this. Use this an LVN, and this is an LVN",
  },
  {
    rule: 'EXTREMES ARE EXHAUSTIVE-NODE TERRITORY. At the top or bottom of the profile look for the anatomy: a spike, a small volume build just inside it, then an aggressive departure. Mark it exhaustive-node; a thin parabolic run into an extreme with no build is a taper-tail.',
    corpus: 'B7',
    example: 'you get a spike up, and you get a volume build from that, traverse back across',
  },
  {
    rule: 'HIGH-VOLUME EDGES. A fat node has a boundary where volume drops off a cliff — report that as hvn-edge; it is the distribution boundary, the edge to lean on. Report the edges that are clearly visible, NOT two for every node: an extreme that tapers or exhausts already carries its outer boundary.',
    corpus: 'B4, B12',
    example: 'there are two locations here that are pretty clean. One is high volume edge, 34s',
  },
  {
    rule: 'HVN-CORE ONLY FOR THE PEAK. Use hvn-core only for the POC-class peak of each distribution (usually one per hump), never for every fat bar.',
    corpus: 'B8, B12',
    example: 'the high volume uh node of that distribution is right here in the low 80s',
  },
  {
    rule: 'SEMANTICS. An LVN is where a move initiates and accelerates; a high-volume node is where it is destined to stop. Read the profile as a map of initiation and destination, not as a list of bumps.',
    corpus: 'B12',
    example: 'Areas of initiation on the volume profile are low volume nodes',
  },
  {
    rule: 'THIN ZONES. List up to three spans where the profile is thin across many rows (the "kennel" / wide LVN spans); these are traversed fast.',
    corpus: 'B3, B6',
    example:
      'where we just absolutely slammed through, where we expanded very quickly and left a wide kennel',
  },
  {
    rule: 'UNFINISHED. Set unfinished = true when an extreme shows neither a taper nor an exhaustive node — the build just stops on a flat ledge. It should be obvious at a glance, not something you squint for.',
    corpus: 'B7, B8, B16',
    example: "it's not finished it's not finished",
  },
  {
    rule: 'SMALL HVN UNDER AN LVN. A little high-volume node sitting just under a notable LVN is reported as a low-prominence hvn-edge, never as a core — it is a warning the trader watches, not a base.',
    corpus: 'D11',
    example: 'we have a little high volume node. If we spend too much time there',
  },
  {
    rule: 'NEGATIVE — DO NOT PAD. Report only what is there; fewer nodes is better than invented ones. Do not mark every minor local minimum.',
    corpus: 'D10',
    example:
      "if you want to tag that as saying which one is the most prominent, then you're gonna have to do some work on your back end",
  },
  {
    rule: 'NEGATIVE — NO PRIMARY INSIDE THE VALUE BULK. A trough inside the value-area bulk of a fat distribution is not the primary LVN; the primary sits at a distribution edge or between distributions.',
    corpus: 'B8, D3',
    example:
      "not looking to just dive in like a dragon with a hemorrhoid at that LVN because we're back inside of value.",
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per criterion. */
export const CRITERIA_CANARIES = CRITERIA.map((c) => c.example)

function criteriaText(): string {
  return CRITERIA.map((c, i) => `${i + 1}. ${c.rule}\n   Corpus: "${c.example}"`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- nodes: at most 8 — a ceiling, not a quota, and fewer is better. When more than 8 are visible keep them in this order: the primary lvn, clear extreme anatomy, secondary lvns, the dominant hvn-core of each distribution, then the most significant hvn-edges. kind is one of lvn | hvn-edge | hvn-core | exhaustive-node | taper-tail.
- priceLow / priceHigh: a band in price read off the axis; equal for a point. Snap to the row step.
- prominence: 1 (most structurally important in THIS image) to 5 (weakest worth keeping), on ONE scale across all kinds — the planner ranks nodes against each other regardless of kind. TIES ARE ALLOWED: a dominant peak and the primary lvn may both be 1. A secondary lvn gets 3-5.
- primary: when you report any lvn, exactly one carries true; when the image shows no lvn at all, every node is false.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- shape: valley (trough between two nodes) | shelf-edge (thin shelf just outside a node) | wide-gap (a long thin span) | ledge (a stack of near-equal bars where the build stops) | ledge (a stack of near-equal bars where the build stops) | notch (a fat peak — hvn-core, and the build of an exhaustive-node).
- rationale: at most 20 words.
- thinZones: at most 3 { low, high } spans. profileShape: bell | double | multi | trend-up | trend-down | thin. unfinished: boolean.
- Read prices from the axis labels; do not guess beyond the image's span. Ignore anything you believe about the market — this is perception only.`

/**
 * Axis-free OUTPUT RULES (feat-135). Same rules, different way of saying WHERE:
 * this image has no axis and no digits, so a band is a normalized vertical
 * position and code turns it into price afterwards. The two blocks are kept
 * side by side rather than string-patched so a reader can diff them.
 */
const OUTPUT_RULES_AXIS_FREE = `Output JSON only, matching the schema. Rules:
- nodes: at most 8 — a ceiling, not a quota, and fewer is better. When more than 8 are visible keep them in this order: the primary lvn, clear extreme anatomy, secondary lvns, the dominant hvn-core of each distribution, then the most significant hvn-edges. kind is one of lvn | hvn-edge | hvn-core | exhaustive-node | taper-tail.
- yLow / yHigh: WHERE the band sits vertically, as a fraction of the PROFILE — 0.000 is the bottom of the LOWEST bar, 1.000 is the top of the HIGHEST bar, and the narrow blank margins above and below the bars are outside that scale. yLow is the band's lower edge, yHigh its upper edge; equal for a point. Give three decimals. NEVER output a price: this image has no price axis, and code converts your fractions to prices from the span stated below.
- prominence: 1 (most structurally important in THIS image) to 5 (weakest worth keeping), on ONE scale across all kinds — the planner ranks nodes against each other regardless of kind. TIES ARE ALLOWED: a dominant peak and the primary lvn may both be 1. A secondary lvn gets 3-5.
- primary: when you report any lvn, exactly one carries true; when the image shows no lvn at all, every node is false.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- shape: valley (trough between two nodes) | shelf-edge (thin shelf just outside a node) | wide-gap (a long thin span) | ledge (a stack of near-equal bars where the build stops) | notch (a fat peak — hvn-core, and the build of an exhaustive-node).
- rationale: at most 20 words.
- thinZones: at most 3 { yLow, yHigh } spans, as fractions on the same 0-1 scale. profileShape: bell | double | multi | trend-up | trend-down | thin. unfinished: boolean.
- Ignore anything you believe about the market — this is perception only.`

/**
 * Overrides the two criteria that speak of the price axis, so an axis-free call
 * is never asked to do something the image cannot support. Placed AFTER the
 * criteria and before the output rules, where a later instruction wins.
 */
const AXIS_FREE_NOTE = `THIS IMAGE HAS NO PRICE AXIS. Two consequences for the criteria above:
- Where a criterion says "nearest the axis", read it as nearest the RIGHT EDGE of the image: the bars still grow leftward from there, and the primary lvn is still the one whose bar tips stay closest to that edge.
- Where a criterion says to read bounds off the axis, give the band as a vertical FRACTION of the image instead (see the output rules). The width rule is unchanged: report the band you can actually see, never collapsing a wide zone to a point nor padding a narrow one.
The horizontal lines that remain — POC, VAH, VAL and the current price — are your only scale anchors. Their fractions are stated with the image; use them to check that your own numbers are on the same scale (e.g. a node you place just under the POC line must have a y just under the POC's y).`

const ROLE = `You are reading a volume-by-price profile image the way a professional futures trader reads it on screen: horizontal bars grow LEFT from the price axis on the right; a longer bar means more volume traded at that price. Identify the low-volume nodes (LVNs), high-volume edges, peaks, and extreme anatomy the trader would mark, using the criteria below.`

const ROLE_AXIS_FREE = `You are reading a volume-by-price profile image the way a professional futures trader reads it on screen: horizontal bars grow LEFT from the right-hand edge; a longer bar means more volume traded at that price. This image carries NO price axis and no numbers — you are not asked to read a price, only to say WHERE things are. Identify the low-volume nodes (LVNs), high-volume edges, peaks, and extreme anatomy the trader would mark, using the criteria below.`

/**
 * A loaded few-shot example: the parsed profile plus its expected read in BOTH
 * forms. `expectedNormalized` is the axis-free equivalent of `expected`, derived
 * mechanically from it (`scripts/few-shot-normalize.ts`, checked by
 * prompt.test.ts) so the two example sets can never disagree about the answer.
 */
export type FewShotExample = {
  readonly id: string
  readonly instrument: Instrument
  readonly profile: VbpProfile
  readonly expected: ProfileNodesRead
  readonly expectedNormalized: ProfileNodesReadNormalized
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
        /** Axis-free (feat-135) expected read; same answer, positioned by fraction. */
        expectedNormalized: z.string().min(1),
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
    expectedNormalized: profileNodesReadNormalizedSchema.parse(
      JSON.parse(readFileSync(join(dir, ex.expectedNormalized), 'utf8'))
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

function frac2(n: number): string {
  return n.toFixed(3)
}

/**
 * One marker as the axis-free text states it: its price AND its fraction, so
 * the model can check its own scale against a line it can see. A POC / VAH /
 * VAL outside this tile's span is not drawn at all, and saying so is better
 * than quoting a fraction clamped to an edge the line is not on.
 */
function markerPhrase(tag: string, price: number, tile: TileSpan): string {
  if (price < tile.priceLow || price > tile.priceHigh)
    return `${tag} ${price2(price)} (no line for it in this image)`
  return `${tag} ${price2(price)} at y=${frac2(priceToFraction(tile, price))}`
}

/**
 * The current price is the one marker the renderer still LABELS when it falls
 * outside the span — pinned to the nearest plot edge, so the image and the text
 * would contradict each other if this said "not in this image". Say where the
 * label actually is, and that it is not a scale anchor.
 */
function currentPhrase(current: number | null, tile: TileSpan): string {
  if (current === null) return 'current price not shown'
  if (current > tile.priceHigh)
    return `current price ${price2(current)} is ABOVE this image; its orange label is pinned to the top edge and is not a scale anchor`
  if (current < tile.priceLow)
    return `current price ${price2(current)} is BELOW this image; its orange label is pinned to the bottom edge and is not a scale anchor`
  return `current price ${price2(current)} at y=${frac2(priceToFraction(tile, current))} (orange line)`
}

function describeImageAxisFree(
  label: string,
  instrument: Instrument,
  meta: RenderMeta,
  tile: TileSpan
): string {
  const tileNote =
    tile.of > 1
      ? ` This is tile ${tile.index + 1} of ${tile.of}; the full profile spans ${price2(meta.priceLow)}–${price2(meta.priceHigh)} and the tiles overlap.`
      : ''
  return (
    `${label}: ${instrument}, row step ${meta.step} pts. The image has NO price axis.` +
    // The bars fill the plot area, which is inset from the image by a small
    // blank margin top and bottom. Anchoring the scale to the BARS rather than
    // to the image edges keeps the model's fractions on the same scale the
    // conversion uses; anchoring them to the image would bias every read toward
    // the middle by the margin (about 3 % of the height at the default size,
    // which is more than the NQ match tolerance on a wide profile).
    ` Vertical scale: y=0.000 is the BOTTOM of the lowest bar (${price2(tile.priceLow)}) and y=1.000 is the TOP of the highest bar (${price2(tile.priceHigh)}), linear in between.` +
    ` The narrow blank margins above and below the bars are outside that scale.` +
    ` Scale anchors: ${markerPhrase('POC', meta.poc, tile)} (solid line),` +
    ` ${markerPhrase('VAH', meta.vah, tile)} / ${markerPhrase('VAL', meta.val, tile)} (dashed, value area shaded), ${currentPhrase(meta.currentPrice, tile)}.` +
    tileNote
  )
}

function describeImage(
  label: string,
  instrument: Instrument,
  meta: RenderMeta,
  tile: TileSpan
): string {
  if (!meta.axis) return describeImageAxisFree(label, instrument, meta, tile)
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
  // The render variant decides the mode; the few-shot images are rendered with
  // the SAME options, so their expected JSON is quoted in the matching form.
  const axisFree = !ctx.meta.axis
  const examples = fewShot
    .map(
      (f, i) =>
        `${describeImage(`Example ${i + 1} (image ${i + 1})`, f.example.instrument, f.meta, f.tile)}\n` +
        `Expected JSON for example ${i + 1}:\n` +
        JSON.stringify(axisFree ? f.example.expectedNormalized : f.example.expected)
    )
    .join('\n\n')
  const target = describeImage(
    `Profile to read (image ${fewShot.length + 1})`,
    ctx.instrument,
    ctx.meta,
    ctx.tile
  )
  return [
    axisFree ? ROLE_AXIS_FREE : ROLE,
    "CRITERIA. Each carries a VERBATIM quote from the trader followed by the working rule distilled from it. The quote is his; the thresholds, category names and output limits are the system's reading of him — follow the rule, and use the quote to judge what he actually meant:",
    criteriaText(),
    axisFree ? AXIS_FREE_NOTE : '',
    axisFree ? OUTPUT_RULES_AXIS_FREE : OUTPUT_RULES,
    fewShot.length > 0 ? `WORKED EXAMPLES:\n${examples}` : '',
    `${target}\nThis is the ${ctx.profileName} over ${ctx.lookback}. Read it now and return the JSON.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')
}
