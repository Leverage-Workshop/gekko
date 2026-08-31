/**
 * Profile-vision bench (feat-124, docs/job-planning-task-plan.md "Bench").
 *
 *   RUN_LLM_INTEGRATION=1 npx tsx scripts/profile-vision-bench.ts \
 *     [--model <id>] [--effort <level>] [--variant <preset>] [--samples N] \
 *     [--source golden|fixtures|both] [--dates 2026-02-13,2026-08-07] [--report]
 *     [--timeout <seconds>]
 *
 * Renders each profile (feat-122), reads it S times with the vision model
 * (feat-123), reaches consensus, and scores the consensus nodes against the
 * golden labels / fixture labels (feat-120) — side by side with the code-owned
 * detector (lib/engine/lvnDetection.ts) on the SAME sources. Emits a per-model x
 * per-variant table; `--report` also writes docs/profile-vision-bench-<date>.md.
 *
 * GATING: this makes live, paid LLM calls, so it runs ONLY when
 * RUN_LLM_INTEGRATION=1 (NEVER on key presence — .env leaks into the shell, the
 * 2026-07-25/26 injection incidents; PR #96 re-gated live tests on this flag).
 * It is never run in CI. The pure scoring it uses lives in
 * lib/job-plan/profile-vision/bench.ts and IS unit-tested.
 *
 * Model candidates come from the OpenRouter models API AT BENCH TIME (not from
 * memory), filtered to image-input models with flash-tier excluded (they game
 * validation floors — docs/briefing-audit-2026-07-25.md). Responses are cached
 * under the scratchpad keyed by (image sha256, VISION_PROMPT_REVISION, model,
 * effort) — an ORDERED list of the S reads, so a warm rerun replays each
 * sample's distinct read (self-agreement stays honest) with its real cost/latency.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { detectLvnHvn } from '../lib/engine/lvnDetection'
import { loadLvnFixtures } from '../lib/engine/loadLvnFixtures'
import { parseVbpProfile, type VbpProfile } from '../lib/engine/parseProfile'
import { sumMetrics, type Metrics } from '../lib/engine/nodeMatch'
import { generateStructured } from '../lib/llm/generateStructured'
import type { ReasoningEffort } from '../lib/llm/reasoning'
import {
  consensusToScored,
  countDelta,
  detectorToScored,
  f1,
  labelToScored,
  nearest,
  overall,
  precision,
  recall,
  scoreCaseNodes,
  scorePrimary,
  selfAgreement,
  toleranceFor,
  type FamilyScores,
  type NamedLabels,
  type PrimaryOutcome,
  type ProfilePredictions,
  type ScoredNode,
} from '../lib/job-plan/profile-vision/bench'
import {
  loadGoldenSet,
  PROFILE_FILES,
  type GoldenDate,
  type GoldenLabel,
} from '../lib/job-plan/profile-vision/goldenSet'
import {
  identifyProfileNodes,
  type VisionGenerate,
} from '../lib/job-plan/profile-vision/identifyProfileNodes'
import type { Instrument } from '../lib/job-plan/profile-vision/instrument'
import {
  profileNodesReadSchema,
  type ProfileNodesRead,
} from '../lib/job-plan/profile-vision/schema'
import { VISION_PROMPT_REVISION } from '../lib/job-plan/profile-vision/prompt'
import { PROFILE_KEYS, type ProfileKey } from '../lib/job-plan/profile-vision/types'
import type { RenderOptions } from '../lib/job-plan/profile-vision/renderProfile'

// ---------------------------------------------------------------------------
// Bake-off variants (feat-122 RenderOptions presets).
// ---------------------------------------------------------------------------
const VARIANTS: Readonly<Record<string, Omit<RenderOptions, 'instrument' | 'currentPrice'>>> = {
  base: {},
  dark: { theme: 'dark' },
  envelope: { envelope: true },
  tiles: { tiles: 2 },
  'left-anchor': { barAnchor: 'left' },
  'dark-envelope': { theme: 'dark', envelope: true },
}

/** Vision-readable profile keys (feat-123). Golden `overnight` profiles have no vision key. */
const READABLE_KEYS: readonly ProfileKey[] = PROFILE_KEYS

type Args = {
  model: string | null
  effort: ReasoningEffort | null
  variant: string
  samples: number
  source: 'golden' | 'fixtures' | 'both'
  dates: string[] | null
  report: boolean
  /** Print per-case labels vs vision vs detector predictions. */
  detail: boolean
  /** Per-call timeout override in ms; null = identifyProfileNodes' default. */
  timeoutMs: number | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    model: null,
    effort: null,
    variant: 'base',
    samples: 3,
    source: 'both',
    dates: null,
    report: false,
    detail: false,
    timeoutMs: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--model') args.model = next()
    else if (a === '--effort') args.effort = next() as ReasoningEffort
    else if (a === '--variant') args.variant = next()
    else if (a === '--samples') args.samples = Number(next())
    else if (a === '--source') args.source = next() as Args['source']
    else if (a === '--dates') args.dates = next().split(',')
    else if (a === '--report') args.report = true
    else if (a === '--detail') args.detail = true
    else if (a === '--timeout') args.timeoutMs = Number(argv[++i]) * 1000
  }
  if (!(args.variant in VARIANTS)) {
    throw new Error(`unknown --variant ${args.variant}; one of ${Object.keys(VARIANTS).join(', ')}`)
  }
  return args
}

// ---------------------------------------------------------------------------
// Response cache: (image sha256, prompt revision, model, effort) -> ORDERED
// list of the reads seen for that image, each with cost/latency. A cold run
// appends live reads; a warm run replays them in order, one per sample, so
// self-agreement and cost/latency survive re-runs.
// ---------------------------------------------------------------------------
const CACHE_DIR = join(tmpdir(), 'gekko-profile-vision-bench-cache')

type CachedRead = { read: ProfileNodesRead; cost: number | null; latencyMs: number | null }
type CacheFile = { reads: CachedRead[] }

/**
 * Key a cached read on the ACTUAL PROMPT TEXT, not on VISION_PROMPT_REVISION.
 *
 * The revision is a hand-maintained label, and two branches independently
 * choosing the same one is not hypothetical: feat-135 and feat-136 both shipped
 * `vision-2026-08-30.8` with different criteria, and an A/B silently replayed
 * the other branch's answers as its own — caught only because the OpenRouter
 * balance moved $0.07 instead of $0.80. A content hash cannot collide that way.
 * The revision stays in the key so a deliberate bump still cold-starts.
 */
function cacheKey(
  imageSha: string,
  model: string,
  effort: ReasoningEffort | null,
  promptText: string
): string {
  const promptSha = createHash('sha256').update(promptText).digest('hex')
  return createHash('sha256')
    .update([imageSha, VISION_PROMPT_REVISION, promptSha, model, effort ?? 'default'].join('|'))
    .digest('hex')
}

function loadCacheFile(key: string): CacheFile {
  const path = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(path)) return { reads: [] }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { reads?: unknown[] }
  const reads: CachedRead[] = []
  for (const entry of raw.reads ?? []) {
    const e = entry as { read?: unknown; cost?: number | null; latencyMs?: number | null }
    const parsed = profileNodesReadSchema.safeParse(e.read)
    if (parsed.success) {
      reads.push({ read: parsed.data, cost: e.cost ?? null, latencyMs: e.latencyMs ?? null })
    }
  }
  return { reads }
}

function saveCacheFile(key: string, file: CacheFile): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(file))
}

/**
 * A caching wrapper over generateStructured shaped as the VisionGenerate dep.
 * Per image key it hands out the cached reads in order (one per call), and only
 * makes a live call when the cache is exhausted for this run — so S samples of
 * one image get S DISTINCT reads on both cold and warm runs, with real
 * cost/latency replayed.
 */
function makeGenerate(model: string, effort: ReasoningEffort | null): VisionGenerate {
  // One shared in-memory read list per key (loaded once from disk), so the S
  // concurrent calls for one image append to the SAME array instead of each
  // re-reading a stale disk snapshot and clobbering the others on save.
  const store = new Map<string, CachedRead[]>()
  const cursor = new Map<string, number>()
  const reads = (key: string): CachedRead[] => {
    let list = store.get(key)
    if (!list) {
      list = loadCacheFile(key).reads
      store.set(key, list)
    }
    return list
  }
  return async ({ schema, prompt, images, abortSignal }) => {
    const targetImage = images[images.length - 1]
    const imageSha = createHash('sha256').update(targetImage.base64).digest('hex')
    const key = cacheKey(imageSha, model, effort, prompt)
    const list = reads(key)
    const i = cursor.get(key) ?? 0
    cursor.set(key, i + 1)
    if (i < list.length) {
      const hit = list[i]
      // Replay only if the entry satisfies the schema THIS call wants; a cached
      // read of a different shape must fall through to a real call rather than
      // be handed back as if it fit (found while building feat-135).
      if (schema.safeParse(hit.read).success) {
        return { object: hit.read, cost: hit.cost, latencyMs: hit.latencyMs ?? 0 }
      }
    }
    const result = await generateStructured({
      model,
      effort,
      // The schema comes from identifyProfileNodes, never from this module:
      // hardcoding one here silently ignored what the caller asked for, so a
      // caller using a different read shape would have been sent the wrong
      // contract entirely (found while building feat-135).
      schema,
      prompt,
      images: [...images],
      abortSignal,
      // Never let a candidate be routed to an endpoint that ignores the schema.
      requireParameters: true,
    })
    list.push({ read: result.object, cost: result.cost, latencyMs: result.latencyMs })
    saveCacheFile(key, { reads: list })
    return { object: result.object, cost: result.cost, latencyMs: result.latencyMs }
  }
}

// ---------------------------------------------------------------------------
// Sources: golden dates (feat-119 profiles, may be absent) and lvn-fixtures.
// A CASE is a date (or a fixture): it may carry several profiles, its labels
// split into per-named-profile labels + `any` labels scored against the union.
// ---------------------------------------------------------------------------
type ProfileCase = {
  readonly id: string
  readonly instrument: Instrument
  /** Vision-readable profiles for this case, keyed by profile. */
  readonly profiles: Partial<Record<ProfileKey, VbpProfile>>
  /** Labels naming a specific readable profile, keyed by that profile. */
  readonly named: Partial<Record<ProfileKey, GoldenLabel[]>>
  /** `any` labels — scored ONCE against the union of the case's profiles. */
  readonly any: GoldenLabel[]
}

function goldenCases(dates: string[] | null): { cases: ProfileCase[]; skipped: string[] } {
  const set = loadGoldenSet()
  const cases: ProfileCase[] = []
  const skipped: string[] = []
  for (const d of set.dates) {
    if (d.role === 'fewShot') continue // never scored on the few-shot dates
    if (dates && !dates.includes(d.date)) continue
    const profiles = readableProfiles(d)
    if (Object.keys(profiles).length === 0) {
      skipped.push(d.date)
      continue
    }
    const named: Partial<Record<ProfileKey, GoldenLabel[]>> = {}
    for (const key of Object.keys(profiles) as ProfileKey[]) {
      const labels = d.labels.filter((l) => l.profile === key)
      if (labels.length > 0) named[key] = labels
    }
    cases.push({
      id: d.date,
      instrument: d.instrument,
      profiles,
      named,
      any: d.labels.filter((l) => l.profile === 'any'),
    })
  }
  return { cases, skipped }
}

function readableProfiles(d: GoldenDate): Partial<Record<ProfileKey, VbpProfile>> {
  const out: Partial<Record<ProfileKey, VbpProfile>> = {}
  for (const key of READABLE_KEYS) {
    if (!d.profilesPresent.includes(key)) continue
    const path = join('chart-data/job-lvn-golden', d.date, PROFILE_FILES[key])
    // feat-118's exporter omits zero-volume rows; zero-fill them (feat-131).
    out[key] = parseVbpProfile(readFileSync(path, 'utf8'), { fillMissingRows: true })
  }
  return out
}

function fixtureCases(): ProfileCase[] {
  // fixture labels are prices split lvn/hvn (no kind granularity, no primary);
  // one profile per fixture, all labels `any`.
  const { fixtures } = loadLvnFixtures({ strict: true })
  return fixtures.map((fx) => ({
    id: `fixture:${fx.id}`,
    instrument: 'NQ' as const,
    profiles: { '5d': { rows: fx.rows, meta: fx.meta } },
    named: {},
    any: [
      ...fx.labels.lvn.map((p, i) => label('NQ', 'lvn', p, i)),
      ...fx.labels.hvn.map((p, i) => label('NQ', 'hvn-core', p, i + 1000)),
    ],
  }))
}

function label(
  instrument: Instrument,
  kind: GoldenLabel['kind'],
  price: number,
  i: number
): GoldenLabel {
  return {
    instrument,
    profile: 'any',
    kind,
    priceLow: price,
    priceHigh: price,
    primary: false,
    corpusRef: i + 1,
    verbatim: 'fixture',
    source: 'corpus',
  }
}

// ---------------------------------------------------------------------------
// Scoring one case with the vision read and with the detector.
// ---------------------------------------------------------------------------
type CaseResult = {
  readonly id: string
  readonly vision: FamilyScores // always present — a failed read scores as all-miss
  readonly detector: FamilyScores
  readonly primary: PrimaryOutcome
  readonly self: number | null
  readonly costUsd: number
  readonly latencyMs: number
  /** True when EVERY readable profile's consensus was unavailable (R14). */
  readonly failed: boolean
  /**
   * Distinct error messages from individual vision calls (feat-131). A call can
   * fail for two very different reasons — the model refused the JSON schema, or
   * it produced a structurally valid but contradictory read that `superRefine`
   * rejected — and NONE of the superRefine rules are expressible in JSON Schema,
   * so no model is constrained by them. Without the reason surfaced, a
   * schema-compliance failure is indistinguishable from bad chart reading.
   */
  readonly errors: readonly string[]
  /** Individual vision calls made for this case (samples x tiles x profiles). */
  readonly calls: number
  /** Of those, how many came back ok. */
  readonly okCalls: number
}

async function scoreCase(
  pc: ProfileCase,
  args: Args,
  generate: VisionGenerate
): Promise<CaseResult> {
  const tolerance = toleranceFor(pc.instrument)
  const keys = Object.keys(pc.profiles) as ProfileKey[]
  const named: NamedLabels[] = keys.map((key) => ({
    key,
    labels: (pc.named[key] ?? []).map(labelToScored),
  }))
  const anyLabels = pc.any.map(labelToScored)

  // Detector (code-owned): one prediction set per profile, scored one-to-one
  // across the case (named labels bound to their profile, `any` to the union).
  const detectorPreds: ProfilePredictions[] = keys.map((key) => {
    const det = detectLvnHvn(pc.profiles[key]!.rows)
    return {
      key,
      nodes: detectorToScored(
        det.lvn.map((n) => n.price),
        det.hvn.map((n) => n.price)
      ),
    }
  })
  const detector = scoreCaseNodes(detectorPreds, named, anyLabels, tolerance)

  // Vision read: all readable profiles at once, S samples each.
  const result = await identifyProfileNodes({
    instrument: pc.instrument,
    currentPrice: null,
    profiles: pc.profiles,
    render: VARIANTS[args.variant],
    samples: args.samples,
    modelId: args.model!,
    effort: args.effort,
    generate,
    ...(args.timeoutMs === null ? {} : { timeoutMs: args.timeoutMs }),
  })

  const visionPreds: ProfilePredictions[] = []
  const primaryByKey = new Map<ProfileKey, ScoredNode>()
  const selfs: number[] = []
  let costUsd = 0
  let latencyMs = 0
  let anyConsensus = false
  const errors: string[] = []
  let calls = 0
  let okCalls = 0

  for (const key of keys) {
    const entry = result.profiles[key]
    for (const r of entry?.raw ?? []) {
      costUsd += r.cost ?? 0
      latencyMs += r.latencyMs ?? 0
      calls += 1
      if (r.ok) okCalls += 1
      // Every occurrence, not a per-case set: three identical timeouts in one
      // case are three failures, and collapsing them understates the rate the
      // model selection is being judged on.
      if (r.error) errors.push(r.error)
    }
    const consensus = entry?.consensus
    // A failed consensus contributes an empty prediction set — its labels become
    // pure false negatives rather than vanishing from the score.
    visionPreds.push({ key, nodes: consensus ? consensus.nodes.map(consensusToScored) : [] })
    if (consensus) {
      anyConsensus = true
      const primaryNode = consensus.nodes.find((n) => n.primary)
      if (primaryNode) primaryByKey.set(key, consensusToScored(primaryNode))
      const s = perProfileSelf(entry?.raw ?? [], tolerance)
      if (s !== null) selfs.push(s)
    }
  }

  const vision = scoreCaseNodes(visionPreds, named, anyLabels, tolerance)

  if (args.detail) {
    const fmt = (n: { price: number }) => n.price.toFixed(2)
    console.log(`\n--- ${pc.id} (${pc.instrument}, tol ${tolerance})`)
    for (const { key, labels } of named) {
      if (labels.length === 0) continue
      console.log(`  labels[${key}]: ${labels.map(fmt).join(', ')}`)
    }
    if (anyLabels.length > 0) console.log(`  labels[any]: ${anyLabels.map(fmt).join(', ')}`)
    for (const vp of visionPreds) {
      const nearestTo = (t: number) =>
        vp.nodes.length === 0
          ? 'n/a'
          : Math.min(...vp.nodes.map((n) => Math.abs(n.price - t))).toFixed(2)
      const targets = [...(named.find((n) => n.key === vp.key)?.labels ?? []), ...anyLabels]
      console.log(
        `  vision[${vp.key}] ${vp.nodes.length} nodes: ${vp.nodes.map(fmt).join(', ')}` +
          (targets.length > 0 ? `  | miss-distance: ${targets.map((t) => nearestTo(t.price)).join(', ')}` : '')
      )
    }
    for (const dp of detectorPreds) {
      const targets = [...(named.find((n) => n.key === dp.key)?.labels ?? []), ...anyLabels]
      const nearestTo = (t: number) =>
        dp.nodes.length === 0
          ? 'n/a'
          : Math.min(...dp.nodes.map((n) => Math.abs(n.price - t))).toFixed(2)
      console.log(
        `  detect[${dp.key}] ${dp.nodes.length} nodes` +
          (targets.length > 0
            ? `  | miss-distance: ${targets.map((t) => nearestTo(t.price)).join(', ')}`
            : '')
      )
    }
    // How far off is the read when the label's profile binding is ignored? A
    // label naming the 5-day that the model found on the 4-hour is a labeling
    // detail, not a misread - Job named a PRICE.
    const allVision = visionPreds.flatMap((v) => v.nodes)
    const allLabels = [...named.flatMap((n) => n.labels), ...anyLabels]
    if (allLabels.length > 0 && allVision.length > 0) {
      console.log(
        `  vision[any-profile] miss-distance: ${allLabels
          .map((t) => Math.min(...allVision.map((n) => Math.abs(n.price - t.price))).toFixed(2))
          .join(', ')}`
      )
    }
  }

  // The labeled primary is scored against the primary of ITS profile (a named
  // label) or, for an `any` primary, any profile's primary (the union).
  const namedPrimary = keys
    .flatMap((key) =>
      (pc.named[key] ?? []).filter((l) => l.primary).map((l) => ({ key, label: l }))
    )
    .at(0)
  const anyPrimary = pc.any.find((l) => l.primary)
  const labeledPrimary = namedPrimary?.label ?? anyPrimary ?? null
  // Named primary: only ITS profile's primary can satisfy it. `any` primary: the
  // NEAREST primary across all profiles (a hit if any is within tolerance).
  const predictedPrimary = namedPrimary
    ? (primaryByKey.get(namedPrimary.key) ?? null)
    : labeledPrimary
      ? nearest([...primaryByKey.values()], labelToScored(labeledPrimary).price)
      : null
  const primary = scorePrimary(
    labeledPrimary ? predictedPrimary : null,
    labeledPrimary ? labelToScored(labeledPrimary) : null,
    tolerance
  )

  return {
    id: pc.id,
    vision,
    detector,
    primary,
    self: selfs.length === 0 ? null : selfs.reduce((a, b) => a + b, 0) / selfs.length,
    costUsd,
    latencyMs,
    failed: !anyConsensus,
    errors,
    calls,
    okCalls,
  }
}

function perProfileSelf(
  raw: readonly { ok: boolean; read: ProfileNodesRead | null; sample: number }[],
  tolerance: number
): number | null {
  const bySample = new Map<number, ScoredNode[]>()
  for (const r of raw) {
    if (!r.ok || !r.read) continue
    const nodes = r.read.nodes.map((n) => consensusToScored({ ...n, agreement: 1, samples: 1 }))
    bySample.set(r.sample, [...(bySample.get(r.sample) ?? []), ...nodes])
  }
  return selfAgreement([...bySample.values()], tolerance)
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------
function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

function aggregateFamily(
  cases: readonly CaseResult[],
  pick: (c: CaseResult) => FamilyScores
): Metrics {
  return cases
    .map((c) => overall(pick(c)))
    .reduce(sumMetrics, {
      tp: 0,
      fp: 0,
      fn: 0,
      detected: 0,
      labeled: 0,
    })
}

function summarize(cases: readonly CaseResult[]) {
  const vision = aggregateFamily(cases, (c) => c.vision)
  const detector = aggregateFamily(cases, (c) => c.detector)
  const primaries = cases.filter((c) => c.primary !== 'not_applicable')
  const primaryHits = primaries.filter((c) => c.primary === 'hit').length
  const selfs = cases.map((c) => c.self).filter((s): s is number => s !== null)
  return {
    detector,
    visionRecall: recall(vision),
    visionPrecision: precision(vision),
    visionF1: f1(vision),
    detectorRecall: recall(detector),
    detectorPrecision: precision(detector),
    detectorF1: f1(detector),
    primaryAgreement: primaries.length === 0 ? null : primaryHits / primaries.length,
    selfAgreement: selfs.length === 0 ? null : selfs.reduce((a, b) => a + b, 0) / selfs.length,
    countDelta: countDelta(vision),
    costUsd: cases.reduce((s, c) => s + c.costUsd, 0),
    latencyMs: cases.reduce((s, c) => s + c.latencyMs, 0),
    failedCases: cases.filter((c) => c.failed).length,
    calls: cases.reduce((s, c) => s + c.calls, 0),
    okCalls: cases.reduce((s, c) => s + c.okCalls, 0),
    errors: tally(cases.flatMap((c) => c.errors)),
  }
}

/** Distinct error messages with a count each, most frequent first. */
function tally(messages: readonly string[]): { message: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of messages) counts.set(m, (counts.get(m) ?? 0) + 1)
  return [...counts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
}

function reportBody(
  args: Args,
  summary: ReturnType<typeof summarize>,
  cases: number,
  skipped: string[]
): string {
  const s = summary
  return [
    `## Profile-vision bench`,
    ``,
    `- model: \`${args.model}\`  effort: \`${args.effort ?? 'provider default'}\`  variant: \`${args.variant}\`  samples: ${args.samples}`,
    `- source: ${args.source}  cases scored: ${cases}  (vision read failed on ${s.failedCases})`,
    `- golden dates skipped — no feat-119 profile yet: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`,
    `- prompt revision: \`${VISION_PROMPT_REVISION}\``,
    ``,
    `| metric | vision | detector |`,
    `| --- | --- | --- |`,
    `| recall (R1 tol) | ${pct(s.visionRecall)} | ${pct(s.detectorRecall)} |`,
    `| precision | ${pct(s.visionPrecision)} | ${pct(s.detectorPrecision)} |`,
    `| F1 | ${pct(s.visionF1)} | ${pct(s.detectorF1)} |`,
    `| count Δ (pred − labeled) | ${s.countDelta} | ${countDelta(s.detector)} |`,
    ``,
    `- primary agreement: ${s.primaryAgreement === null ? 'n/a' : pct(s.primaryAgreement)}`,
    `- self-agreement across samples: ${s.selfAgreement === null ? 'n/a' : pct(s.selfAgreement)}`,
    `- calls: ${s.okCalls}/${s.calls} ok${s.calls > 0 ? ` (${pct(s.okCalls / s.calls)})` : ''}`,
    `- cost: $${s.costUsd.toFixed(4)}   latency: ${(s.latencyMs / 1000).toFixed(1)}s total`,
    ``,
    ...(s.errors.length === 0
      ? []
      : [
          `### Call failures`,
          ``,
          `A schema refusal and a \`superRefine\` rejection mean very different things —`,
          `the first is the model refusing the contract, the second a contradictory read.`,
          ``,
          `| count | message |`,
          `| --- | --- |`,
          ...s.errors.map((e) => `| ${e.count} | ${e.message.replace(/\|/g, '\\|').slice(0, 300)} |`),
          ``,
        ]),
    `### R15 (proposed exit criterion)`,
    ``,
    `recall ≥ 0.8, primary agreement ≥ 0.7, self-agreement ≥ 0.8, and beats the detector`,
    `on both sources. Operator confirms or raises these numbers from this run.`,
    ``,
  ].join('\n')
}

async function main(): Promise<void> {
  if (process.env.RUN_LLM_INTEGRATION !== '1') {
    console.error(
      'profile-vision-bench makes live LLM calls — set RUN_LLM_INTEGRATION=1 to run it.\n' +
        '(Never gate on key presence: .env leaks into the shell — the 2026-07-25/26 incidents.)'
    )
    process.exit(1)
  }
  const args = parseArgs(process.argv.slice(2))
  if (!args.model) {
    console.error(
      'Pass --model <id>. Candidate models: query the OpenRouter models API for image-input\n' +
        'models (exclude flash-tier — they game validation floors) at bench time, then bench each.'
    )
    process.exit(1)
  }

  const cases: ProfileCase[] = []
  const skipped: string[] = []
  if (args.source === 'golden' || args.source === 'both') {
    const g = goldenCases(args.dates)
    cases.push(...g.cases)
    skipped.push(...g.skipped)
  }
  if (args.source === 'fixtures' || args.source === 'both') {
    cases.push(...fixtureCases())
  }
  if (skipped.length > 0) {
    console.log(
      `Skipped ${skipped.length} golden date(s) with no feat-119 profile yet: ${skipped.join(', ')}`
    )
  }
  if (cases.length === 0) {
    console.error(
      'No scorable cases — golden profiles (feat-119) have not landed and no fixtures selected.'
    )
    process.exit(1)
  }

  const generate = makeGenerate(args.model, args.effort)
  const results: CaseResult[] = []
  for (const pc of cases) {
    results.push(await scoreCase(pc, args, generate))
    process.stdout.write('.')
  }
  process.stdout.write('\n')

  const summary = summarize(results)
  const body = reportBody(args, summary, results.length, skipped)
  console.log(body)

  if (args.report) {
    // One process = one model x one variant, so the filename must carry both:
    // a sweep writing to a bare date stamp would leave only the last run's
    // numbers and the bake-off table would never materialise (feat-131).
    const path = `docs/bench-runs/profile-vision-${dateStamp()}--${slug(args.model)}--${args.variant}.md`
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
    console.log(`\nReport written to ${path}`)
  }
}

/** YYYY-MM-DD from the wall clock (report filenames only — never used in scoring). */
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** `anthropic/claude-sonnet-5` -> `anthropic-claude-sonnet-5` (filename-safe). */
function slug(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9.-]+/g, '-').replace(/^-+|-+$/g, '')
}

void main()
