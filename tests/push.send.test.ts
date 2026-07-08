import { describe, expect, it, vi } from 'vitest'
import {
  buildPushPayload,
  isPushConfigured,
  sendGekkoPush,
  sendPushToAll,
  urlBase64ToUint8Array,
  type PushSubscriptionRow,
  type SendPushDeps,
  type WebPushSubscription,
} from '@/lib/push'

// feat-027: Web Push send logic — all side effects injected, fully offline.
// The real web-push/Supabase wiring (lib/push/deps.ts) is only loaded via
// dynamic import when VAPID keys exist, so these tests never touch it.

function row(n: number): PushSubscriptionRow {
  return { endpoint: `https://push.example/${n}`, p256dh: `p-${n}`, auth: `a-${n}` }
}

interface FakeDeps extends SendPushDeps {
  sends: { subscription: WebPushSubscription; payload: string }[]
  deleted: string[]
  logs: string[]
}

function fakeDeps({
  rows = [row(1)],
  failWith = new Map<string, unknown>(),
  deleteError,
}: {
  rows?: PushSubscriptionRow[]
  /** endpoint → error thrown by sendNotification */
  failWith?: Map<string, unknown>
  deleteError?: Error
} = {}): FakeDeps {
  const deps: FakeDeps = {
    sends: [],
    deleted: [],
    logs: [],
    loadSubscriptions: async () => rows,
    sendNotification: async (subscription, payload) => {
      const error = failWith.get(subscription.endpoint)
      if (error) throw error
      deps.sends.push({ subscription, payload })
    },
    deleteSubscription: async (endpoint) => {
      if (deleteError) throw deleteError
      deps.deleted.push(endpoint)
    },
    log: (message) => {
      deps.logs.push(message)
    },
  }
  return deps
}

function statusError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`push service said ${statusCode}`), { statusCode })
}

describe('buildPushPayload', () => {
  it('serializes type, headline, tag, timestamp, and click URL', () => {
    const payload = JSON.parse(
      buildPushPayload({ type: 'eval', id: 'e-1', status: 'WAIT', createdAt: '2026-07-08T12:00:00Z' }),
    )
    expect(payload).toEqual({
      type: 'eval',
      title: 'Entry eval: WAIT',
      body: expect.stringContaining('12:00 UTC'),
      tag: 'gekko-eval-e-1',
      timestamp: '2026-07-08T12:00:00Z',
      url: '/',
    })
  })

  it('stamps "now" when the event has no createdAt', () => {
    const now = () => new Date('2026-07-08T15:00:00Z')
    const payload = JSON.parse(buildPushPayload({ type: 'briefing' }, now))
    expect(payload.title).toBe('New briefing ready')
    expect(payload.timestamp).toBe('2026-07-08T15:00:00.000Z')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes plain base64', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
  })

  it('decodes the URL-safe alphabet with missing padding', () => {
    // url-safe '--_-' → plain '++/+' → bytes fb ef fe.
    expect(Array.from(urlBase64ToUint8Array('--_-'))).toEqual([0xfb, 0xef, 0xfe])
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1])
  })
})

describe('isPushConfigured', () => {
  it('requires both VAPID keys', () => {
    expect(isPushConfigured({})).toBe(false)
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: 'pub' })).toBe(false)
    expect(isPushConfigured({ VAPID_PRIVATE_KEY: 'priv' })).toBe(false)
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toBe(true)
  })
})

describe('sendPushToAll', () => {
  it('sends the same payload to every subscription with mapped keys', async () => {
    const deps = fakeDeps({ rows: [row(1), row(2)] })
    const summary = await sendPushToAll(deps, { type: 'briefing', id: 'b-1' })

    expect(summary).toEqual({ attempted: 2, sent: 2, pruned: 0, failed: 0 })
    expect(deps.sends).toHaveLength(2)
    expect(deps.sends[0].subscription).toEqual({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p-1', auth: 'a-1' },
    })
    expect(deps.sends[0].payload).toBe(deps.sends[1].payload)
    expect(deps.deleted).toEqual([])
  })

  it.each([404, 410])('prunes a subscription when the push service answers %d', async (code) => {
    const deps = fakeDeps({
      rows: [row(1), row(2)],
      failWith: new Map([[row(1).endpoint, statusError(code)]]),
    })
    const summary = await sendPushToAll(deps, { type: 'briefing' })

    expect(summary).toEqual({ attempted: 2, sent: 1, pruned: 1, failed: 0 })
    expect(deps.deleted).toEqual([row(1).endpoint])
  })

  it('counts and logs non-gone failures without pruning or throwing', async () => {
    const deps = fakeDeps({
      rows: [row(1), row(2)],
      failWith: new Map([[row(2).endpoint, statusError(500)]]),
    })
    const summary = await sendPushToAll(deps, { type: 'eval', status: 'ENTER' })

    expect(summary).toEqual({ attempted: 2, sent: 1, pruned: 0, failed: 1 })
    expect(deps.deleted).toEqual([])
    expect(deps.logs).toContain('push send failed')
  })

  it('survives a prune-delete failure (logged, not thrown)', async () => {
    const deps = fakeDeps({
      rows: [row(1)],
      failWith: new Map([[row(1).endpoint, statusError(410)]]),
      deleteError: new Error('db down'),
    })
    const summary = await sendPushToAll(deps, { type: 'briefing' })

    expect(summary.pruned).toBe(1)
    expect(deps.logs).toContain('failed to prune push subscription')
  })

  it('is a clean zero-summary with no subscriptions stored', async () => {
    const deps = fakeDeps({ rows: [] })
    expect(await sendPushToAll(deps, { type: 'briefing' })).toEqual({
      attempted: 0,
      sent: 0,
      pruned: 0,
      failed: 0,
    })
  })
})

describe('sendGekkoPush', () => {
  const CONFIGURED = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }

  it('is a silent no-op without VAPID keys (deps never touched)', async () => {
    const deps = fakeDeps()
    const loadSpy = vi.spyOn(deps, 'loadSubscriptions')
    const result = await sendGekkoPush({ type: 'briefing' }, { env: {}, deps, log: () => {} })
    expect(result).toBeNull()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('sends through the injected deps when configured', async () => {
    const deps = fakeDeps({ rows: [row(1)] })
    const result = await sendGekkoPush(
      { type: 'eval', status: 'WAIT' },
      { env: CONFIGURED, deps, log: () => {} },
    )
    expect(result).toEqual({ attempted: 1, sent: 1, pruned: 0, failed: 0 })
    expect(deps.sends).toHaveLength(1)
  })

  it('NEVER throws — even a subscription-load failure resolves to null', async () => {
    const deps = fakeDeps()
    deps.loadSubscriptions = async () => {
      throw new Error('supabase unreachable')
    }
    const logs: string[] = []
    const result = await sendGekkoPush(
      { type: 'briefing' },
      { env: CONFIGURED, deps, log: (message) => logs.push(message) },
    )
    expect(result).toBeNull()
    expect(logs.some((entry) => entry.includes('unexpected error'))).toBe(true)
  })
})
