import type { Briefing } from '@/knowledge/schema/briefing.schema'

/**
 * Briefing prose segmentation: split model-written text into plain runs,
 * price tokens, and doctrine/level terms so the UI can bold what a trader
 * scans for. Pure string → segments; the rendering component maps segment
 * kinds onto styles.
 */

export type SegmentKind = 'plain' | 'price' | 'term'

export interface TextSegment {
  text: string
  kind: SegmentKind
}

/**
 * NQ-scale prices: comma-grouped numbers (29,942.75) or bare 4–5 digit
 * numbers with optional decimals (30078.5). Bare 4-digit integers that read
 * as years (1900–2099) are excluded.
 */
const PRICE_RE =
  /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b(?!(?:19|20)\d{2}\b)\d{4,5}(?:\.\d+)?\b/g

/** Doctrine vocabulary always worth emphasis, beyond the briefing's own labels. */
const DOCTRINE_TERMS = [
  'Rip Wall',
  'Kill Box',
  'Rip',
  'Wall',
  'Trench',
  'Magnet',
  'MGI',
  'VWAP',
  'VRange',
  'PDH',
  'PDL',
]

/** Level + zone labels from the payload, merged with the doctrine vocabulary. */
export function buildHighlightTerms(payload: Briefing): string[] {
  const labels = [
    ...payload.terrain.levels.map((level) => level.label),
    ...payload.terrain.zones.map((zone) => zone.label),
  ]
  return [...new Set([...labels, ...DOCTRINE_TERMS])].filter(
    (term) => term.trim().length > 0,
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Match {
  start: number
  end: number
  kind: SegmentKind
}

function collectMatches(text: string, re: RegExp, kind: SegmentKind): Match[] {
  const matches: Match[] = []
  for (const match of text.matchAll(re)) {
    matches.push({ start: match.index, end: match.index + match[0].length, kind })
  }
  return matches
}

export function segmentBriefingText(text: string, terms: string[]): TextSegment[] {
  const matches = collectMatches(text, PRICE_RE, 'price')

  if (terms.length > 0) {
    // Longest term first so "Rip Wall" beats "Rip" and "Wall".
    const alternation = [...terms]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')
    const termRe = new RegExp(
      `(?<![A-Za-z0-9])(?:${alternation})(?![A-Za-z0-9])`,
      'gi',
    )
    matches.push(...collectMatches(text, termRe, 'term'))
  }

  // Earliest match wins; on a tie the longer one wins. Overlaps are dropped.
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), kind: 'plain' })
    }
    segments.push({ text: text.slice(match.start, match.end), kind: match.kind })
    cursor = match.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), kind: 'plain' })
  }
  return segments
}
