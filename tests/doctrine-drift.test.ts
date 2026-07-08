import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MAGNET_TOLERANCE } from '@/lib/engine/magnetCheck'
import { RED_EXTREME, RED_BUILDING_MIN_BARS, computeRipStatus } from '@/lib/engine/ripStatus'
import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { DEFAULT_RR_MIN, evaluateRiskReward } from '@/lib/engine/riskReward'
import { DEFAULT_STALENESS_MARGIN_MS } from '@/lib/engine/staleness'
import { DEFAULT_NEAR_ENTRY_POINTS } from '@/lib/eval/proximity'

/**
 * feat-032 — Doctrine drift guard.
 *
 * The doctrine prose in /knowledge is the model's cached system prompt; the
 * engine modules are the authoritative owners of every COMPUTABLE
 * non-negotiable (R/R gate, stops-never-widen, Rip thresholds, tier
 * hierarchy, magnet tolerance, staleness margin, entry proximity). If prose
 * restated those numbers, an engine-constant change (e.g. DEFAULT_RR_MIN
 * 3.0 → 2.5) would silently leave the model briefing against stale doctrine.
 *
 * This guard is DYNAMIC, not a snapshot: it imports the live engine
 * constants, (a) ties each exported constant to observable engine behavior,
 * (b) asserts the prose still defers each computable guardrail to its owning
 * module, and (c) derives the forbidden numeric spellings from the constants
 * themselves — so the check follows the engine wherever it goes and fails
 * whenever prose stops being module-deferring.
 *
 * (Extends tests/knowledge-restructure.test.ts, which guards the feat-022
 * layout and the original 3:1/module-name checks; assertions here cover the
 * remaining non-negotiables and all prose files, without duplicating those.)
 */

const KNOWLEDGE = join(__dirname, '..', 'knowledge')

/** Every doctrine/system prose file under /knowledge, discovered dynamically. */
function listProseFiles(dir = KNOWLEDGE): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listProseFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

const proseFiles = listProseFiles()
const relName = (path: string) => path.slice(KNOWLEDGE.length + 1)
const constraints = readFileSync(join(KNOWLEDGE, 'system/constraints.md'), 'utf8')

/** Render a numeric constant in the spellings prose might use (3 and 3.0). */
function numericSpellings(value: number): string[] {
  const compact = String(value)
  const fixed = Number.isInteger(value) ? value.toFixed(1) : compact
  return [...new Set([compact, fixed])]
}

describe('doctrine drift guard (feat-032)', () => {
  describe('engine constants are live and behavior-backed (engine authoritative)', () => {
    it('DEFAULT_RR_MIN gates evaluateRiskReward exactly at the constant', () => {
      expect(Number.isFinite(DEFAULT_RR_MIN)).toBe(true)
      expect(DEFAULT_RR_MIN).toBeGreaterThan(0)

      const entry = 30000
      const stop = entry - 10
      const atGate = evaluateRiskReward({
        direction: 'long',
        entry,
        stop,
        targets: [entry + 10 * DEFAULT_RR_MIN],
      })
      expect(atGate.rrMin).toBe(DEFAULT_RR_MIN)
      expect(atGate.meetsGate).toBe(true)

      const belowGate = evaluateRiskReward({
        direction: 'long',
        entry,
        stop,
        targets: [entry + 10 * DEFAULT_RR_MIN - 5],
      })
      expect(belowGate.meetsGate).toBe(false)
    })

    it('RED_BUILDING_MIN_BARS is the exact Red/Yellow boundary in computeRipStatus', () => {
      expect(Number.isInteger(RED_BUILDING_MIN_BARS)).toBe(true)
      // A single rogue -3/-4 print on a 750-volume bar must never flip Red on its own.
      expect(RED_BUILDING_MIN_BARS).toBeGreaterThan(1)

      const belowRip = { currentPrice: 30000, rip: 30100, deltaIntensity: -4 }
      expect(
        computeRipStatus({ ...belowRip, redExtremeCount: RED_BUILDING_MIN_BARS })
          .condition,
      ).toBe('red')
      expect(
        computeRipStatus({
          ...belowRip,
          redExtremeCount: RED_BUILDING_MIN_BARS - 1,
        }).condition,
      ).toBe('yellow')
      expect(
        computeRipStatus({
          currentPrice: 30200,
          rip: 30100,
          deltaIntensity: -4,
          redExtremeCount: RED_BUILDING_MIN_BARS,
        }).condition,
      ).toBe('green')
    })

    it('RED_EXTREME is the exact per-bar extreme boundary in deltaTelemetry counting', () => {
      expect(Number.isFinite(RED_EXTREME)).toBe(true)
      expect(RED_EXTREME).toBeLessThan(0)

      const bar = (deltaIntensity: number, i: number) => ({
        dateTime: new Date(2026, 0, 1, 9, 30 + i),
        open: 30000,
        high: 30010,
        low: 29990,
        close: 30005,
        legVWAP: 30000,
        deltaIntensity,
      })
      // At the boundary counts; half a unit above it does not.
      const telemetry = computeDeltaTelemetry(
        [RED_EXTREME, RED_EXTREME + 0.5, 0, RED_EXTREME - 1].map(bar),
      )
      expect(telemetry.recentRedExtremeCount).toBe(2)
    })

    it('the remaining engine-owned thresholds exist and are sane', () => {
      expect(DEFAULT_MAGNET_TOLERANCE).toBeGreaterThan(0)
      expect(DEFAULT_STALENESS_MARGIN_MS).toBeGreaterThan(0)
      expect(DEFAULT_NEAR_ENTRY_POINTS).toBeGreaterThan(0)
    })
  })

  describe('constraints.md defers each computable non-negotiable to its owning module', () => {
    // The "Computable guardrails" section, split into its bullets.
    const section = constraints.split(/^## Computable guardrails.*$/m)[1]?.split(/^## /m)[0]
    const bullets = (section ?? '')
      .split(/\n- \*\*/)
      .slice(1)
      .map((bullet) => `- **${bullet}`)

    const expectations: Array<{ label: RegExp; mustMention: string[] }> = [
      {
        label: /Minimum risk\/reward/,
        mustMention: ['riskReward.ts', 'evaluateRiskReward', 'config.rr_min'],
      },
      {
        label: /Stops never widen/,
        mustMention: ['riskReward.ts', 'stopWidened'],
      },
      {
        label: /Tier/,
        mustMention: ['mgiPriority.ts'],
      },
      {
        label: /Rip|Vanguard/,
        mustMention: ['ripStatus.ts'],
      },
    ]

    it('still has a Computable guardrails section with bullets', () => {
      expect(section, 'constraints.md lost its "## Computable guardrails" section').toBeTruthy()
      expect(bullets.length).toBeGreaterThanOrEqual(expectations.length)
    })

    it.each(expectations)(
      'the $label guardrail names its engine owner',
      ({ label, mustMention }) => {
        const bullet = bullets.find((b) => label.test(b))
        expect(bullet, `no computable-guardrail bullet matching ${label}`).toBeDefined()
        for (const needle of mustMention) {
          expect(bullet, `guardrail ${label} must defer to ${needle}`).toContain(needle)
        }
      },
    )

    it('output-schema.md defers the output contract to briefing.schema.ts', () => {
      expect(readFileSync(join(KNOWLEDGE, 'system/output-schema.md'), 'utf8')).toContain(
        'briefing.schema.ts',
      )
    })
  })

  describe('prose does not restate engine-owned numbers (derived from live constants)', () => {
    // Any numeric R/R ratio ("3:1", "2.5 : 1", ...) is engine-owned — banned
    // in ALL prose regardless of what DEFAULT_RR_MIN currently is, so a
    // future constant change cannot resurrect a stale ratio in prose.
    it.each(proseFiles.map((f) => [relName(f), f]))(
      '%s states no numeric R/R ratio',
      (_rel, path) => {
        const prose = readFileSync(path, 'utf8')
        expect(prose).not.toMatch(/\b\d+(?:\.\d+)?\s*:\s*1\b/)
        for (const spelling of numericSpellings(DEFAULT_RR_MIN)) {
          expect(prose).not.toContain(`${spelling}:1`)
        }
      },
    )

    // The Rip control-flip threshold (ripStatus.RED_EXTREME) must not appear
    // as a signed threshold in prose (ASCII or unicode minus). The pattern is
    // built from the live constant.
    it.each(proseFiles.map((f) => [relName(f), f]))(
      '%s does not restate the Rip Delta-Intensity threshold',
      (_rel, path) => {
        const magnitude = Math.abs(RED_EXTREME)
        const threshold = new RegExp(`(?<![\\dx.])[-−–]\\s?${magnitude}\\b`)
        expect(readFileSync(path, 'utf8')).not.toMatch(threshold)
      },
    )

    // Magnet proximity tolerance (magnetCheck.DEFAULT_MAGNET_TOLERANCE).
    it.each(proseFiles.map((f) => [relName(f), f]))(
      '%s does not restate the magnet tolerance in points/ticks',
      (_rel, path) => {
        const pattern = new RegExp(
          `\\b${DEFAULT_MAGNET_TOLERANCE}\\s*(?:-\\s*)?(?:points?|pts?|ticks?)\\b`,
          'i',
        )
        expect(readFileSync(path, 'utf8')).not.toMatch(pattern)
      },
    )

    // Staleness margin (staleness.DEFAULT_STALENESS_MARGIN_MS).
    it.each(proseFiles.map((f) => [relName(f), f]))(
      '%s does not restate the staleness margin',
      (_rel, path) => {
        const prose = readFileSync(path, 'utf8')
        const seconds = DEFAULT_STALENESS_MARGIN_MS / 1000
        const minutes = DEFAULT_STALENESS_MARGIN_MS / 60_000
        expect(prose).not.toMatch(
          new RegExp(`\\b${seconds}\\s*(?:-\\s*)?s(?:ec(?:onds?)?)?\\b`, 'i'),
        )
        if (Number.isInteger(minutes)) {
          expect(prose).not.toMatch(
            new RegExp(`\\b${minutes}\\s*(?:-\\s*)?min(?:utes?)?\\b`, 'i'),
          )
        }
      },
    )

    // Near-entry proximity gate (proximity.DEFAULT_NEAR_ENTRY_POINTS).
    it.each(proseFiles.map((f) => [relName(f), f]))(
      '%s does not restate the near-entry proximity in points',
      (_rel, path) => {
        const pattern = new RegExp(
          `\\b${DEFAULT_NEAR_ENTRY_POINTS}\\s*(?:NQ\\s+)?(?:points?|pts?)\\b`,
          'i',
        )
        expect(readFileSync(path, 'utf8')).not.toMatch(pattern)
      },
    )
  })
})
