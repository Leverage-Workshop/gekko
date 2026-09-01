/**
 * feat-144 — LLM Job planner SHADOW A/B (docs/job-plan-llm-planner-proposal.md).
 *
 *   RUN_LLM_INTEGRATION=1 npm run llm-planner:shadow -- [--limit N] [--runs R] \
 *     [--model <id>] [--effort <level>] [--out <path>]
 *
 * Pulls the latest `ready` job_plans row per trading day (service-role client),
 * takes the PERSISTED context out of each plan, and runs BOTH planners on it:
 * the deterministic `buildPlan` fresh at the current PLANNER_REVISION, and the
 * LLM judgment (`runLlmPlanner`) R times — twice by default, so any flip
 * between identical runs is caught (the vision self-agreement discipline).
 * Emits a markdown report of frame / play-set / primary diffs for operator
 * adjudication. Nothing is persisted to the database — the deterministic
 * planner stays production and `job_plan_bands` never sees a shadow plan.
 *
 * Live LLM calls are gated on RUN_LLM_INTEGRATION=1 explicitly — NEVER on key
 * presence (.env leaks into the shell; see scripts/profile-vision-bench.ts).
 * Model id defaults to `config.model_id`, overridable with --model.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import { fetchConfigRow } from '@/lib/config'
import type { JobContext } from '@/lib/job-plan/contextTypes'
import { buildPlan } from '@/lib/job-plan/buildPlan'
import { diffJudgment, stabilityDiff, type ShadowDiff, type StabilityDiff } from '@/lib/job-plan/llm-planner/diff'
import { LLM_PLANNER_REVISION } from '@/lib/job-plan/llm-planner/prompt'
import { bandLabel } from '@/lib/job-plan/playText'
import { runLlmPlanner, type LlmPlannerResult } from '@/lib/job-plan/llm-planner/runLlmPlanner'
import { PLANNER_REVISION } from '@/lib/job-plan/rules'
import { DEFAULT_MODEL_ID } from '@/lib/llm/generateStructured'
import type { ReasoningEffort } from '@/lib/llm/reasoning'
import { getServiceClient } from '@/lib/supabase/server'

// tsx does not auto-load env files; loadEnvFile never overrides vars already
// set, so precedence is: shell > .env.local > .env (same as scripts/uploader.ts).
for (const envPath of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(envPath)
  } catch {
    // absent file — fine
  }
}

type Args = {
  limit: number
  runs: number
  model: string | null
  effort: ReasoningEffort | null
  out: string | null
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { limit: 5, runs: 2, model: null, effort: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      i++
      if (i >= argv.length) throw new Error(`${a} needs a value`)
      return argv[i]
    }
    if (a === '--limit') args.limit = Number(next())
    else if (a === '--runs') args.runs = Number(next())
    else if (a === '--model') args.model = next()
    else if (a === '--effort') args.effort = next() as ReasoningEffort
    else if (a === '--out') args.out = next()
    else throw new Error(`unknown argument ${a}`)
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer')
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs must be a positive integer')
  return args
}

type JobPlanRow = {
  id: string
  trading_day: string
  created_at: string
  plan: JobPlan
}

/** Latest ready plan per trading day, newest days first. */
async function fetchRows(limit: number): Promise<JobPlanRow[]> {
  const client = getServiceClient()
  const { data, error } = await client
    .from('job_plans')
    .select('id, trading_day, created_at, plan, status')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(limit * 4)
  if (error) throw error
  const byDay = new Map<string, JobPlanRow>()
  for (const row of (data ?? []) as (JobPlanRow & { status: string })[]) {
    if (!byDay.has(row.trading_day)) byDay.set(row.trading_day, row)
    if (byDay.size >= limit) break
  }
  return [...byDay.values()]
}

type Entry = {
  row: JobPlanRow
  context: JobContext
  det: JobPlan | null
  llm: LlmPlannerResult[]
  diff: ShadowDiff | null
  stability: StabilityDiff | null
  error: string | null
}

function labelFor(context: JobContext, bandId: string): string {
  const band = context.bands.find((b) => b.id === bandId)
  return band ? bandLabel(band) : bandId
}

function h(line: string): string {
  return `\n## ${line}\n`
}

function playLines(entry: Entry): string[] {
  const det = (entry.det?.plays ?? []).map(
    (p) => `  ${p.rank}. [${p.direction}] ${p.band.label} — ${p.summary}${p.primary ? '  **(primary)**' : ''}`,
  )
  const first = entry.llm[0].judgment
  const llm = first.plays.map(
    (p, i) =>
      `  ${i + 1}. [${p.direction}] ${labelFor(entry.context, p.bandId)}` +
      `\n     ${p.text}\n     _${p.rationale}_${i === 0 ? '  **(primary)**' : ''}`,
  )
  return [
    '**Deterministic plays:**',
    ...(det.length > 0 ? det : ['  (none)']),
    '',
    '**LLM plays:**',
    ...(llm.length > 0 ? llm : ['  (none)']),
    ...(first.sidesWithoutPlay.length > 0
      ? ['', '**LLM sides without a play:**', ...first.sidesWithoutPlay.map((s) => `  - ${s.side}: ${s.reason}`)]
      : []),
    ...(first.standDown ? ['', `**LLM stand-down:** ${first.standDownText}`] : []),
    '',
    `**LLM lean:** ${first.lean}`,
  ]
}

function diffLines(entry: Entry): string[] {
  const d = entry.diff
  if (d === null) return []
  const lines: string[] = []
  lines.push(
    `- Frame: ${d.frame.agree ? 'AGREE' : 'DISAGREE'} — det ${d.frame.deterministic?.label ?? '(none)'} vs llm ${d.frame.llm.label}`,
  )
  lines.push(`- Primary: ${d.primary.agree ? 'AGREE' : 'DISAGREE'} — det ${d.primary.deterministic ?? '(none)'} vs llm ${d.primary.llm ?? '(none)'}`)
  lines.push(`- Stand-down: ${d.standDown.agree ? 'AGREE' : 'DISAGREE'} (det ${d.standDown.deterministic}, llm ${d.standDown.llm})`)
  lines.push(`- Shared bands: ${d.plays.sharedBandIds.length}`)
  for (const p of d.plays.onlyDeterministic) lines.push(`- Only deterministic: [${p.direction}] ${p.label}`)
  for (const p of d.plays.onlyLlm) lines.push(`- Only LLM: [${p.direction}] ${p.label}`)
  for (const m of d.plays.directionMismatches) lines.push(`- Direction mismatch on ${m.bandId}: det ${m.deterministic} vs llm ${m.llm}`)
  if (entry.stability) {
    lines.push(
      `- Stability (${entry.llm.length} runs): ${entry.stability.stable ? 'STABLE' : 'UNSTABLE'}` +
        (entry.stability.stable
          ? ''
          : ` — frame ${entry.stability.frameAgree}, playSet ${entry.stability.playSetAgree}, primary ${entry.stability.primaryAgree}, directions ${entry.stability.directionsAgree}`),
    )
  }
  const violations = entry.llm.flatMap((r) => r.violations)
  const retries = entry.llm.filter((r) => r.attempts > 1).length
  lines.push(`- Contract: ${violations.length} unresolved violation(s), ${retries} run(s) needed the retry`)
  for (const v of violations) lines.push(`  - ${v.code}: ${v.message}`)
  return lines
}

function report(entries: Entry[], args: Args, model: string): string {
  const ok = entries.filter((e) => e.error === null && e.diff !== null)
  const agree = (pick: (e: Entry & { diff: ShadowDiff }) => boolean) =>
    `${ok.filter((e) => pick(e as Entry & { diff: ShadowDiff })).length}/${ok.length}`
  const cost = ok.flatMap((e) => e.llm).reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
  const lines: string[] = [
    `# LLM Job planner shadow A/B — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `- prompt revision: \`${LLM_PLANNER_REVISION}\`  deterministic: \`${PLANNER_REVISION}\``,
    `- model: \`${model}\`  effort: \`${args.effort ?? 'provider default'}\`  runs per bundle: ${args.runs}`,
    `- bundles: ${entries.length} (${ok.length} compared)  total LLM cost: $${cost.toFixed(4)}`,
    '',
    `**Agreement:** frame ${agree((e) => e.diff.frame.agree)} · primary ${agree((e) => e.diff.primary.agree)} · stand-down ${agree((e) => e.diff.standDown.agree)} · stable ${agree((e) => e.stability?.stable ?? true)}`,
    '',
    'Agreements are sanity; **the disagreements are the experiment** — adjudicate each one below.',
  ]
  for (const entry of entries) {
    lines.push(h(`${entry.row.trading_day} — plan ${entry.row.id}`))
    if (entry.error !== null) {
      lines.push(`SKIPPED: ${entry.error}`)
      continue
    }
    lines.push(`asOf ${entry.context.asOf} · price ${entry.context.price.value} · ${entry.context.instrument}`)
    lines.push('')
    lines.push(...diffLines(entry))
    lines.push('')
    lines.push(...playLines(entry))
  }
  return lines.join('\n') + '\n'
}

async function main(): Promise<void> {
  if (process.env.RUN_LLM_INTEGRATION !== '1') {
    console.error('Refusing to make live LLM calls: set RUN_LLM_INTEGRATION=1 explicitly (never gated on key presence).')
    process.exitCode = 1
    return
  }
  const args = parseArgs(process.argv.slice(2))

  const client = getServiceClient()
  const { row: config } = await fetchConfigRow(client)
  const model = args.model ?? config?.model_id ?? DEFAULT_MODEL_ID
  const effort = args.effort ?? config?.model_effort ?? null

  const rows = await fetchRows(args.limit)
  if (rows.length === 0) {
    console.error('No ready job_plans rows to shadow.')
    process.exitCode = 1
    return
  }
  console.log(`Shadowing ${rows.length} plan(s) with ${model} (${args.runs} run(s) each)…`)

  const entries: Entry[] = []
  for (const row of rows) {
    const context = row.plan.context
    try {
      const det = buildPlan({ context })
      const llm: LlmPlannerResult[] = []
      for (let i = 0; i < args.runs; i++) {
        llm.push(await runLlmPlanner({ context, model, effort }))
      }
      const diff = diffJudgment(det, llm[0].judgment, context)
      const stability = llm.length > 1 ? stabilityDiff(llm[0].judgment, llm[1].judgment) : null
      entries.push({ row, context, det, llm, diff, stability, error: null })
      console.log(
        `  ${row.trading_day}: frame ${diff.frame.agree ? 'agree' : 'DISAGREE'}, primary ${diff.primary.agree ? 'agree' : 'DISAGREE'}${stability && !stability.stable ? ', UNSTABLE' : ''}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      entries.push({ row, context, det: null, llm: [], diff: null, stability: null, error: message })
      console.error(`  ${row.trading_day}: SKIPPED — ${message}`)
    }
  }

  const out = args.out ?? join('docs', 'shadow-runs', `job-plan-llm-${new Date().toISOString().slice(0, 10)}.md`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, report(entries, args, model))
  console.log(`\nReport: ${out}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
