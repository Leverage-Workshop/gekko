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
 * guarded the DATA ↔ PROMPT contract itself — which the feat-046…053 export
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
  tpoDataContent: chartData('tpo.data.md'),
  dailyVaContent: chartData('daily-value-areas.csv'),
  htfCsvContent: chartData('htf_bar_data.rolling.csv'),
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
  significantMoveSigma: 0.3,
  executionBarVolume: 750,
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

    it('value migration is a vision read exactly while no value-area history fact exists (feat-048)', () => {
      const hasValueMigrationFact = payloadKeys.some((key) => /valueMigration/.test(key))
      if (hasValueMigrationFact) {
        expect(
          visionLine,
          'a numeric value-migration fact landed (feat-048) but the prompt still sends the ' +
            'model to the screenshots for the value-migration read — narrate it from ' +
            '`valueMigration` instead',
        ).not.toMatch(/value-migration/i)
      } else {
        expect(visionLine).toMatch(/value-migration/)
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

  describe('per-run preamble stays deduplicated vs the cached prefix (feat-080)', () => {
    // Codex adversarial review finding #5: the user message restated 4–31 lines
    // of system doctrine, and the copies drifted twice (target cardinality,
    // bar size). Each rule lives in exactly ONE home: static doctrine in the
    // cached prefix, live values + pointers in the user message. These canary
    // phrases are prefix-owned doctrine that the pre-dedup user bullets
    // restated verbatim — if one reappears in the built user prompt, a
    // restatement crept back in.
    const PREFIX_OWNED_CANARIES = [
      // [phrase proving the doctrine lives in the prefix, restatement phrase the
      //  pre-dedup user bullet carried and must not carry again]
      // fakeout-tail fade doctrine (Objective contract)
      ['being actively repaired', 'actively repairing the tail'],
      // pattern-scan tristate semantics (Active Pattern Scan contract)
      ['ambiguous shape', 'ambiguous shape, mid-formation'],
      // overview register rules (Output Contract)
      ['recitation of dates', 'recitation of dates'],
      // rr doctrine restatement (Objective contract / Constraints)
      ['never on your structural stop', 'NOT your structural stop'],
    ] as const

    it.each(PREFIX_OWNED_CANARIES)(
      'the analyze user prompt does not restate prefix doctrine ("%s")',
      (prefixPhrase, forbiddenRestatement) => {
        expect(loadDoctrine('analyze', ROOT)).toContain(prefixPhrase)
        expect(analysisPrompt).not.toContain(forbiddenRestatement)
      },
    )
  })

  describe('the eval prefix carries no briefing-only doctrine (feat-081)', () => {
    // Codex adversarial eval-prompt review (2026-08-02) finding #1: the shared
    // system prefix mandated pre-ENTER checks (R/R gate to T2, Rip consult,
    // primary/secondary assignment, patternScan) whose inputs and output
    // fields the eval task does not have — an honest model had to ignore
    // "hard constraints" or fabricate the missing evidence. Each phrase below
    // is an objective-construction mandate: it must stay in the briefing
    // prefixes and must never re-enter the eval prefix.
    const evalPrefix = loadDoctrine('eval', ROOT)
    const briefingPrefixes = [loadDoctrine('analyze', ROOT), loadDoctrine('update', ROOT)]

    const BRIEFING_ONLY_MANDATES = [
      'Primary Objective', // the Law of Asymmetric Initiative
      'R/R', // the engine-computed risk/reward gate
      'T2', // final-target classification
      'Vanguard Protocol', // the always-consult-the-Rip mandate
      'Stops never widen', // position management
      'patternScan', // the Active Pattern Scan output obligation
    ] as const

    it.each(BRIEFING_ONLY_MANDATES)(
      'briefing prefixes keep "%s"; the eval prefix does not carry it',
      (phrase) => {
        for (const prefix of briefingPrefixes) {
          expect(prefix, `the briefing prefixes lost "${phrase}"`).toContain(phrase)
        }
        expect(
          evalPrefix,
          `"${phrase}" is an objective-construction mandate the eval task cannot satisfy — ` +
            'it re-entered the eval prefix',
        ).not.toContain(phrase)
      },
    )

    it('the eval prefix states the geometry-inheritance contract instead', () => {
      expect(evalPrefix).toContain('You never recompute risk/reward')
    })

    it('the eval user-message builder does not restate the absorption stall doctrine', () => {
      // The stall-confirmation semantics live in the Chart Reading prefix
      // (step 4); the user message carries candidate facts + a pointer. These
      // phrases are the restatement the pre-dedup builder carried.
      const builderSource = read('lib/eval/prompt.ts')
      expect(loadDoctrine('eval', ROOT)).toContain('A stall-confirmed candidate IS absorption')
      expect(builderSource).not.toContain('failed to keep price down')
      expect(builderSource).not.toContain('possibly aged out, not refuted')
    })

    it('the eval prompt states the configured execution-bar volume per run', () => {
      // The bar size is exporter metadata (config.execution_bar_volume) — the
      // cached prefixes must never hardcode it (the 2026-08-01 500-vs-750
      // drift, refound at a fixed "750" in the eval prefix on 2026-08-02).
      for (const prefix of [evalPrefix, ...briefingPrefixes]) {
        expect(prefix).not.toMatch(/750-volume/)
      }
      expect(read('lib/eval/prompt.ts')).toContain('${input.executionBarVolume}-volume bars')
    })

    it('the briefing prompts state the configured significant-move floor per run (feat-086)', () => {
      // The floor is config (significant_move_sigma) — the cached prefixes refer
      // to "the significant-move floor (stated in the user message)" and must
      // never hardcode the number; the user message states it per run.
      for (const prefix of briefingPrefixes) {
        expect(prefix).toContain('significant-move floor')
        expect(prefix).not.toMatch(/\b50[- ]pt.{0,12}floor/i)
      }
      expect(read('lib/analyze/prompt.ts')).toContain('SIGNIFICANT-MOVE FLOOR')
      expect(read('lib/update/prompt.ts')).toContain('SIGNIFICANT-MOVE FLOOR')
      // feat-096: the floor is a sigma MULTIPLE, injected with the point value
      // it resolves to on this run's measured scale. The resolved points lead —
      // the model quotes points, so it must reason in them — and the multiple
      // qualifies them. 0.3σ (feat-112, was 0.4σ) × the fixture bundle's
      // 300.92-pt recency-weighted session sigma (was 295.12 under the flat RMS).
      expect(analysisPrompt).toContain(
        'SIGNIFICANT-MOVE FLOOR (the binding number for entry selection): 90.28 pts (0.3σ of the measured 300.92-pt session sigma)',
      )
      // Never the bare multiple with no points attached.
      expect(analysisPrompt).not.toMatch(/floor[^.]{0,40}: 0\.3σ/)
    })

    it('the entry standoff and chase gates are injected in BOTH units (feat-096)', () => {
      // 0.005σ / 0.02σ of the fixture's 300.92-pt sigma = 1.5 / 6.02 pts.
      expect(analysisPrompt).toContain('must sit at least 1.5 pts (0.005σ) away from it')
      expect(analysisPrompt).toContain('more than 6.02 pts (0.02σ) beyond current price')
      // The cached prefix must not restate either number.
      for (const prefix of briefingPrefixes) {
        expect(prefix).not.toMatch(/\b1[- ]pt standoff/i)
      }
    })
  })

  describe('prompt size budgets (chars; bump consciously, in this diff)', () => {
    // Measured 2026-07-24: analyze 29_141 / update 28_881 / eval 29_302.
    // Raised 2026-07-29 (feat-068): the narrative-overview contract grew
    // output-briefing.md — analyze measured 37_323.
    // Raised 2026-08-01 (feat-074): the fakeout-formed-extreme anchor carve-out
    // grew output-objective.md — analyze measured 39_127.
    // Raised 2026-08-01 (feat-077/078/080): the No-trade abstention section,
    // the Active Pattern Scan contract (moved INTO patterns.md from the per-run
    // user messages by the feat-080 dedup) and the LVN-node anchor sentence
    // grew the prefix — analyze measured 41_858. Net win: the prefix is cached
    // once; the user-message text it replaced was paid on every run.
    // Floors catch accidental truncation (a doctrine file emptied or dropped
    // from assembly); ceilings catch silent bloat from new data.
    // Ceiling bumped 43k → 47k for feat-086: the entry-first objective
    // contract added the selection-walk preamble and target-demotion prose to
    // output-objective.md.
    // Bumped 47k → 48k 2026-08-09 (feat-100, landing on feat-108's 46_757):
    // the extension-distribution sanity check on target rungs went into
    // output-objective.md rather than the per-run message, which is the whole
    // point of this split — the prefix is cached ONCE per model version, the
    // user message is paid every run, and that trade is exactly what let the
    // analyze user-prompt ceiling come DOWN 106k → 100k in the same diff.
    // Measured 47_248.
    // Bumped 48k → 49k 2026-08-10 (feat-111): the two Job Pivot glossary rows
    // and the pivots-are-bias-filters tiering note went into doctrine/glossary.md
    // — definitions belong in the cached prefix; only the live read of the two
    // levels is paid per run (MGI_STRUCTURE_RULE). Measured 48_438.
    const PREFIX_BUDGET = { floor: 20_000, ceiling: 49_000 }

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
      // Raised 80k → 85k 2026-07-29 (feat-063/064): the sessionIntraday +
      // intradayTrend facts and their guide lines added ~2k of legitimately
      // new, already-compact data (measured 81_819).
      // Raised 85k → 87k 2026-07-30 (feat-069): the `shallow` flag on every
      // border verdict (AAA valley-depth transparency, mirroring `faint`)
      // added ~850 chars of boolean fields (measured 85_850).
      // Raised 87k → 91k 2026-07-30 (feat-071): the multiDayTpo composite
      // (composite POC/VA/range, ≤3 HVNs, ≤3 LVNs, 5-session walk) plus its
      // ownership bullet added ~2.8k of already-projected data (measured 88_613).
      // Raised 91k → 92k 2026-08-01 (feat-077/078): the noTrade-abstention slot
      // bullet and the structured patternScan instructions added ~1.1k of rule
      // text (measured 91_394).
      // Lowered back 92k → 91k 2026-08-01 (feat-080): the per-run preamble
      // dedup moved static doctrine restatements into the cached prefix and
      // trimmed the user bullets to pointers + live values (measured 88_441).
      // Raised 91k → 93k 2026-08-09 (feat-094): the relativeVolume fact (the
      // latest completed 30-min slot, ≤6 recent slots, session-so-far and the
      // day-level companion, all already reduced to scalars) plus its
      // ownership bullet added ~1.6k (measured 92_127). Accepted knowingly:
      // RVOL is the confidence gate every other order-flow fact is read
      // through, and the alternative — the model eyeballing participation off
      // the execution chart — is the vision read this feature replaces.
      // Raised 93k → 95k 2026-08-09 (feat-091): `tpo.excess` (two tails of
      // seven scalars each plus three session counters) and its ownership
      // bullet added ~1.9k (measured 94_017). Accepted knowingly: the tails
      // are the review's D2 finding — a 208-pt buying tail that reached the
      // model only as pixels on the TPO screenshot — and the fact is what
      // replaces that vision read.
      // Raised 2026-08-09 (feat-095): the volatilityScale fact (two estimators
      // at two granularities, median bar/session ranges, and four
      // sigma-normalized structure distances) plus its ownership bullet added
      // ~2.5k of already-projected data.
      // RECONCILED 2026-08-09 → 98k: feat-091, feat-094 and feat-095 were
      // developed in parallel against the same 91k base, so each measured only
      // its own ~+2k and each raised the ceiling independently. Together they
      // measure 96_217. All three were kept — TPO excess, RVOL and the
      // volatility scale answer different questions (what the auction rejected,
      // whether participation backs the move, and whether a point distance is
      // meaningful), each replaces a vision read, and none is inlined raw.
      // 98k is a deliberate stop, not a running total: the next fact to land
      // here should trim something before it bumps this number again.
      // feat-097 (session-VWAP sigma bands + `vwapRungs`) landed under this
      // ceiling WITHOUT raising it, per the stop above: its guide bullet was
      // written tight and the rungs are the compact form of numbers already in
      // `sigmaBands` (measured 97_731 — 269 chars of headroom left).
      // Raised 98k → 101k 2026-08-09 (feat-093): `tpo.classification` — day
      // type, open type, the IB→day-range extension with its empirical band,
      // range extension by period and the high/low periods — plus its
      // ownership bullet. Taken WITH the trim the stop above asks for, not
      // instead of it: the fact was cut from +3_056 to +2_588 chars before
      // this bump (per-period extension filtered to extension EVENTS rather
      // than all 13 periods, then stripped of the running high/low each event
      // implies; `dayRange` dropped because `tpo.sessionRange` already carries
      // it; `periodCount` dropped as `periods.length`; the reference
      // distribution cut to the two quantiles the ladder actually cuts at),
      // and the guide bullet was rewritten tight. Measured 100_319. What is
      // left is irreducibly new: day type
      // and open type are canonical Market Profile reads the doctrine leans
      // on that the engine had NO name for — they reached the model only as
      // pixels on the TPO screenshot (review C2) — and the bullet has to
      // teach two closed enums plus how to trade each day type, since neither
      // appears anywhere in the cached prefix. The stop stands: the next fact
      // to land here should trim before it bumps this number again.
      // feat-096 (2026-08-09) took the trim instruction too and did NOT bump
      // this number: stating each gate in BOTH units (resolved points + the
      // sigma multiple) is that feature's headline requirement and cost ~135
      // chars, so the interpretive half — "rescaled every run so the floor
      // tracks the regime" — moved into the cached output-objective.md prefix
      // (feat-097's pattern), leaving +84 net. It measured 97_815 against the
      // then-98k stop and re-measured after rebasing onto feat-093's 101k
      // ceiling. The user message keeps only live numbers.
      // Raised 101k → 104k 2026-08-09 (feat-089), honouring the same stop by
      // trimming first: the `developingSession` fact drops the three fields that
      // duplicated its own top-level scalars (`rthSessionMinutes`,
      // `maturity.volume.sessionVolume`, `maturity.range.rangePts`), its guide
      // bullet was cut ~25%, and both split warnings were shortened. What
      // remains (measured 102_435) is the live session's volume value area and
      // its maturity qualifier. Accepted knowingly: unlike the facts above,
      // this row was ALREADY inside every bundle — silently corrupting
      // `valueMigration.priorDay` into TODAY — so the choice was never "carry
      // it or not" but "carry it labelled or carry it lying". The stop stands:
      // the next fact to land here trims before it bumps.
      // Raised 104k → 106k 2026-08-09 (feat-090), trimming first as the stop
      // above demands. Promoting the prior completed session's value area to
      // RVAH/RVAL/RPOC (Daily MGI Priority ranks 4–5) costs ~6.4k: three MGI
      // levels that each earn a FULL terrain verdict (~660 chars apiece) plus
      // their entries in the level list and the priority sort — that verdict is
      // the whole point, since it is what makes them anchorable. Paid for by
      // dropping the biggest duplication in the payload: `mgiPriority.tier1`
      // and `mgiPriority.dailyPrioritySort` were re-serializing 33 level
      // objects that `mgiPriority.levels` already carries two lines above them,
      // and are now "LABEL PRICE #rank" strings — the ordering is what those
      // views are FOR, and it survives intact (−3_738). Net +2_628, measured
      // 105_063. The new anchoring prose went into the cached
      // output-objective.md prefix (feat-096's pattern), costing this budget
      // nothing. The stop still stands for the next fact.
      // LOWERED 106k → 100k 2026-08-09 (feat-100), the first move DOWN in this
      // gate's history, measured on top of feat-108. The IB→day-range extension
      // fact costs 1_060 chars (the day/IB quantiles with their sample size,
      // today's IB, and each quantile projected into a price); its interpretive
      // half went into the cached output-objective.md prefix per feat-096/097.
      // It is paid for many times over by harvesting the second half of the
      // duplication feat-090 flagged (feat-108 took the first, compacting the
      // composite borders' members): `terrain.partitions` is literally
      // `terrain.levels.filter(v => v.hard)` — the SAME verdict objects,
      // re-serialized in full (−10_528 chars) two keys below the list they came
      // from, named by no prompt line, no doctrine file and no output field,
      // and the merged result the model actually reasons about is
      // `terrain.borders`. Measured 93_630 with both trims in place. The
      // ceiling comes down with the payload so the gate keeps biting; the stop
      // feat-089/090 recorded still stands for the next fact to land here.
      expect(analysisPrompt.length).toBeGreaterThan(35_000)
      expect(
        analysisPrompt.length,
        'the analyze user prompt grew past 100k chars on the fixture bundle — project or ' +
          'summarize new data instead of inlining it, or consciously raise this budget',
      ).toBeLessThan(100_000)
    })
  })
})
