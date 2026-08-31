import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { priceToY, tileGeometry } from '@/lib/job-plan/profile-vision/renderProfile'
import {
  loadJobPlanDashboard,
  type JobPlanDashboardDeps,
} from '@/lib/job-plan/dashboard/dashboardData'
import { profileOverlays } from '@/lib/job-plan/dashboard/overlay'
import { describeJobRunFailure } from '@/lib/job-plan/dashboard/runFailure'
import {
  parseJobPlanWarnings,
  parsePersistedProfileNodes,
  type JobPlanRow,
} from '@/lib/job-plan/dashboard/schema'
import { REF_MISSING_CAUSES, missingRefError, bundleWaitError } from '@/lib/job-plan/jobPlanErrors'
import { VISION_OFF_WARNING } from '@/lib/job-plan/visionRead'
import { BUNDLE_ID, RUN_ID } from './helpers/jobPlanFiles'
import { CREATED_AT, ROW_ID, persistedJobPlanRow } from './helpers/jobPlanRows'

/**
 * The Job plan surface's data layer (feat-129): the latest `job_plans` row is
 * read server-side, validated at the boundary, and reduced to what the card
 * renders MECHANICALLY. Rows come from the real pipeline with fake deps.
 */

const depsFor = (row: JobPlanRow | null): JobPlanDashboardDeps => ({
  fetchLatestJobPlan: async () => row,
})

describe('loadJobPlanDashboard', () => {
  it('no row yet → no plan, no error', async () => {
    expect(await loadJobPlanDashboard(depsFor(null))).toEqual({ jobPlan: null, error: null })
  })

  it('a ready row with the vision read ON carries plays, context, warnings and the profile nodes', async () => {
    const row = await persistedJobPlanRow('ready-vision-on')
    const { jobPlan, error } = await loadJobPlanDashboard(depsFor(row))
    expect(error).toBeNull()
    expect(jobPlan).toMatchObject({
      id: ROW_ID,
      createdAt: CREATED_AT,
      runId: RUN_ID,
      bundleId: BUNDLE_ID,
      tradingDay: '2026-08-24',
      status: 'ready',
      visionOff: false,
      profileNodesError: null,
    })
    expect(jobPlan!.plan.plays.length).toBeGreaterThan(0)
    expect(jobPlan!.plan.context.location.crossRead.weekly).toMatch(/above|inside|below/)
    expect(jobPlan!.plan.context.dataQuality.sufficient).toBe(true)
    expect(jobPlan!.profileNodes).not.toBeNull()
    expect(jobPlan!.profileNodes!.profiles['5d']!.consensus!.nodes.length).toBeGreaterThan(0)
    expect(jobPlan!.profileNodes!.profiles['5d']!.imageHashes[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(jobPlan!.visionWarnings).toEqual([])
  })

  it('a ready row with the vision read OFF is flagged visionOff with the LOUD warning kept', async () => {
    const row = await persistedJobPlanRow('ready-vision-off')
    const { jobPlan } = await loadJobPlanDashboard(depsFor(row))
    expect(jobPlan!.status).toBe('ready')
    expect(jobPlan!.profileNodes).toBeNull()
    expect(jobPlan!.visionOff).toBe(true)
    expect(jobPlan!.visionWarnings).toContain(VISION_OFF_WARNING)
    expect(jobPlan!.plan.context.dataQuality.profileNodes).toBe('null')
  })

  it('a partial read keeps the per-profile warning and the surviving consensus', async () => {
    const row = await persistedJobPlanRow('ready-vision-partial')
    const { jobPlan } = await loadJobPlanDashboard(depsFor(row))
    expect(jobPlan!.visionOff).toBe(false)
    expect(jobPlan!.visionWarnings).toContain('profile_nodes_unavailable:4h')
    expect(jobPlan!.profileNodes!.profiles['4h']!.consensus).toBeNull()
    expect(jobPlan!.profileNodes!.profiles['5d']!.consensus).not.toBeNull()
  })

  it('an insufficient row renders with its reasons and no plays', async () => {
    const row = await persistedJobPlanRow('insufficient')
    const { jobPlan, error } = await loadJobPlanDashboard(depsFor(row))
    expect(error).toBeNull()
    expect(jobPlan!.status).toBe('insufficient')
    expect(jobPlan!.plan.plays).toEqual([])
    expect(jobPlan!.plan.standDownReasons.join(' ')).toMatch(/skew/i)
  })

  it('a row whose plan fails the JobPlan schema is surfaced as an error, never half-rendered', async () => {
    const row = await persistedJobPlanRow('ready-vision-off')
    const broken = { ...row, plan: { ...(row.plan as object), plays: 'nope' } }
    const { jobPlan, error } = await loadJobPlanDashboard(depsFor(broken))
    expect(jobPlan).toBeNull()
    expect(error).toMatch(new RegExp(`${ROW_ID}.*failed JobPlan schema validation`))
  })

  it('a row whose plan is null (status insufficient without a plan) is an error too', async () => {
    const row = await persistedJobPlanRow('insufficient')
    const { jobPlan, error } = await loadJobPlanDashboard(depsFor({ ...row, plan: null }))
    expect(jobPlan).toBeNull()
    expect(error).toMatch(/no plan/i)
  })

  it('malformed profile_nodes degrade to null with a loud error line, the plan still renders', async () => {
    const row = await persistedJobPlanRow('ready-vision-on')
    const { jobPlan } = await loadJobPlanDashboard(
      depsFor({ ...row, profile_nodes: { garbage: true } })
    )
    expect(jobPlan).not.toBeNull()
    expect(jobPlan!.profileNodes).toBeNull()
    expect(jobPlan!.profileNodesError).toMatch(/profile_nodes/)
    expect(jobPlan!.visionOff).toBe(false)
  })

  it('a loader failure propagates (the page renders the Data Unavailable block)', async () => {
    const deps: JobPlanDashboardDeps = {
      fetchLatestJobPlan: async () => {
        throw new Error('db down')
      },
    }
    await expect(loadJobPlanDashboard(deps)).rejects.toThrow('db down')
  })
})

describe('the dashboard layer stays off the vision graph', () => {
  // The page's server bundle cannot resolve @resvg (native); a static import
  // of the vision read from the dashboard modules 500s the whole dashboard.
  it('never statically imports visionRead / identifyProfileNodes / rasterize', () => {
    const dir = join(process.cwd(), 'lib/job-plan/dashboard')
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/from '\.\.\/(visionRead|runJobPlan|deps)'/)
      expect(source, file).not.toMatch(/profile-vision\/(identifyProfileNodes|rasterize)/)
    }
    const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
    expect(page).not.toMatch(/visionRead|job-plan\/deps'/)
  })
})

describe('boundary parsers', () => {
  it('warnings: string[] or nothing', () => {
    expect(parseJobPlanWarnings(['a', 'b'])).toEqual(['a', 'b'])
    expect(parseJobPlanWarnings(null)).toEqual([])
    expect(parseJobPlanWarnings([1, 'b'])).toEqual([])
    expect(parseJobPlanWarnings('a')).toEqual([])
  })

  it('profile_nodes: the persisted ProfileNodes shape or null', async () => {
    const row = await persistedJobPlanRow('ready-vision-on')
    expect(parsePersistedProfileNodes(row.profile_nodes)).not.toBeNull()
    expect(parsePersistedProfileNodes(null)).toBeNull()
    expect(parsePersistedProfileNodes({ modelId: 'x' })).toBeNull()
  })
})

describe('describeJobRunFailure — the taxonomy remediation, never "nothing happened"', () => {
  it('maps a bundle_ref_missing abort to its title, the usual causes and the fresh-bundle remediation', () => {
    const error = missingRefError(BUNDLE_ID, 'job-study daily', 'job_study_daily_ref')
    const failure = describeJobRunFailure('FAILED', {
      name: 'AbortTaskRunError',
      message: error.message,
    })
    expect(failure.code).toBe('bundle_ref_missing')
    expect(failure.title).toMatch(/export missing/i)
    expect(failure.message).toContain(REF_MISSING_CAUSES)
    expect(failure.message).toContain('request a fresh bundle')
    expect(failure.noRowWritten).toBe(true)
  })

  it('maps every wait outcome', () => {
    for (const [outcome, code] of [
      ['timed-out', 'bundle_wait_timed_out'],
      ['missing', 'bundle_request_missing'],
      ['unfulfilled', 'bundle_unfulfilled'],
    ] as const) {
      const error = bundleWaitError(outcome, 'req-1')
      const failure = describeJobRunFailure('FAILED', { message: error.message })
      expect(failure.code).toBe(code)
      expect(failure.message).not.toMatch(/^bundle_/)
    }
  })

  it('a failure without a taxonomy prefix keeps the raw message under a generic title', () => {
    const failure = describeJobRunFailure('FAILED', {
      message: 'job-study export: schema version 2 unsupported',
    })
    expect(failure.code).toBe('unknown')
    expect(failure.title).toMatch(/run failed/i)
    expect(failure.message).toBe('job-study export: schema version 2 unsupported')
  })

  it('a terminal status with no error at all still says what happened', () => {
    expect(describeJobRunFailure('CANCELED', null)).toMatchObject({
      code: 'unknown',
      title: expect.stringMatching(/canceled/i),
    })
    expect(describeJobRunFailure('TIMED_OUT', undefined)).toMatchObject({
      title: expect.stringMatching(/timed out/i),
    })
    expect(describeJobRunFailure('CRASHED', undefined).message).toMatch(/trigger\.dev/)
  })
})

describe('profileOverlays — consensus nodes mapped onto the stored tiles', () => {
  it("one overlay per persisted tile, boxes placed with the renderer's own geometry", async () => {
    const row = await persistedJobPlanRow('ready-vision-on')
    const nodes = parsePersistedProfileNodes(row.profile_nodes)!
    const entry = nodes.profiles['5d']!
    const overlays = profileOverlays(entry)
    expect(overlays).toHaveLength(entry.imageHashes.length)
    expect(overlays.map((o) => o.hash)).toEqual([...entry.imageHashes])
    const [first] = overlays
    expect(first).toMatchObject({ width: entry.render.width, height: entry.render.height })
    expect(first.boxes.length).toBe(
      entry.consensus!.nodes.length + entry.consensus!.thinZones.length
    )

    const g = tileGeometry(entry.render, entry.render.tiles[0])
    const node = entry.consensus!.nodes[0]
    const box = first.boxes.find((b) => b.label.includes(node.priceLow.toFixed(2)))!
    expect(box.y).toBeCloseTo(priceToY(g, node.priceHigh), 5)
    expect(box.height).toBeGreaterThanOrEqual(2)
    expect(box.x).toBe(g.plotLeft)
    expect(box.width).toBe(g.plotRight - g.plotLeft)
    expect(box.agreement).toBe(`${node.agreement}/${node.samples}`)
    expect(box.primary).toBe(node.primary)
  })

  it('a profile without consensus has tiles but no boxes', async () => {
    const row = await persistedJobPlanRow('ready-vision-partial')
    const nodes = parsePersistedProfileNodes(row.profile_nodes)!
    const overlays = profileOverlays(nodes.profiles['4h']!)
    expect(overlays.length).toBeGreaterThan(0)
    expect(overlays.every((o) => o.boxes.length === 0)).toBe(true)
  })

  it("a node outside a tile's span is not drawn on that tile", async () => {
    const row = await persistedJobPlanRow('ready-vision-on')
    const nodes = parsePersistedProfileNodes(row.profile_nodes)!
    const entry = nodes.profiles['5d']!
    const far = {
      ...entry.consensus!.nodes[0],
      priceLow: entry.render.priceHigh + 500,
      priceHigh: entry.render.priceHigh + 504,
    }
    const overlays = profileOverlays({
      ...entry,
      consensus: { ...entry.consensus!, nodes: [far], thinZones: [] },
    })
    expect(overlays[0].boxes).toEqual([])
  })
})

/**
 * feat-140 / Codex P1. `job_plans` was empty when the two-sided edge model
 * landed, but the vision read was already live in production — a plan persisted
 * in the window between then and the deploy carries the old single `shape` (and
 * possibly the retired `taper-tail` kind). Without tolerance the whole
 * `profile_nodes` value fails to parse and the dashboard silently loses its
 * profile panels.
 */
describe('profile nodes persisted before the two-sided edge model', () => {
  const legacy = {
    kind: 'taper-tail',
    priceLow: 7530,
    priceHigh: 7534,
    prominence: 2,
    primary: false,
    position: 'lower',
    shape: 'ledge',
    agreement: 3,
    samples: 3,
  }

  it('normalizes the retired kind and carries the legacy shape onto one side', async () => {
    const { ConsensusNodeSchema } = await import('@/lib/job-plan/dashboard/schema')
    const r = ConsensusNodeSchema.safeParse(legacy)
    expect(r.success, 'a legacy node must still parse').toBe(true)
    if (!r.success) return
    expect(r.data.kind).toBe('exhaustive-node')
    expect(r.data.edgeBelow).toBe('ledge')
    // one legacy value cannot describe both sides, so the other stays honest
    expect(r.data.edgeAbove).toBe('none')
  })

  it('a legacy shape with no modern equivalent becomes none rather than a guess', async () => {
    const { ConsensusNodeSchema } = await import('@/lib/job-plan/dashboard/schema')
    const r = ConsensusNodeSchema.safeParse({ ...legacy, kind: 'hvn', shape: 'notch' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.edgeBelow).toBe('none')
    expect(r.data.edgeAbove).toBe('none')
  })

  it('maps the retired HVN kinds onto the single hvn', async () => {
    const { ConsensusNodeSchema } = await import('@/lib/job-plan/dashboard/schema')
    for (const legacyKind of ['hvn-core', 'hvn-edge']) {
      const r = ConsensusNodeSchema.safeParse({ ...legacy, kind: legacyKind, shape: 'notch' })
      expect(r.success, `${legacyKind} must still parse`).toBe(true)
      if (r.success) expect(r.data.kind).toBe('hvn')
    }
  })

  it('a node already in the new form is untouched', async () => {
    const { ConsensusNodeSchema } = await import('@/lib/job-plan/dashboard/schema')
    const modern = { ...legacy, kind: 'lvn', edgeBelow: 'ledge', edgeAbove: 'taper' }
    delete (modern as Record<string, unknown>).shape
    const r = ConsensusNodeSchema.safeParse(modern)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.edgeBelow).toBe('ledge')
    expect(r.data.edgeAbove).toBe('taper')
  })
})
