import { z } from 'zod'

/**
 * The perception contract's output (feat-123, docs/job-planning-task-plan.md
 * "The perception contract"): what ONE vision call returns for ONE profile
 * image (or tile). A FLAT Zod object — OpenAI rejects root unions — with the
 * cross-field rules in a superRefine so a structurally valid but contradictory
 * read (two primaries, an inverted band, > 8 nodes) is rejected at the call
 * boundary and retried by the caller, never persisted.
 */

/**
 * feat-139: narrowed to what the four rules actually support.
 *
 * `taper-tail` is gone — redundant now that `taper` is a SHAPE (a taper is one
 * of the two ways a distribution gives way, and it happens anywhere, not only
 * at a tail). `exhaustive-node` stays: it is anatomy Job names outright
 * ("exhaust of note on top of the volume profile") and the 2026-06-02 golden
 * label uses it, so removing it would mean relabelling operator-verified data.
 */
export const NODE_KINDS = ['lvn', 'hvn-edge', 'hvn-core', 'exhaustive-node'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

export const NODE_POSITIONS = ['top', 'upper', 'mid', 'lower', 'bottom'] as const
export type NodePosition = (typeof NODE_POSITIONS)[number]

/**
 * How a node's volume gives way on ONE side (feat-140).
 *
 * An LVN has TWO sides and they are frequently different — the operator's own
 * correction: "it's a ledge from below and a taper from above. depends where
 * price currently is." A single `shape` per node could not say that, so a node
 * carries an edge form for each side.
 *
 *   ledge — significant volume that stops abruptly and drops off a cliff
 *   taper — a distribution thinning gradually into the low-volume area
 *   flat  — no distribution on that side; a low-volume stretch simply continues
 *   none  — the side does not apply (an hvn-core is a peak, not an edge)
 *
 * `ledge` and `taper` are rule 2; `flat` is the first half of rule 3, so the two
 * fields together carry both rules without a separate shape vocabulary.
 */
export const NODE_EDGES = ['ledge', 'taper', 'flat', 'none'] as const
export type NodeEdge = (typeof NODE_EDGES)[number]

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
  /** How volume gives way on the side BELOW the node (lower prices). */
  edgeBelow: z.enum(NODE_EDGES),
  /** How volume gives way on the side ABOVE the node (higher prices). */
  edgeAbove: z.enum(NODE_EDGES),
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
})

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length
}

export const profileNodesReadSchema = profileNodesReadBase.superRefine((read, ctx) => {
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
    if (node.priceLow > node.priceHigh) {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes', i, 'priceLow'],
        message: `priceLow ${node.priceLow} > priceHigh ${node.priceHigh}`,
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
    if (zone.low > zone.high) {
      ctx.addIssue({
        code: 'custom',
        path: ['thinZones', i, 'low'],
        message: `low ${zone.low} > high ${zone.high}`,
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
})
export type ProfileNodesRead = z.infer<typeof profileNodesReadSchema>
