import { z } from 'zod'

// Parses the output of Codex's native code review (`/codex:review`, i.e. the
// companion's `review` command). The reviewer returns free text shaped like:
//
//   <one-line summary>
//
//   Review comment:
//
//   - [P1] <title> — <file>:<line>-<line>
//     <body…>
//
// P0 = release-blocking, P1 = bug that must be fixed, P2 = should fix,
// P3 = nit. No findings → the text is just a short "looks fine" summary.

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface ReviewFinding {
  priority: Priority
  title: string
  location: string | null
  body: string
}

export interface ParsedReview {
  summary: string
  findings: ReviewFinding[]
}

const FINDING_LINE = /^\s*(?:[-*•]\s*)?\[(P[0-3])\]\s*(.*?)\s*$/
const LOCATION_SPLIT = /\s+[—–-]+\s+(?=\S+:\d+)/

export function parseReviewText(text: string): ParsedReview {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const findings: ReviewFinding[] = []
  const summaryLines: string[] = []
  let current: ReviewFinding | null = null

  for (const line of lines) {
    const match = FINDING_LINE.exec(line)
    if (match) {
      const [, priority, rest] = match
      const [title, location] = (rest ?? '').split(LOCATION_SPLIT, 2)
      current = {
        priority: priority as Priority,
        title: (title ?? '').trim(),
        location: location?.trim() ?? null,
        body: '',
      }
      findings.push(current)
      continue
    }
    if (current) {
      if (line.trim() === '') {
        current = null
      } else {
        current.body = `${current.body}${current.body ? ' ' : ''}${line.trim()}`
      }
      continue
    }
    if (findings.length === 0 && line.trim() && !/^review comments?:?\s*$/i.test(line.trim())) {
      summaryLines.push(line.trim())
    }
  }
  return { summary: summaryLines.join(' '), findings }
}

export const DEFAULT_BLOCK_ON: readonly Priority[] = ['P0', 'P1']

export function parseBlockOn(raw: string | undefined): Priority[] {
  if (!raw?.trim()) return [...DEFAULT_BLOCK_ON]
  const tokens = raw
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
  const unknown = tokens.filter((t) => !(PRIORITIES as readonly string[]).includes(t))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown priority in block-on list: ${unknown.join(', ')} (expected P0|P1|P2|P3)`
    )
  }
  return [...new Set(tokens as Priority[])]
}

export interface GateEvaluation {
  passed: boolean
  blocking: ReviewFinding[]
}

export function evaluateReview(review: ParsedReview, blockOn: readonly Priority[]): GateEvaluation {
  const blocking = review.findings.filter((f) => blockOn.includes(f.priority))
  return { passed: blocking.length === 0, blocking }
}

// The subset of the companion's `review --json` payload the gate reads.
const CompanionPayloadSchema = z.object({
  threadId: z.string().nullable().optional(),
  codex: z.object({
    status: z.number().nullable().optional(),
    stdout: z.string().nullable().optional(),
    stderr: z.string().nullable().optional(),
  }),
})

export type CompanionParse =
  | { ok: true; reviewText: string; threadId: string | null }
  | { ok: false; reason: string }

// A failed or empty review is a gate FAILURE, never a pass.
export function parseCompanionPayload(stdout: string): CompanionParse {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    return { ok: false, reason: 'Codex companion did not return JSON (see stderr above).' }
  }
  const payload = CompanionPayloadSchema.safeParse(json)
  if (!payload.success) {
    return { ok: false, reason: `Unexpected companion payload shape: ${payload.error.message}` }
  }
  const { status, stdout: reviewText, stderr } = payload.data.codex
  if (status !== 0) {
    return {
      ok: false,
      reason: `Codex review did not report success (status ${String(status)}): ${stderr?.trim() || 'no details'}`,
    }
  }
  if (!reviewText?.trim()) {
    return { ok: false, reason: `Codex review returned no text: ${stderr?.trim() || 'no details'}` }
  }
  return { ok: true, reviewText, threadId: payload.data.threadId ?? null }
}

// What `npm run codex:gate` leaves in .codex-gate/last.json — evidence of
// which commit was reviewed against which base, and what came back.
export interface GateRecord {
  version: 1
  head: string
  base: string
  baseSha: string
  branch: string
  reviewedAt: string
  threadId: string | null
  passed: boolean
  blockOn: Priority[]
  summary: string
  findings: ReviewFinding[]
}
