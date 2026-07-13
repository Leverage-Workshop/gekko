import { describe, expect, it } from 'vitest'
import { buildHighlightTerms, segmentBriefingText } from '@/lib/briefing'
import type { Briefing } from '@/knowledge/schema/briefing.schema'

function kindsOf(text: string, terms: string[] = []) {
  return segmentBriefingText(text, terms).map((s) => [s.kind, s.text])
}

describe('segmentBriefingText', () => {
  it('marks comma-grouped prices', () => {
    expect(kindsOf('holding above 30,031.8 for now')).toEqual([
      ['plain', 'holding above '],
      ['price', '30,031.8'],
      ['plain', ' for now'],
    ])
  })

  it('marks bare 5-digit prices with decimals', () => {
    const segments = segmentBriefingText('vwap sits at 29768.25 today', [])
    expect(segments).toContainEqual({ text: '29768.25', kind: 'price' })
  })

  it('does not mark years or small counts', () => {
    expect(kindsOf('in 2026 the 30-minute structure held')).toEqual([
      ['plain', 'in 2026 the 30-minute structure held'],
    ])
  })

  it('marks doctrine terms case-insensitively', () => {
    const segments = segmentBriefingText('defend the rip wall here', ['Rip Wall'])
    expect(segments).toContainEqual({ text: 'rip wall', kind: 'term' })
  })

  it('prefers the longest term over its fragments', () => {
    const segments = segmentBriefingText('the Rip Wall holds', [
      'Rip',
      'Wall',
      'Rip Wall',
    ])
    expect(segments).toContainEqual({ text: 'Rip Wall', kind: 'term' })
    expect(segments.filter((s) => s.kind === 'term')).toHaveLength(1)
  })

  it('does not match terms inside larger words', () => {
    const segments = segmentBriefingText('gripping wallpaper', ['Rip', 'Wall'])
    expect(segments).toEqual([{ text: 'gripping wallpaper', kind: 'plain' }])
  })

  it('handles adjacent price and term matches without overlap', () => {
    const segments = segmentBriefingText('30,094 Rip Wall retest', ['Rip Wall'])
    expect(segments).toEqual([
      { text: '30,094', kind: 'price' },
      { text: ' ', kind: 'plain' },
      { text: 'Rip Wall', kind: 'term' },
      { text: ' retest', kind: 'plain' },
    ])
  })

  it('returns the whole text as plain when nothing matches', () => {
    expect(kindsOf('no numbers here')).toEqual([['plain', 'no numbers here']])
  })
})

describe('buildHighlightTerms', () => {
  it('merges terrain labels with the doctrine vocabulary, deduped', () => {
    const payload = {
      terrain: {
        zones: [{ color: 'green', top: 2, bottom: 1, label: 'Kill Box' }],
        levels: [{ price: 1, label: 'Weekly VWAP Trench', kind: 'trench' }],
      },
    } as unknown as Briefing

    const terms = buildHighlightTerms(payload)
    expect(terms).toContain('Weekly VWAP Trench')
    expect(terms).toContain('Rip Wall')
    expect(terms.filter((t) => t === 'Kill Box')).toHaveLength(1)
  })
})
