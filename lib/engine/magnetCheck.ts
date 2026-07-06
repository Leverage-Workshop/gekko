/**
 * Magnet Check (feat-015).
 *
 * A **Magnet** is a high-volume-consensus price — the "center of gravity" where price lingers.
 * The doctrine's Magnet Check (`knowledge/doctrine/chart-reading.md`, "Internal partitioning")
 * is an *invalidation*: if a major MGI level sits on top of a magnet, that level **cannot** act
 * as a structural border (Trench/Wall) or a Target 3 (Campaign Max). Only Shelves and Valleys —
 * where the battle was won or lost — are structural; a Magnet is the mass, not the edge.
 *
 * This module owns the magnet set and the proximity test:
 *   - magnets = the VbP Summary levels (POC, VAH, VAL) + the detected HVN peaks (feat-014).
 *   - proximity = |price - magnet|, the nearest magnet to a queried price.
 *   - an MGI level is a Magnet when its nearest magnet is within `tolerance` (NQ points).
 *
 * It is the SINGLE SOURCE of magnet classification: feat-016 terrainZones consumes
 * {@link collectMagnets} / {@link classifyMagnet} for its "Peak + MGI = Magnet" branch rather
 * than re-deriving the magnet set (the two features overlap here by design — see the feat-016
 * spec note). terrainZones adds the local-profile Trench/Wall geometry on top; the magnet set
 * and the "is this price on a magnet" question live here.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a Briefing output —
 * no Zod), mirroring the other lib/engine modules. MGI levels are accepted structurally so
 * this module does not runtime-couple to mgiPriority.
 */

import type { HvnNode } from './lvnDetection'

/** Where a magnet came from: the VbP Summary value area, or a detected HVN peak. */
export type MagnetKind = 'poc' | 'vah' | 'val' | 'hvn'

/** A high-volume-consensus price the market gravitates to. */
export type Magnet = {
  price: number
  label: string // 'POC' | 'VAH' | 'VAL' | 'HVN'
  kind: MagnetKind
  /** Smoothed volume at the node for HVN magnets; null for the Summary levels. */
  volume: number | null
}

/** The nearest magnet to a queried price and its absolute distance (NQ points). */
export type MagnetHit = {
  magnet: Magnet
  distance: number
}

/** Structural reference for a level to test — satisfied by mgiPriority's MgiLevel. */
export type LevelRef = {
  price: number
  label: string
}

/** Verdict for one queried level: is it sitting on a magnet? */
export type MagnetVerdict = {
  level: LevelRef
  /** true when the nearest magnet is within `tolerance` — the level is an invalidation. */
  isMagnet: boolean
  /** Nearest magnet regardless of the tolerance, or null when no magnets exist. */
  nearest: MagnetHit | null
  tolerance: number
}

export type MagnetCheck = {
  magnets: Magnet[] // price descending
  tolerance: number
  verdicts: MagnetVerdict[] // one per input level, input order preserved
  /** Convenience: the queried levels flagged as Magnets (structural invalidations). */
  magnetLevels: LevelRef[]
}

/** The VbP Summary value area — the POC and the 68% value-area edges. */
export type ProfileSummary = {
  pocPrice: number
  valueAreaHigh: number
  valueAreaLow: number
}

/**
 * Default magnet proximity in NQ points. A major MGI within this distance of a POC/VAH/VAL/HVN
 * is treated as sitting on that magnet. Mirrors the ±10pt tolerance the LVN/HVN eval harness
 * uses to match detected nodes to labels (feat-014/035), so "aligns with" is judged on one
 * consistent scale across the engine.
 */
export const DEFAULT_MAGNET_TOLERANCE = 10

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Build the magnet set from the VbP Summary (POC/VAH/VAL) and the detected HVN peaks.
 * Non-finite Summary values are skipped. Result is price-descending to match the export
 * convention used across the engine.
 */
export function collectMagnets(input: { summary: ProfileSummary; hvn: HvnNode[] }): Magnet[] {
  const { summary, hvn } = input
  const magnets: Magnet[] = []

  const summarySpecs: { price: number; label: string; kind: MagnetKind }[] = [
    { price: summary.pocPrice, label: 'POC', kind: 'poc' },
    { price: summary.valueAreaHigh, label: 'VAH', kind: 'vah' },
    { price: summary.valueAreaLow, label: 'VAL', kind: 'val' },
  ]
  for (const s of summarySpecs) {
    if (isFiniteNumber(s.price)) magnets.push({ price: s.price, label: s.label, kind: s.kind, volume: null })
  }

  for (const node of hvn) {
    if (isFiniteNumber(node.price)) {
      magnets.push({ price: node.price, label: 'HVN', kind: 'hvn', volume: node.volume })
    }
  }

  return magnets.sort((a, b) => b.price - a.price)
}

/** Nearest magnet to `price` by absolute distance, or null when the set is empty. */
export function nearestMagnet(price: number, magnets: Magnet[]): MagnetHit | null {
  if (!isFiniteNumber(price) || magnets.length === 0) return null
  const magnet = magnets.reduce((best, m) =>
    Math.abs(m.price - price) < Math.abs(best.price - price) ? m : best,
  )
  return { magnet, distance: round2(Math.abs(magnet.price - price)) }
}

/**
 * Classify a single price against the magnet set: it is a Magnet when the nearest magnet is
 * within `tolerance`. Returns the nearest hit regardless so callers can see how close a
 * near-miss was.
 */
export function classifyMagnet(
  price: number,
  magnets: Magnet[],
  tolerance: number = DEFAULT_MAGNET_TOLERANCE,
): { isMagnet: boolean; nearest: MagnetHit | null } {
  const nearest = nearestMagnet(price, magnets)
  const isMagnet = nearest !== null && nearest.distance <= tolerance
  return { isMagnet, nearest }
}

/**
 * Run the Magnet Check over a set of MGI levels: build the magnet set once, then classify each
 * level. Any level flagged `isMagnet` is a structural invalidation (cannot be a border or T3).
 *
 * @param input.summary    VbP Summary POC/VAH/VAL (feat-002).
 * @param input.hvn        Detected HVN peaks (feat-014).
 * @param input.levels     MGI levels to test (feat-012); typically the major/Tier-1 anchors.
 * @param input.tolerance  Magnet proximity in NQ points (default {@link DEFAULT_MAGNET_TOLERANCE}).
 */
export function evaluateMagnetCheck(input: {
  summary: ProfileSummary
  hvn: HvnNode[]
  levels: LevelRef[]
  tolerance?: number
}): MagnetCheck {
  const tolerance = input.tolerance ?? DEFAULT_MAGNET_TOLERANCE
  if (!isFiniteNumber(tolerance) || tolerance < 0) {
    throw new Error(`evaluateMagnetCheck: tolerance must be a non-negative finite number, got ${tolerance}`)
  }

  const magnets = collectMagnets({ summary: input.summary, hvn: input.hvn })

  const verdicts: MagnetVerdict[] = input.levels.map((level) => {
    const { isMagnet, nearest } = classifyMagnet(level.price, magnets, tolerance)
    return { level, isMagnet, nearest, tolerance }
  })

  return {
    magnets,
    tolerance,
    verdicts,
    magnetLevels: verdicts.filter(v => v.isMagnet).map(v => v.level),
  }
}
