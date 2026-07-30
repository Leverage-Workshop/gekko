import { segmentBriefingText } from '@/lib/briefing/highlight'

/**
 * Renders briefing prose with doctrine/level names emphasized — segmentation
 * logic lives in lib/briefing/highlight.ts. Names are what's on the operator's
 * charts, so they carry the bold bright tone; prices ride unemphasized in
 * parens behind them (operator direction 2026-07-30 — the earlier
 * prices-brightest scheme buried the names).
 */
export function HighlightedText({
  text,
  terms,
}: {
  text: string
  terms: string[]
}) {
  const segments = segmentBriefingText(text, terms)
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'plain' ? (
          segment.text
        ) : segment.kind === 'price' ? (
          <span key={`${index}-${segment.text}`} className="tracking-tight">
            {segment.text}
          </span>
        ) : (
          <strong key={`${index}-${segment.text}`} className="font-bold text-ink">
            {segment.text}
          </strong>
        ),
      )}
    </>
  )
}
