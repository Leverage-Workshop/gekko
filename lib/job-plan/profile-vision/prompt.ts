import type { Instrument } from './instrument'
import type { RenderMeta, TileSpan } from './renderProfile'

/**
 * The vision prompt for the profile read (feat-123, docs/job-planning-task-plan.md
 * "The perception contract"). Three parts:
 *
 *   1. RULES — distilled from docs/jba-research/lvn-corpus.md sections B1–B16
 *      (what makes an LVN notable / primary) and D (the negative set), each with
 *      one quoted example from the corpus. Static across calls.
 *   2. PER-CALL TEXT — instrument, profile name / lookback, price span, row step,
 *      POC / VAH / VAL, current price. NO structure (no boxes, MGI, pivots):
 *      relating nodes to structure is planner math, and showing the boxes would
 *      invite the model to find LVNs where the boxes suggest.
 *
 * VISION_PROMPT_REVISION bumps whenever the criteria or the few-shot set change;
 * feat-128 persists it with every read and feat-124's bench cache keys on it.
 */

export const VISION_PROMPT_REVISION = 'vision-2026-08-31.5'


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
  'A volume profile shows where participants traded. What you are looking for is the price at which that participation dried up — a LOW-VOLUME NODE, an LVN. Those levels matter because the participants who traded the volume beside them have to defend them: if price leaves, there is little volume to slow it down, so it can travel a long way before finding any, and they take a loss. Every rule below follows from that.'

export const CRITERIA: readonly Rule[] = [
  {
    title: 'PROMINENCE IS THE SIZE OF THE DROP',
    text: 'Rank an LVN by how large a change in volume it represents, not by how thin it looks on its own. The most prominent LVNs sit against the most prominent distributions: a trough beside a very large build outranks a thinner trough beside a small one, because far more participation ended there.',
  },
  {
    title: 'AN LVN HAS TWO SIDES AND EACH GIVES WAY IN ONE OF TWO WAYS',
    text: 'A LEDGE: significant volume that stops abruptly and drops off a cliff into the low-volume area. A TAPER: a distribution that thins out gradually into it. Report BOTH sides separately, because they are frequently different — the same LVN is commonly a ledge from below and a taper from above. Neither form is inherently more prominent than the other; rule 1 decides that.',
  },
  {
    title: 'A SIDE WITH NO DISTRIBUTION IS FLAT, AND THAT ONLY HELPS YOU LOCATE THE LVN',
    text: 'A side does not always have a distribution on it. Sometimes a FLAT, LOW-VOLUME STRETCH simply continues — call that side flat. Sometimes THE START OF A NEW DISTRIBUTION builds again — that side is a ledge or a taper. Use whichever it is to find the LVN and set its bounds. Neither changes how prominent the LVN is; that is rule 1 and rule 1 only.',
  },
  {
    title: 'HIGH-VOLUME NODES (HVNs) ARE THE PEAKS OF LARGE DISTRIBUTIONS',
    text: 'Report the peak of each significant distribution as an HVN — not every fat bar, and not its boundary. The boundary is already carried as the neighbouring LVN edge.',
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per rule. */
export const CRITERIA_CANARIES = CRITERIA.map((c) => c.title)

function criteriaText(): string {
  return CRITERIA.map((c, i) => `${i + 1}. ${c.title}. ${c.text}`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- Report only the DECISIVE levels: the most prominent LVN, the next two or three LVNs, and the peak of each significant distribution as an HVN. Three to five nodes is normal. The schema caps you at 8; that is a ceiling, never a target, and padding the list makes the read worse.
- kind: lvn (an LVN) | hvn (the peak of a distribution) | exhaustive-node (uncommon: a spike at a profile extreme with a small build behind it that then steps off hard — only when you can actually see that anatomy).
- edgeBelow / edgeAbove: how volume gives way on each side of the node — ledge (drops off a cliff) | taper (thins gradually) | flat (no distribution that side, a low-volume stretch continues) | none (the side does not apply). Every lvn carries a real form on both sides; an hvn is a peak, so both sides are none.
- priceLow / priceHigh: a band in price read off the axis; equal for a point. Snap to the row step, and report the span you can actually see — never pad a narrow node or collapse a wide one to a single price.
- prominence: 1 (largest drop in volume in THIS image) to 5 (weakest worth keeping), on ONE scale across all kinds — the planner ranks nodes against each other regardless of kind. Ties are allowed.
- primary: when you report any LVN, exactly one carries true — the one with the largest drop in volume. When the image shows no LVN at all, every node is false.
- position: top | upper | mid | lower | bottom — where the node sits in this image.
- rationale: at most 20 words, describing only what is visible.
- thinZones: at most 3 { low, high } spans that are thin across many rows.
- Read prices from the axis labels; do not guess beyond the image's span. Ignore anything you believe about the market — this is perception only.`

const ROLE = `You are reading a volume-by-price profile image the way a professional futures trader reads it on screen: horizontal bars grow LEFT from the price axis on the right; a longer bar means more volume traded at that price. You know what a volume profile is, and what a low-volume node (LVN) and a high-volume node (HVN) are — the job here is to pick out the few LVNs and HVNs that are decisive, and the rules below say which ones those are.`

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
export function buildVisionPrompt(ctx: ProfileCallContext): string {
  const target = describeImage('Profile to read', ctx.instrument, ctx.meta, ctx.tile)
  return [
    ROLE,
    MECHANISM,
    'RULES:',
    criteriaText(),
    OUTPUT_RULES,
    `${target}\nThis is the ${ctx.profileName} over ${ctx.lookback}. Read it now and return the JSON.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')
}
