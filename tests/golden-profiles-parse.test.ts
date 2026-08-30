import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseVbpProfile } from '@/lib/engine/parseProfile'

/**
 * feat-131 regression guard. The Sierra job-plan exporter (feat-118) OMITS
 * zero-volume rows, so feat-119's golden `.vbp.md` exports have holes in the
 * price grid. The bench, the render script, the few-shot loader and the live
 * job-plan path all parse these files with `fillMissingRows: true`; before
 * that option existed, `npm run profile-vision:bench` died on the first
 * sparse date (4 of the 12 test dates) with a "Row spacing violation".
 *
 * Every golden export must parse under the option the readers actually use.
 */
const ROOT = join(process.cwd(), 'chart-data/job-lvn-golden')
const PROFILES = ['five-day-rolling.vbp.md', 'four-hour-rolling.vbp.md']

function goldenDates(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
}

describe('golden-set profile exports parse', () => {
  const dates = goldenDates()

  it('finds the golden dates on disk', () => {
    expect(dates.length).toBeGreaterThanOrEqual(15)
  })

  for (const date of dates) {
    for (const file of PROFILES) {
      const path = join(ROOT, date, file)
      if (!existsSync(path)) continue
      it(`${date}/${file} parses with fillMissingRows and yields a contiguous grid`, () => {
        const profile = parseVbpProfile(readFileSync(path, 'utf8'), { fillMissingRows: true })
        expect(profile.rows.length).toBeGreaterThan(20)
        const step = profile.meta.step
        for (let i = 1; i < profile.rows.length; i++) {
          const gap = profile.rows[i - 1].price - profile.rows[i].price
          expect(Math.abs(gap - step)).toBeLessThan(0.0001)
        }
        // zero-filled rows are legal; negative volume is not
        expect(profile.rows.every((r) => r.volume >= 0)).toBe(true)
      })
    }
  }
})

describe('the strict contract is unchanged', () => {
  it('a sparse export still throws without the option (ingest keeps its guarantee)', () => {
    const sparse = [
      '## Metadata',
      '- **Profile Name**: T',
      '- **Tick Size**: 0.25',
      '- **Bin Size (Ticks)**: 1',
      '',
      '## Summary',
      '- **POC Price**: 100.00',
      '- **Value Area High**: 100.50',
      '- **Value Area Low**: 99.50',
      '',
      '```csv',
      'Price,Volume',
      '100.50,10',
      '100.25,5',
      '99.75,7', // 99.75 skips 100.00 → a hole
      '```',
    ].join('\n')
    expect(() => parseVbpProfile(sparse)).toThrow(/Row spacing violation/)
    const filled = parseVbpProfile(sparse, { fillMissingRows: true })
    expect(filled.rows.map((r) => r.price)).toEqual([100.5, 100.25, 100.0, 99.75])
    expect(filled.rows.find((r) => r.price === 100.0)?.volume).toBe(0)
  })

  it('a gap that is NOT a multiple of the step throws even with the option on', () => {
    const bad = [
      '## Metadata',
      '- **Tick Size**: 0.25',
      '- **Bin Size (Ticks)**: 1',
      '',
      '## Summary',
      '- **POC Price**: 100.00',
      '- **Value Area High**: 100.50',
      '- **Value Area Low**: 99.50',
      '',
      '```csv',
      'Price,Volume',
      '100.50,10',
      '100.10,5', // 0.40 gap: not a multiple of 0.25
      '```',
    ].join('\n')
    expect(() => parseVbpProfile(bad, { fillMissingRows: true })).toThrow(/Row spacing violation/)
  })
})
