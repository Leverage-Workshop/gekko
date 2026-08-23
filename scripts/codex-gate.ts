/**
 * Codex review gate — run before opening a PR.
 *
 *   npm run codex:gate -- [--base <ref>] [--block-on P1,P2] [--model <id>]
 *
 * Runs Codex's native code review (the same reviewer as /codex:review) over
 * the branch diff `base...HEAD`, prints its findings, and fails when any
 * finding at a blocking priority remains (default: P1 only — real bugs).
 * P2/P3 findings are printed for you to triage. A record of the run is left
 * in .codex-gate/last.json as evidence. Exit 0 = pass, 1 = blocked / failed.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  describeBranch,
  evaluateReview,
  fetchBase,
  isWorkingTreeDirty,
  parseBlockOn,
  parseCompanionPayload,
  parseReviewText,
  resolveBase,
  resolveCompanionScript,
  type GateRecord,
  type ReviewFinding,
} from '@/lib/codex-gate'

const REVIEW_TIMEOUT_MS = 20 * 60 * 1000
const RECORD_PATH = join('.codex-gate', 'last.json')

interface CliOptions {
  base: string | undefined
  blockOn: string | undefined
  model: string | undefined
}

function parseCli(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    base: process.env.CODEX_GATE_BASE,
    blockOn: process.env.CODEX_GATE_BLOCK_ON,
    model: undefined,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = (): string => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`Missing value for ${token}`)
      i += 1
      return value
    }
    if (token === '--base') options.base = next()
    else if (token === '--block-on') options.blockOn = next()
    else if (token === '--model') options.model = next()
    else throw new Error(`Unknown argument: ${token}`)
  }
  return options
}

function formatFinding(finding: ReviewFinding): string {
  const where = finding.location ? `  (${finding.location})` : ''
  return `  [${finding.priority}] ${finding.title}${where}\n      ${finding.body}`
}

function main(): number {
  const options = parseCli(process.argv.slice(2))
  const blockOn = parseBlockOn(options.blockOn)

  const companion = resolveCompanionScript({
    env: process.env,
    homeDir: homedir(),
    exists: existsSync,
    readJson: (path) => JSON.parse(readFileSync(path, 'utf8')) as unknown,
  })
  if (!companion.ok) {
    console.error(`[codex-gate] ${companion.reason}`)
    return 1
  }

  const base = resolveBase(process.cwd(), options.base)
  const fetch = fetchBase(process.cwd(), base)
  if (fetch.error)
    console.error(`[codex-gate] warning: could not refresh ${base} (${fetch.error}).`)
  const ctx = describeBranch(process.cwd(), base)
  if (isWorkingTreeDirty(ctx.root)) {
    console.error(
      `[codex-gate] warning: uncommitted changes are NOT part of this review (it covers ${base}...HEAD).`
    )
  }
  if (ctx.head === ctx.mergeBase) {
    console.log(`[codex-gate] ${ctx.branch} has no commits beyond ${base} — nothing to review.`)
    return 0
  }

  console.log(
    `[codex-gate] Codex review of ${ctx.branch} (${ctx.head.slice(0, 12)}) vs ${base} (${ctx.baseSha.slice(0, 12)}). This takes a few minutes…`
  )
  const args = ['review', '--wait', '--json', '--base', ctx.baseSha]
  if (options.model) args.push('--model', options.model)
  const run = spawnSync(process.execPath, [companion.path, ...args], {
    cwd: ctx.root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: REVIEW_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (run.error) {
    console.error(`[codex-gate] Could not run the Codex companion: ${run.error.message}`)
    return 1
  }
  if (run.signal || run.status !== 0) {
    const how = run.signal ? `was killed by ${run.signal}` : `exited with status ${run.status}`
    console.error(`[codex-gate] FAIL — the Codex companion ${how}.`)
    return 1
  }
  const parsed = parseCompanionPayload(run.stdout)
  if (!parsed.ok) {
    console.error(`[codex-gate] FAIL — ${parsed.reason}`)
    return 1
  }

  const review = parseReviewText(parsed.reviewText)
  const evaluation = evaluateReview(review, blockOn)
  const record: GateRecord = {
    version: 1,
    head: ctx.head,
    base,
    baseSha: ctx.baseSha,
    branch: ctx.branch,
    reviewedAt: new Date().toISOString(),
    threadId: parsed.threadId,
    passed: evaluation.passed,
    blockOn,
    summary: review.summary,
    findings: review.findings,
  }
  const recordPath = join(ctx.root, RECORD_PATH)
  mkdirSync(join(ctx.root, '.codex-gate'), { recursive: true })
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)

  console.log('')
  if (review.summary) console.log(`Summary: ${review.summary}`)
  if (review.findings.length === 0) {
    console.log('Findings: none')
  } else {
    console.log(`Findings (${review.findings.length}, blocking on ${blockOn.join('/')}):`)
    for (const finding of review.findings) console.log(formatFinding(finding))
  }
  console.log('')
  if (evaluation.passed) {
    console.log(`[codex-gate] PASS for ${ctx.head.slice(0, 12)} — record in ${RECORD_PATH}.`)
    return 0
  }
  console.error(
    `[codex-gate] BLOCKED — ${evaluation.blocking.length} ${blockOn.join('/')} finding(s). Fix them, commit, and run the gate again.`
  )
  return 1
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[codex-gate] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
