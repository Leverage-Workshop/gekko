import { describe, expect, it } from 'vitest'
import {
  ALERT_INSERT_EVENT,
  GEKKO_ALERTS_TOPIC,
  buildAlertContent,
  parseAlertEvent,
} from '@/lib/notifications/events'

// feat-026: the shared alert-event model both notification channels consume.
// Pure logic — runs fully offline.

describe('alert channel constants', () => {
  // These literals are baked into the SQL trigger
  // (20260708120000_realtime_notifications.sql); migrations.test.ts asserts
  // the SQL side, this pins the TS side.
  it('pins the topic and event names the DB trigger broadcasts on', () => {
    expect(GEKKO_ALERTS_TOPIC).toBe('gekko:alerts')
    expect(ALERT_INSERT_EVENT).toBe('insert')
  })
})

describe('parseAlertEvent', () => {
  it('parses a briefing broadcast payload (snake_case created_at)', () => {
    expect(
      parseAlertEvent({
        type: 'briefing',
        id: 'b-1',
        created_at: '2026-07-08T12:00:00Z',
      }),
    ).toEqual({
      type: 'briefing',
      id: 'b-1',
      status: undefined,
      createdAt: '2026-07-08T12:00:00Z',
    })
  })

  it('parses an eval broadcast payload with status', () => {
    expect(
      parseAlertEvent({ type: 'eval', id: 'e-1', status: 'ENTER', createdAt: '2026-07-08T12:00:00Z' }),
    ).toEqual({ type: 'eval', id: 'e-1', status: 'ENTER', createdAt: '2026-07-08T12:00:00Z' })
  })

  it('tolerates missing optional fields', () => {
    expect(parseAlertEvent({ type: 'eval' })).toEqual({
      type: 'eval',
      id: undefined,
      status: undefined,
      createdAt: undefined,
    })
  })

  it.each([null, undefined, 42, 'briefing', [], { type: 'other' }, {}])(
    'returns null for unrecognized payload %j',
    (payload) => {
      expect(parseAlertEvent(payload)).toBeNull()
    },
  )

  it('ignores non-string values in optional fields', () => {
    const event = parseAlertEvent({ type: 'briefing', id: 7, created_at: {} })
    expect(event).toEqual({ type: 'briefing', id: undefined, status: undefined, createdAt: undefined })
  })
})

describe('buildAlertContent', () => {
  it('titles a briefing alert "New briefing ready"', () => {
    const content = buildAlertContent({ type: 'briefing', id: 'b-1' })
    expect(content.title).toBe('New briefing ready')
    expect(content.tag).toBe('gekko-briefing-b-1')
  })

  it('titles an eval alert with the status, underscores humanized', () => {
    expect(buildAlertContent({ type: 'eval', status: 'ENTER' }).title).toBe('Entry eval: ENTER')
    expect(buildAlertContent({ type: 'eval', status: 'NO_ENTRY_NEAR' }).title).toBe(
      'Entry eval: NO ENTRY NEAR',
    )
  })

  it('falls back to UNKNOWN when an eval event carries no status', () => {
    expect(buildAlertContent({ type: 'eval' }).title).toBe('Entry eval: UNKNOWN')
  })

  it('includes an HH:MM UTC stamp when createdAt is parseable', () => {
    const content = buildAlertContent({
      type: 'briefing',
      createdAt: '2026-07-08T14:30:00Z',
    })
    expect(content.body).toContain('14:30 UTC')
  })

  it('passes an unparseable createdAt through verbatim rather than NaN-ing', () => {
    const content = buildAlertContent({ type: 'briefing', createdAt: 'not-a-date' })
    expect(content.body).toContain('not-a-date')
  })

  it('gives briefing and eval alerts distinct tags so they never replace each other', () => {
    expect(buildAlertContent({ type: 'briefing' }).tag).not.toBe(
      buildAlertContent({ type: 'eval' }).tag,
    )
  })
})
