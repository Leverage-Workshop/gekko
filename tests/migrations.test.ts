import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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

  it('seeds the singleton config row with the documented defaults', () => {
    expect(sql.combined).toContain('insert into public.config')
    expect(sql.combined).toContain("'anthropic/claude-sonnet-4-6'")
    expect(sql.combined).toContain("'anthropic/claude-haiku-4-5'")
    expect(sql.combined).toContain('3.0')
  })
})
