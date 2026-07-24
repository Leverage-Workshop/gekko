import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAnalysisPrompt, computeEngineFacts, loadDoctrine } from '@/lib/analyze'
import { factsPayload } from '@/lib/analyze/prompt'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { FILE_FIELDS, MGI_FIELD } from '@/lib/ingest/manifest'

/**
 * feat-054 — Prompt–data sync gate.
 *
 * PR #79 put every rule in exactly one home (engine constants → code, doctrine →
 * cached prefix, per-run data → user message). The drift guards (feat-032,
 * knowledge-restructure) keep *numbers and prose hygiene* in sync, but nothing
 * guarded the DATA ↔ PROMPT contract itself — which the feat-047…053 export
 * backlog is about to stress. This gate closes that gap, dynamically (derived
 * from the live manifest, the live payload built from the real chart-data
 * fixtures, and the live prompt builders — never a prose snapshot):
 *
 *  1. REGISTRY — every bundle export (lib/ingest/manifest.ts) has a row in the
 *     "Bundle exports" table of docs/engine-ownership.md naming its consumer
 *     and model surface; every listed module exists; the surfaced keys are
 *     exactly the factsPayload keys. New data cannot arrive orphaned, and
 *     facts cannot be computed without deciding where the model sees them.
 *  2. FACT PATHS — every `engine.fact.path` the prompt builders and doctrine
 *     prose name must resolve against the payload actually built from the
 *     fixture bundle, so a fact rename cannot leave stale pointers in prose.
 *  3. VISION EXCLUSIVITY — the analyze prompt may send the model to the
 *     screenshots only for what the numeric data cannot give. Each vision read
 *     is paired with the numeric capability that will replace it (feat-046
 *     numeric TPO, feat-047 bar volume, feat-049 HTF bars); when the
 *     capability lands, the matching vision instruction MUST move — in the
 *     same change — or this gate fails.
 *  4. SIZE BUDGETS — cached prefixes and the fixture user prompt stay inside
 *     committed character budgets, so new data tables cannot silently balloon
 *     token cost; growing past a budget means consciously bumping the number
 *     here, where a reviewer sees it.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// ---------------------------------------------------------------------------
// Fixture bundle → live engine facts → the exact payload the model receives.
// ---------------------------------------------------------------------------

const chartData = (name: string) => read(join('chart-data', name))
const execCsvContent = chartData('execution_bar_data.rolling.csv')
const mgi = JSON.parse(chartData('mgi_static_levels.json')) as MgiStaticLevels

const NOW = '2026-06-16T16:00:00Z'
const facts = computeEngineFacts({
  rotationVbpContent: chartData('four-hundred-rotation.vbp.md'),
  balanceAreaVbpContent: chartData('balance-area.vbp.md'),
  halfRotationDeltaContent: chartData('half-rotation-delta.vbp.md'),
  fullRotationDeltaContent: chartData('full-rotation-delta.vbp.md'),
  execCsvContent,
  mgi,
  receivedAt: NOW,
  now: NOW,
})
const payload = factsPayload(facts)
const payloadKeys = Object.keys(payload)

const analysisPrompt = buildAnalysisPrompt({
  triggerReason: 'manual',
  now: NOW,
  facts,
  rawMgi: mgi,
  charts: [
    { label: 'HTF planning chart (30-min, 90-day)' },
    { label: 'TPO / Market Profile chart' },
    { label: 'Execution chart (short timeframe)' },
  ],
  rrMin: 3,
})

// ---------------------------------------------------------------------------
// The registry table in docs/engine-ownership.md.
// ---------------------------------------------------------------------------

type RegistryRow = { field: string; file: string; consumer: string; surfaces: string }

const ownershipMap = read('docs/engine-ownership.md')
const registrySection =
  ownershipMap.split(/^## Bundle exports.*$/m)[1]?.split(/^## /m)[0] ?? ''

const registryRows: RegistryRow[] = registrySection
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .filter((cells) => cells.length >= 5)
  .map((cells) => ({ field: cells[1], file: cells[2], consumer: cells[3], surfaces: cells[4] }))
  // drop the header and the `| --- |` divider
  .filter((row) => row.field !== 'Field' && !/^-+$/.test(row.field))

const manifestFields = [...FILE_FIELDS.map((f) => f.field), MGI_FIELD]

describe('prompt-data sync gate (feat-054)', () => {
  describe('bundle registry: docs/engine-ownership.md § Bundle exports', () => {
    it('has a parseable Bundle exports table', () => {
      expect(registrySection, 'docs/engine-ownership.md lost its "## Bundle exports" section').toBeTruthy()
      expect(registryRows.length).toBeGreaterThanOrEqual(manifestFields.length)
    })

    it.each(manifestFields)('manifest field %s has a registry row', (field) => {
      const row = registryRows.find((r) => r.field.includes(`\`${field}\``))
      expect(
        row,
        `manifest field "${field}" has no row in the Bundle exports table — a bundle export ` +
          `must declare its consumer and model surface before it can land`,
      ).toBeDefined()
      expect(row!.consumer.length).toBeGreaterThan(0)
      expect(row!.surfaces.length).toBeGreaterThan(0)
    })

    it('names no manifest field that no longer exists', () => {
      for (const row of registryRows) {
        const named = row.field.match(/`([\w]+)`/)?.[1]
        if (!named) continue // the cross-cutting "(engine pass)" row
        expect(
          manifestFields,
          `registry row for "${named}" is stale — no such field in lib/ingest/manifest.ts`,
        ).toContain(named)
      }
    })

    it('every module path the registry names exists on disk', () => {
      const paths = [...new Set(registrySection.match(/\blib\/[\w/.-]+\.ts\b/g) ?? [])]
      expect(paths.length).toBeGreaterThan(0)
      for (const path of paths) {
        expect(existsSync(join(ROOT, path)), `registry names missing module ${path}`).toBe(true)
      }
    })

    it('surfaces exactly the factsPayload keys — no orphaned facts, no stale rows', () => {
      // Backticked single-segment tokens in the Surfaces column are payload-key
      // claims (dotted tokens like meta.htfTrend are output-schema refs; the
      // `mgi_json` blob is surfaced verbatim, not a payload key).
      const surfaced = new Set(
        registryRows
          .flatMap((row) => [...row.surfaces.matchAll(/`([A-Za-z_$][\w$]*)`/g)])
          .map((m) => m[1])
          .filter((token) => token !== 'mgi_json'),
      )
      for (const key of payloadKeys) {
        expect(
          surfaced.has(key),
          `factsPayload key "${key}" is not surfaced by any Bundle exports row — new engine ` +
            `facts need a registry entry saying which export feeds them`,
        ).toBe(true)
      }
      for (const token of surfaced) {
        expect(
          payloadKeys,
          `Bundle exports table surfaces "${token}", which is not a factsPayload key — stale row?`,
        ).toContain(token)
      }
    })
  })

  describe('fact paths named in prose resolve against the live payload', () => {
    /** Walk a dotted path (with optional [] segments) through the payload. */
    function resolves(path: string): boolean {
      const segments = path.split('.').map((s) => s.replace(/\[\]$/, ''))
      let node: unknown = payload
      for (const segment of segments) {
        if (Array.isArray(node)) {
          if (node.length === 0) return true // empty on this fixture — cannot verify deeper
          node = node[0]
        }
        if (node === null || typeof node !== 'object') return false
        if (!(segment in (node as Record<string, unknown>))) return false
        node = (node as Record<string, unknown>)[segment]
      }
      return true
    }

    /** Backticked identifier paths whose root is a payload key. */
    function factRefs(text: string): string[] {
      const normalized = text.replace(/\\`/g, '`')
      return [
        ...new Set(
          [...normalized.matchAll(/`([A-Za-z_$][\w$]*(?:\.[\w$[\]]+)*)`/g)]
            .map((m) => m[1])
            .filter((token) => payloadKeys.includes(token.split('.')[0])),
        ),
      ]
    }

    const sources: Array<[string, string]> = [
      ['lib/analyze/prompt.ts', read('lib/analyze/prompt.ts')],
      ['lib/update/prompt.ts', read('lib/update/prompt.ts')],
      ['lib/eval/prompt.ts', read('lib/eval/prompt.ts')],
      ['doctrine prefix (analyze)', loadDoctrine('analyze', ROOT)],
      ['doctrine prefix (update)', loadDoctrine('update', ROOT)],
      ['doctrine prefix (eval)', loadDoctrine('eval', ROOT)],
      ['built analyze prompt', analysisPrompt],
    ]

    it.each(sources.map(([name, text]) => [name, text] as const))(
      '%s names only resolvable fact paths',
      (_name, text) => {
        const refs = factRefs(text)
        for (const ref of refs) {
          expect(
            resolves(ref),
            `"${ref}" does not resolve against the payload built from the fixture bundle — ` +
              `renamed or removed fact with a stale prose pointer`,
          ).toBe(true)
        }
      },
    )

    it('the fixture actually exercises the deep terrain paths', () => {
      // Guards the resolver itself: if the fixture ever stops producing
      // composite borders/demotions, the [] walks above degrade to vacuous.
      expect(facts.terrain.borders.length).toBeGreaterThan(0)
      expect(facts.terrain.borders[0].members.length).toBeGreaterThan(0)
      expect(facts.terrain.demoted.length).toBeGreaterThan(0)
    })
  })

  describe('vision reads stay exclusive to what the numbers cannot give', () => {
    const visionLine = analysisPrompt
      .split('\n')
      .find((line) => line.startsWith('- Read the attached screenshots ONLY'))

    it('the analyze prompt still scopes screenshots to perception-only', () => {
      expect(visionLine, 'the screenshots-ONLY scoping line left the analyze prompt').toBeDefined()
    })

    // Each pair: [capability signal in the numeric data] <-> [vision instruction].
    // While the capability is absent the instruction MUST be present (the model
    // has no other source); once the capability lands (feat-046/046/048) the
    // instruction MUST leave the prompt in the same change — the engine fact is
    // then authoritative and the doctrine forbids re-deriving it from a PNG.

    it('TPO features are vision-only exactly while no numeric TPO fact exists (feat-046)', () => {
      const hasTpoFact = payloadKeys.some((key) => /tpo/i.test(key))
      if (hasTpoFact) {
        expect(
          visionLine,
          'a numeric TPO fact landed (feat-046) but the prompt still sends the model to the ' +
            'screenshot for TPO reads — move single prints / poor highs-lows to engine facts',
        ).not.toMatch(/TPO/i)
      } else {
        expect(visionLine).toMatch(/TPO single prints/)
      }
    })

    it('HTF trend is a vision read exactly while no numeric HTF fact exists (feat-049)', () => {
      const hasHtfFact = payloadKeys.some((key) => /htf/i.test(key))
      if (hasHtfFact) {
        expect(
          analysisPrompt,
          'a numeric HTF fact landed (feat-049) but meta.htfTrend is still asked for as a pure ' +
            'planning-chart read — derive/verify it from the HTF bars instead',
        ).not.toMatch(/htfTrend = your HTF trend read/)
      } else {
        expect(analysisPrompt).toMatch(/htfTrend = your HTF trend read from the planning chart/)
      }
    })

    it('absorption stall confirmation is chart-owned exactly while bars carry no volume (feat-047)', () => {
      const execHeader = execCsvContent.split(/\r?\n/, 1)[0]
      const hasBarVolume = /\b(?:Bid|Ask)Volume\b/.test(execHeader)
      if (hasBarVolume) {
        expect(
          analysisPrompt,
          'the execution bars now carry bid/ask volume (feat-047) but the prompt still delegates ' +
            'absorption stall confirmation solely to the execution chart — the engine can now ' +
            'verify heavy volume + no price progress at a candidate stack itself',
        ).not.toMatch(/execution chart shows price STALLED/)
      } else {
        expect(analysisPrompt).toMatch(/execution chart shows price STALLED/)
      }
    })
  })

  describe('prompt size budgets (chars; bump consciously, in this diff)', () => {
    // Measured 2026-07-24: analyze 29_141 / update 28_881 / eval 29_302.
    // Floors catch accidental truncation (a doctrine file emptied or dropped
    // from assembly); ceilings catch silent bloat from new data.
    const PREFIX_BUDGET = { floor: 20_000, ceiling: 36_000 }

    it.each(['analyze', 'update', 'eval'] as const)(
      'the %s cached prefix stays inside budget',
      (task) => {
        const size = loadDoctrine(task, ROOT).length
        expect(size).toBeGreaterThan(PREFIX_BUDGET.floor)
        expect(
          size,
          `the ${task} prefix grew past ${PREFIX_BUDGET.ceiling} chars — if intentional, raise ` +
            `the budget here so the growth is visible in the diff`,
        ).toBeLessThan(PREFIX_BUDGET.ceiling)
      },
    )

    it('the analyze user prompt on the fixture bundle stays inside budget', () => {
      // Measured 2026-07-24: 63_504 on the chart-data fixture bundle. New data
      // tables (TPO ladders, bar histories) must be summarized/projected, not
      // dumped — factsPayload is the compact projection for exactly this reason.
      expect(analysisPrompt.length).toBeGreaterThan(35_000)
      expect(
        analysisPrompt.length,
        'the analyze user prompt grew past 80k chars on the fixture bundle — project or ' +
          'summarize new data instead of inlining it, or consciously raise this budget',
      ).toBeLessThan(80_000)
    })
  })
})
