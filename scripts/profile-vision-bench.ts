/**
 * Profile-vision bench (feat-124, docs/job-planning-task-plan.md "Bench").
 *
 *   RUN_LLM_INTEGRATION=1 npx tsx scripts/profile-vision-bench.ts \
 *     [--model <id>] [--effort <level>] [--variant <preset>] [--samples N] \
 *     [--source golden|fixtures|both] [--dates 2026-02-13,2026-08-07] [--report]
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
 * effort) so iterating on variants/scoring is cheap.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectLvnHvn } from '../lib/engine/lvnDetection'
import { loadLvnFixtures } from '../lib/engine/loadLvnFixtures'
import { parseVbpProfile, type VbpProfile } from '../lib/engine/parseProfile'
import type { Metrics } from '../lib/engine/nodeMatch'
import { generateStructured } from '../lib/llm/generateStructured'
import type { ReasoningEffort } from '../lib/llm/reasoning'
import {
  consensusToScored,
  countDelta,
  detectorToScored,
  f1,
  labelToScored,
  overall,
  precision,
  recall,
  scorePrimary,
  scoreRead,
  selfAgreement,
  toleranceFor,
  type FamilyScores,
  type PrimaryOutcome,
  type ScoredNode,
} from '../lib/job-plan/profile-vision/bench'
import {
  GOLDEN_PROFILES,
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

type Args = {
  model: string | null
  effort: ReasoningEffort | null
  variant: string
  samples: number
  source: 'golden' | 'fixtures' | 'both'
  dates: string[] | null
  report: boolean
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
  }
  if (!(args.variant in VARIANTS)) {
    throw new Error(`unknown --variant ${args.variant}; one of ${Object.keys(VARIANTS).join(', ')}`)
  }
  return args
}

// ---------------------------------------------------------------------------
// Response cache: (image sha256, prompt revision, model, effort) -> read JSON.
// ---------------------------------------------------------------------------
const CACHE_DIR = join(tmpdir(), 'gekko-profile-vision-bench-cache')

function cacheKey(imageSha: string, model: string, effort: ReasoningEffort | null): string {
  return createHash('sha256')
    .update([imageSha, VISION_PROMPT_REVISION, model, effort ?? 'default'].join('|'))
    .digest('hex')
}

function readCache(key: string): ProfileNodesRead | null {
  const path = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(path)) return null
  const parsed = profileNodesReadSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  return parsed.success ? parsed.data : null
}

function writeCache(key: string, read: ProfileNodesRead): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(read))
}

/**
 * A caching wrapper over generateStructured shaped as the VisionGenerate dep:
 * the image sha (first image is the target) keys the cache with the prompt
 * revision, model and effort, so re-running a variant reuses paid reads.
 */
function makeGenerate(model: string, effort: ReasoningEffort | null): VisionGenerate {
  return async ({ prompt, images, abortSignal }) => {
    const targetImage = images[images.length - 1]
    const imageSha = createHash('sha256').update(targetImage.base64).digest('hex')
    const key = cacheKey(imageSha, model, effort)
    const cached = readCache(key)
    if (cached) return { object: cached, cost: 0, latencyMs: 0 }
    const result = await generateStructured({
      model,
      effort,
      schema: profileNodesReadSchema,
      prompt,
      images: [...images],
      abortSignal,
    })
    writeCache(key, result.object)
    return { object: result.object, cost: result.cost, latencyMs: result.latencyMs }
  }
}

// ---------------------------------------------------------------------------
// Sources: golden dates (feat-119 profiles, may be absent) and lvn-fixtures.
// ---------------------------------------------------------------------------
type ProfileCase = {
  readonly id: string
  readonly instrument: Instrument
  readonly profile: VbpProfile
  readonly labels: readonly GoldenLabel[]
}

function goldenCases(dates: string[] | null): { cases: ProfileCase[]; skipped: string[] } {
  const set = loadGoldenSet()
  const cases: ProfileCase[] = []
  const skipped: string[] = []
  for (const d of set.dates) {
    if (d.role === 'fewShot') continue // never scored on the few-shot dates
    if (dates && !dates.includes(d.date)) continue
    const files = presentProfileFiles(d)
    if (files.length === 0) {
      skipped.push(d.date)
      continue
    }
    for (const { key, path } of files) {
      const labels = d.labels.filter((l) => l.profile === key || l.profile === 'any')
      if (labels.length === 0) continue
      cases.push({
        id: `${d.date}:${key}`,
        instrument: d.instrument,
        profile: parseVbpProfile(readFileSync(path, 'utf8')),
        labels,
      })
    }
  }
  return { cases, skipped }
}

function presentProfileFiles(
  d: GoldenDate
): { key: Exclude<(typeof GOLDEN_PROFILES)[number], 'any'>; path: string }[] {
  return d.profilesPresent.map((key) => ({
    key,
    path: join('chart-data/job-lvn-golden', d.date, PROFILE_FILES[key]),
  }))
}

function fixtureCases(): ProfileCase[] {
  // fixture labels are prices split lvn/hvn (no kind granularity, no primary).
  const { fixtures } = loadLvnFixtures({ strict: true })
  return fixtures.map((fx) => ({
    id: `fixture:${fx.id}`,
    instrument: 'NQ' as const, // the lvn-fixtures are NQ exports
    profile: { rows: fx.rows, meta: fx.meta },
    labels: [
      ...fx.labels.lvn.map((p, i) => label('NQ', 'lvn', p, i)),
      ...fx.labels.hvn.map((p, i) => label('NQ', 'hvn-core', p, i)),
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
  }
}

// ---------------------------------------------------------------------------
// Scoring one case with the vision read and with the detector.
// ---------------------------------------------------------------------------
type CaseResult = {
  readonly id: string
  readonly vision: FamilyScores | null
  readonly detector: FamilyScores
  readonly primary: PrimaryOutcome
  readonly self: number | null
  readonly costUsd: number
}

async function scoreCase(
  pc: ProfileCase,
  args: Args,
  generate: VisionGenerate
): Promise<CaseResult> {
  const tolerance = toleranceFor(pc.instrument)
  const labeled = pc.labels.map(labelToScored)

  // Detector (code-owned) on the same profile.
  const det = detectLvnHvn(pc.profile.rows)
  const detector = scoreRead(
    detectorToScored(
      det.lvn.map((n) => n.price),
      det.hvn.map((n) => n.price)
    ),
    labeled,
    tolerance
  )

  // Vision read: one profile, S samples, T tiles.
  const result = await identifyProfileNodes({
    instrument: pc.instrument,
    currentPrice: null,
    profiles: { '5d': pc.profile }, // one profile per case; the 5d slot is arbitrary here
    render: VARIANTS[args.variant],
    samples: args.samples,
    modelId: args.model!,
    effort: args.effort,
    generate,
  })
  const entry = result.profiles['5d']
  const consensus = entry?.consensus ?? null
  const costUsd = (entry?.raw ?? []).reduce((s, r) => s + (r.cost ?? 0), 0)

  let vision: FamilyScores | null = null
  let primary: PrimaryOutcome = 'not_applicable'
  let self: number | null = null
  if (consensus) {
    const predicted = consensus.nodes.map(consensusToScored)
    vision = scoreRead(predicted, labeled, tolerance)
    const labeledPrimary = pc.labels.find((l) => l.primary)
    const predictedPrimary = consensus.nodes.find((n) => n.primary)
    primary = scorePrimary(
      predictedPrimary ? consensusToScored(predictedPrimary) : null,
      labeledPrimary ? labelToScored(labeledPrimary) : null,
      tolerance
    )
    self = sampleSelfAgreement(entry!.raw, pc.instrument, tolerance)
  }
  return { id: pc.id, vision, detector, primary, self, costUsd }
}

/** Self-agreement from the raw per-sample reads (one tile assumed here). */
function sampleSelfAgreement(
  raw: readonly { ok: boolean; read: ProfileNodesRead | null; sample: number; tile: number }[],
  _instrument: Instrument,
  tolerance: number
): number | null {
  const bySample = new Map<number, ScoredNode[]>()
  for (const r of raw) {
    if (!r.ok || !r.read) continue
    const nodes = r.read.nodes.map((n) => consensusToScoredNode(n))
    bySample.set(r.sample, [...(bySample.get(r.sample) ?? []), ...nodes])
  }
  return selfAgreement([...bySample.values()], tolerance)
}

function consensusToScoredNode(n: ProfileNodesRead['nodes'][number]): ScoredNode {
  return consensusToScored({ ...n, agreement: 1, samples: 1 })
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------
function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

function aggregate(
  cases: readonly CaseResult[],
  pick: (c: CaseResult) => FamilyScores | null
): Metrics {
  return cases
    .map(pick)
    .filter((s): s is FamilyScores => s !== null)
    .map(overall)
    .reduce(
      (a, b) => ({
        tp: a.tp + b.tp,
        fp: a.fp + b.fp,
        fn: a.fn + b.fn,
        detected: a.detected + b.detected,
        labeled: a.labeled + b.labeled,
      }),
      { tp: 0, fp: 0, fn: 0, detected: 0, labeled: 0 }
    )
}

function summarize(cases: readonly CaseResult[]) {
  const vision = aggregate(cases, (c) => c.vision)
  const detector = aggregate(cases, (c) => c.detector)
  const primaries = cases.filter((c) => c.primary !== 'not_applicable')
  const primaryHits = primaries.filter((c) => c.primary === 'hit').length
  const selfs = cases.map((c) => c.self).filter((s): s is number => s !== null)
  const cost = cases.reduce((s, c) => s + c.costUsd, 0)
  return {
    vision,
    detector,
    visionRecall: recall(vision),
    visionPrecision: precision(vision),
    visionF1: f1(vision),
    detectorRecall: recall(detector),
    detectorF1: f1(detector),
    primaryAgreement: primaries.length === 0 ? null : primaryHits / primaries.length,
    selfAgreement: selfs.length === 0 ? null : selfs.reduce((a, b) => a + b, 0) / selfs.length,
    countDelta: countDelta(vision),
    costUsd: cost,
  }
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
    `- source: ${args.source}  cases scored: ${cases}  golden dates skipped (no feat-119 profile yet): ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`,
    `- prompt revision: \`${VISION_PROMPT_REVISION}\``,
    ``,
    `| metric | vision | detector |`,
    `| --- | --- | --- |`,
    `| recall (R1 tol) | ${pct(s.visionRecall)} | ${pct(s.detectorRecall)} |`,
    `| precision | ${pct(s.visionPrecision)} | ${pct(precision(s.detector))} |`,
    `| F1 | ${pct(s.visionF1)} | ${pct(s.detectorF1)} |`,
    `| count Δ (pred − labeled) | ${s.countDelta} | ${countDelta(s.detector)} |`,
    ``,
    `- primary agreement: ${s.primaryAgreement === null ? 'n/a' : pct(s.primaryAgreement)}`,
    `- self-agreement across samples: ${s.selfAgreement === null ? 'n/a' : pct(s.selfAgreement)}`,
    `- cost: $${s.costUsd.toFixed(4)}`,
    ``,
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
    const path = `docs/profile-vision-bench-${dateStamp()}.md`
    writeFileSync(path, body)
    console.log(`\nReport written to ${path}`)
  }
}

/** YYYY-MM-DD from the wall clock (report filenames only — never used in scoring). */
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

void main()
