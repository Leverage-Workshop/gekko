import { segmentBriefingText } from '@/lib/briefing/highlight'

/**
 * Renders briefing prose with prices and doctrine/level terms emphasized —
 * segmentation logic lives in lib/briefing/highlight.ts; this maps segment
 * kinds onto DESIGN.md text tones (prices brightest, terms one step down).
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
        ) : (
          <strong
            key={`${index}-${segment.text}`}
            className={
              segment.kind === 'price'
                ? 'font-bold tracking-tight text-ink'
                : 'font-bold text-body-strong'
            }
          >
            {segment.text}
          </strong>
        ),
      )}
    </>
  )
}
