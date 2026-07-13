import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALERT_INSERT_EVENT, GEKKO_ALERTS_TOPIC } from '@/lib/notifications/events'

// Guard the Supabase migration set (feat-005). These run offline: they assert
// the checked-in SQL declares the schema the rest of the app depends on, so a
// stray edit that drops a table/column/constraint fails CI rather than prod.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

const sql = (() => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return {
    files,
    combined: files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n'),
  }
})()

describe('supabase migrations', () => {
  it('has migration files applied in timestamp order', () => {
    expect(sql.files.length).toBeGreaterThanOrEqual(3)
    expect([...sql.files]).toEqual([...sql.files].sort())
  })

  it.each(['config', 'raw_bundles', 'briefings', 'entry_levels', 'eval_results'])(
    'creates the %s table',
    (table) => {
      expect(sql.combined).toContain(`create table if not exists public.${table}`)
    },
  )

  it.each(['config', 'raw_bundles', 'briefings', 'entry_levels', 'eval_results'])(
    'enables RLS on %s',
    (table) => {
      expect(sql.combined).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      )
    },
  )

  it('constrains eval_results.status to the four allowed values', () => {
    for (const status of ['ENTER', 'WAIT', 'NOT_VALID', 'NO_ENTRY_NEAR']) {
      expect(sql.combined).toContain(`'${status}'`)
    }
  })

  it('declares the key eval_results columns', () => {
    for (const col of [
      'near_entry',
      'evaluated_level_id',
      'direction',
      'trigger',
      'stop',
      'targets',
      'reason',
      'raw_model_json',
      'current_price',
    ]) {
      expect(sql.combined).toContain(col)
    }
  })

  it('creates private storage buckets for PNGs and CSVs', () => {
    expect(sql.combined).toContain('storage.buckets')
    expect(sql.combined).toContain("'chart-images'")
    expect(sql.combined).toContain("'bundle-csvs'")
  })

  it('adds the high-conviction flag columns idempotently (feat-031)', () => {
    expect(sql.combined).toContain(
      'add column if not exists high_conviction_enabled boolean not null default false',
    )
    expect(sql.combined).toContain(
      "add column if not exists high_conviction_model_id text not null default 'anthropic/claude-opus-4-8'",
    )
  })

  it('keeps the high-conviction migration scoped to config ALTERs (no destructive DDL)', () => {
    const file = sql.files.find((f) => f.includes('high_conviction_flag'))
    expect(file).toBeDefined()
    const content = readFileSync(join(MIGRATIONS_DIR, file!), 'utf8')
    expect(content).toMatch(/alter table public\.config/)
    expect(content).not.toMatch(/drop\s/i)
    expect(content).not.toMatch(/delete\s+from/i)
  })

  it('renames five_day_vbp_ref to balance_area_vbp_ref guarded and non-destructively (feat-037)', () => {
    const file = sql.files.find((f) => f.includes('balance_area_vbp_ref'))
    expect(file).toBeDefined()
    const content = readFileSync(join(MIGRATIONS_DIR, file!), 'utf8')
    expect(content).toMatch(/rename column five_day_vbp_ref to balance_area_vbp_ref/)
    // Guarded so a re-run (column already renamed) is a no-op.
    expect(content).toMatch(/if exists\s*\(/i)
    expect(content).not.toMatch(/drop\s+(table|column)/i)
    expect(content).not.toMatch(/delete\s+from/i)
  })

  it('seeds the singleton config row with the documented defaults', () => {
    expect(sql.combined).toContain('insert into public.config')
    expect(sql.combined).toContain("'anthropic/claude-sonnet-4-6'")
    expect(sql.combined).toContain("'anthropic/claude-haiku-4-5'")
    expect(sql.combined).toContain('3.0')
  })
})

// feat-038: briefing "Update" action — kind / parent / tactical_read columns.
describe('briefing updates migration (feat-038)', () => {
  const file = sql.files.find((f) => f.includes('briefing_updates'))
  const content = file ? readFileSync(join(MIGRATIONS_DIR, file), 'utf8') : ''

  it('exists', () => {
    expect(file).toBeDefined()
  })

  it('adds the kind column idempotently with a morning default (backfills old rows)', () => {
    expect(content).toContain("add column if not exists kind text not null default 'morning'")
  })

  it('constrains kind to morning|update', () => {
    expect(content).toContain("check (kind in ('morning', 'update'))")
  })

  it('adds parent_briefing_id as a self-FK that survives parent deletion (set null, not cascade)', () => {
    expect(content).toMatch(
      /add column if not exists parent_briefing_id uuid references public\.briefings \(id\) on delete set null/,
    )
    expect(content).not.toMatch(/parent_briefing_id[^;]*cascade/i)
  })

  it('adds the tactical_read jsonb column and a parent index', () => {
    expect(content).toContain('add column if not exists tactical_read jsonb')
    expect(content).toContain(
      'create index if not exists briefings_parent_briefing_id_idx',
    )
  })

  it('contains no destructive DDL', () => {
    expect(content).not.toMatch(/drop\s+(table|column)/i)
    expect(content).not.toMatch(/delete\s+from/i)
  })
})

// feat-026: Realtime notifications go out over Broadcast (realtime.send from
// an AFTER INSERT trigger), NOT postgres_changes — so no anon SELECT policy
// on any public table and no publication change is ever needed.
describe('realtime notifications migration (feat-026)', () => {
  const file = sql.files.find((f) => f.includes('realtime_notifications'))
  const content = file ? readFileSync(join(MIGRATIONS_DIR, file), 'utf8') : ''

  it('exists', () => {
    expect(file).toBeDefined()
  })

  it('broadcasts via realtime.send on the topic/event the client subscribes to', () => {
    expect(content).toContain('realtime.send(')
    expect(content).toContain(`'${GEKKO_ALERTS_TOPIC}'`)
    expect(content).toContain(`'${ALERT_INSERT_EVENT}'`)
  })

  it('attaches AFTER INSERT triggers to briefings and eval_results', () => {
    expect(content).toMatch(/create trigger gekko_broadcast_briefing_insert\s+after insert on public\.briefings/)
    expect(content).toMatch(/create trigger gekko_broadcast_eval_insert\s+after insert on public\.eval_results/)
  })

  it('never fails the underlying INSERT (exception guard in the trigger fn)', () => {
    expect(content).toMatch(/exception\s+when others then/)
  })

  it('grants anon receive-only access scoped to broadcast + the single topic', () => {
    expect(content).toContain('on realtime.messages')
    expect(content).toContain('for select')
    expect(content).toMatch(/to anon/)
    expect(content).toContain("realtime.messages.extension = 'broadcast'")
    expect(content).toContain(`realtime.topic() = '${GEKKO_ALERTS_TOPIC}'`)
  })

  it('opens NO table data to anon: no policies on public tables, no publication change', () => {
    expect(content).not.toMatch(/alter publication/i)
    expect(content).not.toMatch(/create policy[^;]+on\s+public\./i)
    expect(content).not.toMatch(/grant\s/i)
  })

  it('is idempotent (create-or-replace + drop-if-exists before create)', () => {
    expect(content).toContain('create or replace function public.gekko_broadcast_insert()')
    expect(content).toMatch(/drop trigger if exists gekko_broadcast_briefing_insert/)
    expect(content).toMatch(/drop trigger if exists gekko_broadcast_eval_insert/)
    expect(content).toMatch(/drop policy if exists/)
  })
})

// feat-027: push_subscriptions storage for Web Push (VAPID).
describe('push_subscriptions migration (feat-027)', () => {
  const file = sql.files.find((f) => f.includes('push_subscriptions'))
  const content = file ? readFileSync(join(MIGRATIONS_DIR, file), 'utf8') : ''

  it('exists', () => {
    expect(file).toBeDefined()
  })

  it('creates the table idempotently with endpoint as the unique natural key', () => {
    expect(content).toContain('create table if not exists public.push_subscriptions')
    expect(content).toMatch(/endpoint\s+text not null unique/)
  })

  it('declares the web-push key columns and created_at', () => {
    expect(content).toMatch(/p256dh\s+text not null/)
    expect(content).toMatch(/auth\s+text not null/)
    expect(content).toMatch(/created_at\s+timestamptz not null default now\(\)/)
  })

  it('locks the table down: RLS enabled with NO policies (service-role only)', () => {
    expect(content).toMatch(/alter table public\.push_subscriptions\s+enable row level security/)
    expect(content).not.toMatch(/create policy/i)
  })

  it('contains no destructive DDL', () => {
    expect(content).not.toMatch(/drop\s/i)
    expect(content).not.toMatch(/delete\s+from/i)
  })
})
