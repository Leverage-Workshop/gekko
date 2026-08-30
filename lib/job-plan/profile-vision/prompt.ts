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

export const VISION_PROMPT_REVISION = 'vision-2026-08-30.1'

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
    rule: 'DEPTH RANKS. The primary LVN is the deepest trough — the least volume relative to the nodes on either side — ranked WITHIN this profile only. Mark exactly one lvn primary (prominence 1).',
    corpus: 'B1, B2',
    example: 'this is the deepest LVN. So deepest meaning primary',
  },
  {
    rule: 'FIND IT BY BAR TIP, ACROSS THE WHOLE IMAGE. Bars grow left from the price axis, so the primary is the lvn whose bars stay NEAREST the axis — compare tip lengths against every trough in the image, not just its two neighbours.',
    corpus: 'B13',
    example:
      "the easiest way to spot a primary LVN is just look all the way to the right and see which ones are closest",
  },
  {
    rule: 'SECONDARY LVNs ARE DEMOTED, NOT DROPPED. A shallower trough sitting INSIDE a distribution is a secondary lvn: still report it, with prominence 3-5 and primary false. It gives a first response but gets filled; it never competes for primary.',
    corpus: 'B13, B14',
    example:
      "that's a secondary LVN and although it can offer an initial uh response that it's more likely to be filled",
  },
  {
    rule: 'DISTRIBUTIONS ARE THE ZONES BETWEEN PRIMARY LVNs. Count the humps first: one = bell, two = double, three or more = multi (trend-up / trend-down when the mass climbs or falls across the image, thin when there is no real hump). Set profileShape from that count, and put the primary lvn on a wall BETWEEN humps, never inside one.',
    corpus: 'B14, B15',
    example:
      "here's a primary obn right there and one right here so between the two we have a distribution of volume",
  },
  {
    rule: 'EXTREME ANATOMY: TAPER vs LEDGE vs EXHAUSTIVE. A taper falls off PROGRESSIVELY away from a fat node (parabolic or a straight 45-degree ramp) — that is taper-tail, and the extreme is finished. A LEDGE is a stack of near-EQUAL-length bars where the build just stops — shape ledge, unfinished = true, and never a taper-tail. An exhaustive node is a spike, a small build, then an immediate step off.',
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
    rule: 'WIDTH IS A QUALIFIER. A wide LVN is reported as a band spanning the whole thin zone (and listed in thinZones); a narrow one as a 2–4 point band on ES, 8–16 points on NQ. Never collapse a wide zone to a single price.',
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
    rule: 'HIGH-VOLUME EDGES ON BOTH SIDES. Every fat node has a boundary above and below where volume drops off a cliff; report both as hvn-edge. They are distribution boundaries, the edges to lean on.',
    corpus: 'B4, B12',
    example: 'high volume edge, 34s… LVN… at 34 to 32',
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
    example: 'Which of several is most prominent cannot always be eyeballed',
  },
  {
    rule: 'NEGATIVE — NO PRIMARY INSIDE THE VALUE BULK. A trough inside the value-area bulk of a fat distribution is not the primary LVN; the primary sits at a distribution edge or between distributions.',
    corpus: 'B8, D3',
    example: 'An LVN inside value is not an entry',
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per criterion. */
export const CRITERIA_CANARIES = CRITERIA.map((c) => c.example)

function criteriaText(): string {
  return CRITERIA.map((c, i) => `${i + 1}. ${c.rule}\n   Corpus: "${c.example}"`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- nodes: at most 8. kind is one of lvn | hvn-edge | hvn-core | exhaustive-node | taper-tail.
- priceLow / priceHigh: a band in price read off the axis; equal for a point. Snap to the row step.
- prominence: 1 (most prominent in THIS image) to 5; a secondary lvn inside a distribution gets 3-5. primary: true on exactly one lvn.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- shape: valley (trough between two nodes) | shelf-edge (thin shelf just outside a node) | wide-gap (a long thin span) | ledge (a stack of near-equal bars where the build stops) | notch (a fat peak, for hvn kinds).
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
    "CRITERIA (each with the trader's own words from the corpus):",
    criteriaText(),
    OUTPUT_RULES,
    fewShot.length > 0 ? `WORKED EXAMPLES:\n${examples}` : '',
    `${target}\nThis is the ${ctx.profileName} over ${ctx.lookback}. Read it now and return the JSON.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')
}
