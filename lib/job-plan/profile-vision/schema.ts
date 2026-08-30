import { z } from 'zod'

/**
 * The perception contract's output (feat-123, docs/job-planning-task-plan.md
 * "The perception contract"): what ONE vision call returns for ONE profile
 * image (or tile). A FLAT Zod object — OpenAI rejects root unions — with the
 * cross-field rules in a superRefine so a structurally valid but contradictory
 * read (two primaries, an inverted band, > 8 nodes) is rejected at the call
 * boundary and retried by the caller, never persisted.
 *
 * feat-135 adds a second way to say WHERE a node is. A node band is either
 *
 *   - PRICE bounds (`priceLow` / `priceHigh`) — what the model reads off the
 *     rendered price axis, the contract since feat-123; or
 *   - NORMALIZED bounds (`yLow` / `yHigh`, 0 = bottom edge of the plot,
 *     1 = top) — the AXIS-FREE render (`RenderOptions.axis: false`) has no axis
 *     to read, so the model only says where something SITS and the caller
 *     converts to price from the span the image is known to cover.
 *
 * Three schemas, all FLAT objects — the "either" shape is expressed with
 * optional fields plus a superRefine, never a union, because OpenAI rejects
 * root-level unions (and this file's whole shape exists for that reason):
 *
 *   - `profileNodesReadSchema` — PRICE only. Unchanged, and still the type
 *     every consumer downstream of the read sees (consensus, bench, planner).
 *   - `profileNodesReadNormalizedSchema` — NORMALIZED only. The wire schema for
 *     an axis-free call.
 *   - `profileNodesReadEitherSchema` — accepts a read in either form and
 *     rejects a node carrying BOTH pairs or NEITHER. Used where a read of
 *     unknown provenance is validated (the bench response cache).
 *
 * The two wire schemas are deliberately kept strict — every field required, no
 * optionals — because a provider in strict structured-output mode wants every
 * property in `required`. Only the "either" schema, which never goes on the
 * wire, uses optional fields.
 */

export const NODE_KINDS = ['lvn', 'hvn-edge', 'hvn-core', 'exhaustive-node', 'taper-tail'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

export const NODE_POSITIONS = ['top', 'upper', 'mid', 'lower', 'bottom'] as const
export type NodePosition = (typeof NODE_POSITIONS)[number]

/**
 * `ledge` (corpus B16, added 2026-08-30): a stack of near-equal-length bars at an
 * extreme where the build simply stops — the unfinished-auction tell, distinct from
 * a taper's progressive fall-off. Widening this enum is backward compatible: every
 * previously persisted shape is still legal.
 */
export const NODE_SHAPES = ['valley', 'shelf-edge', 'wide-gap', 'ledge', 'notch'] as const
export type NodeShape = (typeof NODE_SHAPES)[number]

export const PROFILE_SHAPES = ['bell', 'double', 'multi', 'trend-up', 'trend-down', 'thin'] as const
export type ProfileShape = (typeof PROFILE_SHAPES)[number]

export const MAX_NODES = 8
export const MAX_THIN_ZONES = 3
export const MAX_RATIONALE_WORDS = 20

const finitePrice = z.number().finite()

export const profileNodeSchema = z.object({
  kind: z.enum(NODE_KINDS),
  /** Band edges in price; equal for a point. */
  priceLow: finitePrice,
  priceHigh: finitePrice,
  /** 1 = most prominent within THIS profile … 5 = least. */
  prominence: z.number().int().min(1).max(5),
  /** Exactly one `lvn` per profile carries true. */
  primary: z.boolean(),
  position: z.enum(NODE_POSITIONS),
  shape: z.enum(NODE_SHAPES),
  rationale: z.string().min(1).max(200),
})
export type ProfileNode = z.infer<typeof profileNodeSchema>

export const thinZoneSchema = z.object({
  low: finitePrice,
  high: finitePrice,
})
export type ThinZone = z.infer<typeof thinZoneSchema>

/**
 * Per-IMAGE contract. A profile always shows at least one node (a POC-class
 * peak, an edge, a tail), so an empty `nodes` is a refusal to do the task and
 * is rejected; an lvn-free image (a tile that is one fat node) is legal, and
 * then no primary is required. The profile-level "exactly one primary lvn"
 * guarantee is consensus.ts's job once tiles and samples are combined.
 */
const profileNodesReadBase = z.object({
  nodes: z.array(profileNodeSchema).min(1),
  thinZones: z.array(thinZoneSchema),
  profileShape: z.enum(PROFILE_SHAPES),
  /** No taper / exhaustive node at an extreme (corpus #69). */
  unfinished: z.boolean(),
})

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length
}

/**
 * The band a node / thin zone carries, resolved to its two edges plus the field
 * names to point an issue at. `null` = the "either" schema saw a node with both
 * pairs or neither, which the caller reports and then skips.
 */
type Band = { readonly low: number; readonly high: number; readonly lowField: string }

type LooseNode = {
  readonly kind: NodeKind
  readonly priceLow?: number
  readonly priceHigh?: number
  readonly yLow?: number
  readonly yHigh?: number
  readonly primary: boolean
  readonly rationale: string
}
type LooseZone = {
  readonly low?: number
  readonly high?: number
  readonly yLow?: number
  readonly yHigh?: number
}
type LooseRead = {
  readonly nodes: readonly LooseNode[]
  readonly thinZones: readonly LooseZone[]
}

/** Which pair of bound fields a schema reads a band from. */
export type BoundsMode = 'price' | 'normalized' | 'either'

function hasPair(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined
}

/**
 * Resolve one band under `mode`. Under `either` exactly one pair must be
 * present — a node carrying both is contradictory (which one is the truth?) and
 * a node carrying neither says nothing about where it is; both are rejected
 * here rather than silently preferred one way at the conversion boundary.
 */
function resolveBand(
  v: {
    priceLow?: number
    priceHigh?: number
    low?: number
    high?: number
    yLow?: number
    yHigh?: number
  },
  mode: BoundsMode,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): Band | null {
  const priceLow = v.priceLow ?? v.low
  const priceHigh = v.priceHigh ?? v.high
  const priceField =
    v.priceLow !== undefined || v.low !== undefined
      ? v.low !== undefined && v.priceLow === undefined
        ? 'low'
        : 'priceLow'
      : 'priceLow'
  const price = hasPair(priceLow, priceHigh)
  const norm = hasPair(v.yLow, v.yHigh)
  if (mode === 'price') return { low: priceLow!, high: priceHigh!, lowField: priceField }
  if (mode === 'normalized') return { low: v.yLow!, high: v.yHigh!, lowField: 'yLow' }
  if (price && norm) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'yLow'],
      message: 'a band carries EITHER price bounds or normalized bounds, never both',
    })
    return null
  }
  if (price) return { low: priceLow!, high: priceHigh!, lowField: priceField }
  if (norm) return { low: v.yLow!, high: v.yHigh!, lowField: 'yLow' }
  ctx.addIssue({
    code: 'custom',
    path: [...path, priceField],
    message:
      'a band needs either price bounds (priceLow/priceHigh) or normalized bounds (yLow/yHigh)',
  })
  return null
}

/**
 * The cross-field rules, shared by all three read schemas so the price, the
 * normalized and the "either" contract can never drift apart. Only the band
 * fields differ; every count, primary and rationale rule is identical.
 */
function refineRead(read: LooseRead, ctx: z.RefinementCtx, mode: BoundsMode): void {
  if (read.nodes.length > MAX_NODES) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: `at most ${MAX_NODES} nodes per profile (got ${read.nodes.length})`,
    })
  }
  if (read.thinZones.length > MAX_THIN_ZONES) {
    ctx.addIssue({
      code: 'custom',
      path: ['thinZones'],
      message: `at most ${MAX_THIN_ZONES} thin zones (got ${read.thinZones.length})`,
    })
  }
  read.nodes.forEach((node, i) => {
    const band = resolveBand(node, mode, ctx, ['nodes', i])
    if (band && band.low > band.high) {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes', i, band.lowField],
        message:
          band.lowField === 'yLow'
            ? `yLow ${band.low} > yHigh ${band.high}`
            : `priceLow ${band.low} > priceHigh ${band.high}`,
      })
    }
    if (node.primary && node.kind !== 'lvn') {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes', i, 'primary'],
        message: `only an lvn can be primary (got ${node.kind})`,
      })
    }
    if (wordCount(node.rationale) > MAX_RATIONALE_WORDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes', i, 'rationale'],
        message: `rationale must be <= ${MAX_RATIONALE_WORDS} words`,
      })
    }
  })
  read.thinZones.forEach((zone, i) => {
    const band = resolveBand(zone, mode, ctx, ['thinZones', i])
    if (band && band.low > band.high) {
      ctx.addIssue({
        code: 'custom',
        path: ['thinZones', i, band.lowField],
        message:
          band.lowField === 'yLow'
            ? `yLow ${band.low} > yHigh ${band.high}`
            : `low ${band.low} > high ${band.high}`,
      })
    }
  })
  const primaries = read.nodes.filter((n) => n.primary).length
  if (primaries > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: `exactly one primary lvn per profile (got ${primaries})`,
    })
  }
  const lvns = read.nodes.filter((n) => n.kind === 'lvn').length
  if (lvns > 0 && primaries === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: 'one lvn must be marked primary when any lvn is reported',
    })
  }
}

export const profileNodesReadSchema = profileNodesReadBase.superRefine((read, ctx) => {
  refineRead(read, ctx, 'price')
})
export type ProfileNodesRead = z.infer<typeof profileNodesReadSchema>

// ---------------------------------------------------------------------------
// Axis-free contract (feat-135): the same read, positioned by fraction.
// ---------------------------------------------------------------------------

/**
 * A normalized vertical position on the image: 0 = the bottom edge of the plot
 * area, 1 = the top. A FRACTION, not a pixel row, so it survives a change of
 * render size without invalidating the few-shot examples or the bench cache.
 */
const fraction = z.number().min(0).max(1)

export const profileNodeNormalizedSchema = z.object({
  kind: z.enum(NODE_KINDS),
  /** Band edges as fractions of the image height; equal for a point. */
  yLow: fraction,
  yHigh: fraction,
  /** 1 = most prominent within THIS profile … 5 = least. */
  prominence: z.number().int().min(1).max(5),
  /** Exactly one `lvn` per profile carries true. */
  primary: z.boolean(),
  position: z.enum(NODE_POSITIONS),
  shape: z.enum(NODE_SHAPES),
  rationale: z.string().min(1).max(200),
})
export type ProfileNodeNormalized = z.infer<typeof profileNodeNormalizedSchema>

export const thinZoneNormalizedSchema = z.object({
  yLow: fraction,
  yHigh: fraction,
})
export type ThinZoneNormalized = z.infer<typeof thinZoneNormalizedSchema>

/** Axis-free wire contract: identical to the price read but positioned by fraction. */
export const profileNodesReadNormalizedSchema = z
  .object({
    nodes: z.array(profileNodeNormalizedSchema).min(1),
    thinZones: z.array(thinZoneNormalizedSchema),
    profileShape: z.enum(PROFILE_SHAPES),
    unfinished: z.boolean(),
  })
  .superRefine((read, ctx) => {
    refineRead(read, ctx, 'normalized')
  })
export type ProfileNodesReadNormalized = z.infer<typeof profileNodesReadNormalizedSchema>

/**
 * A read in EITHER form. Still one flat object: the choice is expressed with
 * optional fields and the exactly-one rule in `refineRead`, never a union.
 * Never sent to a model (the wire schemas above are strict); this is for
 * validating a read whose provenance is unknown — the bench response cache
 * holds reads from both arms of the axis / axis-free A/B under one key space.
 */
export const profileNodesReadEitherSchema = z
  .object({
    nodes: z
      .array(
        z.object({
          kind: z.enum(NODE_KINDS),
          priceLow: finitePrice.optional(),
          priceHigh: finitePrice.optional(),
          yLow: fraction.optional(),
          yHigh: fraction.optional(),
          prominence: z.number().int().min(1).max(5),
          primary: z.boolean(),
          position: z.enum(NODE_POSITIONS),
          shape: z.enum(NODE_SHAPES),
          rationale: z.string().min(1).max(200),
        })
      )
      .min(1),
    thinZones: z.array(
      z.object({
        low: finitePrice.optional(),
        high: finitePrice.optional(),
        yLow: fraction.optional(),
        yHigh: fraction.optional(),
      })
    ),
    profileShape: z.enum(PROFILE_SHAPES),
    unfinished: z.boolean(),
  })
  .superRefine((read, ctx) => {
    refineRead(read, ctx, 'either')
  })
export type ProfileNodesReadEither = z.infer<typeof profileNodesReadEitherSchema>
