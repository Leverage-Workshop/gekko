import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static doctrine assembled into the model's system prompt, per task. Each
 * task's prefix is identical on every run so it is prompt-cached (see
 * generateStructured's `cacheSystem`); volatile per-run data (MGI JSON,
 * engine facts, screenshots) must go in the user message, never here.
 *
 * The knowledge files are model-facing ONLY — no repo paths or maintainer
 * commentary (see docs/engine-ownership.md for the maintainer half, and
 * tests/knowledge-restructure.test.ts for the guard). Each task gets only its
 * own output contract: shipping all three contracts to every task wasted
 * cached tokens and leaked eval-only decision prose into analyze runs.
 *
 * The files ship with the trigger.dev deploy via the `additionalFiles`
 * build extension in trigger.config.ts.
 */

export type DoctrineTask = 'analyze' | 'update' | 'eval'

const SHARED_PREFIX = ['knowledge/system/role.md', 'knowledge/system/constraints.md'] as const

/**
 * The Objective contract and constraints are shared by the two briefing-shaped
 * tasks only. The eval prefix deliberately carries NONE of the objective
 * doctrine (target selection, R/R gate, primary/secondary assignment,
 * Rip/Vanguard, pattern-scan obligations): those mandates reference facts and
 * output fields the eval task does not receive or express, so shipping them
 * forced the model to ignore "hard constraints" or fabricate the missing
 * evidence (Codex adversarial eval-prompt review, 2026-08-02, finding #1).
 */
const OUTPUT_FILES: Record<DoctrineTask, readonly string[]> = {
  analyze: [
    'knowledge/system/constraints-objective.md',
    'knowledge/system/output-briefing.md',
    'knowledge/system/output-objective.md',
  ],
  update: [
    'knowledge/system/constraints-objective.md',
    'knowledge/system/output-update.md',
    'knowledge/system/output-objective.md',
  ],
  eval: ['knowledge/system/output-eval.md'],
}

const SHARED_DOCTRINE = [
  'knowledge/doctrine/chart-reading.md',
  'knowledge/doctrine/glossary.md',
  'knowledge/doctrine/patterns.md',
] as const

/** Objective-construction doctrine — briefing-shaped tasks only (see OUTPUT_FILES). */
const TASK_DOCTRINE: Record<DoctrineTask, readonly string[]> = {
  analyze: ['knowledge/doctrine/campaign-strategy.md'],
  update: ['knowledge/doctrine/campaign-strategy.md'],
  eval: [],
}

/**
 * Concatenate the doctrine files for one task into its system-prompt prefix.
 *
 * @throws when a doctrine file is missing — a deploy packaging error that must
 *   fail loudly rather than brief without guardrails.
 */
export function loadDoctrine(task: DoctrineTask, baseDir: string = process.cwd()): string {
  const files = [
    ...SHARED_PREFIX,
    ...OUTPUT_FILES[task],
    ...SHARED_DOCTRINE,
    ...TASK_DOCTRINE[task],
  ]
  return files
    .map((file) => readFileSync(join(baseDir, file), 'utf-8').trim())
    .join('\n\n---\n\n')
}
