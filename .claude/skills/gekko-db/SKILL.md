---
name: gekko-db
description: Interact with Gekko's Supabase database (project qvhkqilizwozikpomxob) directly via REST, without the Supabase MCP server. Use whenever a task needs to read or write config, raw_bundles, briefings, entry_levels, eval_results, bundle_requests, or push_subscriptions, download bundle files from storage, check applied migrations, or apply schema changes. Contains the full live schema snapshot.
---

# Gekko Supabase DB — direct access (no MCP)

The Supabase MCP server is disabled (token cost). Everything below uses `curl` against
the project's REST APIs. Schema snapshot taken 2026-07-26 (22 applied migrations).
If migrations have been added since, re-verify against `supabase/migrations/` before
trusting column lists.

## Connection & auth

- Project ref: `qvhkqilizwozikpomxob`
- URL: `https://qvhkqilizwozikpomxob.supabase.co`
- Credentials live in `.env` at the repo root. **Note:** the URL var is
  `NEXT_PUBLIC_SUPABASE_URL` (there is no plain `SUPABASE_URL` in `.env`).

```bash
set -a && source .env && set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
KEY="$SUPABASE_SERVICE_ROLE_KEY"   # bypasses RLS — full read/write on everything
AUTH=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
```

The service-role key is **production**. Reads are always safe; for UPDATE/DELETE always
include a filter (PostgREST rejects unfiltered writes only if you remember to — there is
no safety net) and prefer `select=` on writes to see what you touched.

## Query patterns (PostgREST)

```bash
# SELECT with filter/order/limit — always pass an explicit limit on big tables
curl -s "$URL/rest/v1/briefings?select=id,kind,created_at,htf_trend&order=created_at.desc&limit=5" "${AUTH[@]}"

# Common operators: eq, neq, gt, gte, lt, lte, like, ilike, in, is, not
curl -s "$URL/rest/v1/eval_results?status=eq.ENTER&created_at=gte.2026-07-25&select=id,status,reason" "${AUTH[@]}"

# Embedded joins via FK relationships
curl -s "$URL/rest/v1/briefings?select=id,kind,entry_levels(label,price,direction,active)&limit=3&order=created_at.desc" "${AUTH[@]}"

# Count without fetching rows
curl -s "$URL/rest/v1/raw_bundles?select=id" "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" -D - -o /dev/null | grep -i content-range

# INSERT (returns the row with Prefer: return=representation)
curl -s -X POST "$URL/rest/v1/bundle_requests" "${AUTH[@]}" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" -d '{"reason":"manual"}'

# UPDATE (always filtered!)
curl -s -X PATCH "$URL/rest/v1/config?id=eq.1" "${AUTH[@]}" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" -d '{"model_effort":"high"}'

# RPC (database function)
curl -s -X POST "$URL/rest/v1/rpc/unused_bundles_before" "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"p_cutoff":"2026-07-01T00:00:00Z","p_limit":10}'
```

JSONB columns come back as inline JSON — pipe to `jq` for readability. Filter into
JSONB with `->`/`->>`: `?primary_obj->>direction=eq.short`.

## Storage (private buckets: `bundle-csvs`, `chart-images`)

The `*_ref` columns on `raw_bundles` are object paths inside `bundle-csvs` (CSVs/MD)
or `chart-images` (PNGs).

```bash
# Download an object (ref value comes from a raw_bundles row)
curl -s "$URL/storage/v1/object/bundle-csvs/<ref>" "${AUTH[@]}" -o /tmp/file.csv

# List objects under a prefix. Objects are grouped in per-bundle folders, so the
# top level lists bundle-id folders (rows with id:null); pass a bundle id as the
# prefix to see that bundle's files.
curl -s -X POST "$URL/storage/v1/object/list/bundle-csvs" "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"prefix":"<bundle_id>","limit":20,"sortBy":{"column":"created_at","order":"desc"}}'
```

## Schema reference (public)

All tables have RLS **enabled**; the service-role key bypasses it. PK is `id` unless noted.

### config — singleton runtime config (`id` pinned to 1, `CHECK (id = 1)`)
| column | type | default / constraint |
|---|---|---|
| id | int | 1 (PK) |
| model_id | text | `'anthropic/claude-sonnet-5'` — full analyze/update briefing model (OpenRouter id) |
| triage_model_id | text | `'openai/gpt-5.6-luna'` — eval-task triage model |
| high_conviction_enabled | bool | false — when true, analyze-task routes to high_conviction_model_id |
| high_conviction_model_id | text | `'anthropic/claude-opus-4-8'` |
| model_effort / triage_model_effort / high_conviction_model_effort | text, nullable | CHECK in ('none','minimal','low','medium','high','xhigh'); NULL = provider default (feat-055) |
| rr_min | numeric | 3.0 |
| proximity_window_seconds | int | 60 — recency window of exec bars feeding the eval near-entry gate |
| updated_at | timestamptz | now() |

### raw_bundles — one row per ingested Sierra export bundle
| column | type | notes |
|---|---|---|
| id | uuid | gen_random_uuid() |
| received_at | timestamptz | now() |
| mgi_json | jsonb, nullable | parsed mgi_static_levels.json |
| current_price | numeric, nullable | |
| is_stale | bool | default false |
| exec_csv_ref, htf_png_ref, tpo_png_ref, exec_png_ref | text, nullable | storage refs |
| rotation_vbp_ref | text, nullable | four-hundred-rotation.vbp.md (feat-036) |
| balance_area_vbp_ref | text, nullable | balance-area.vbp.md (feat-037) |
| half_rotation_delta_ref / full_rotation_delta_ref | text, nullable | delta profiles ~35 / ~75 pts (feat-036) |
| tpo_data_ref | text, nullable | tpo.data.md numeric TPO export (feat-046) |
| daily_va_ref | text, nullable | daily-value-areas.csv POC/VAH/VAL history (feat-048) |
| htf_csv_ref | text, nullable | htf_bar_data.rolling.csv 30-min bars, rolling 90d (feat-049) |

### briefings — FK `bundle_id → raw_bundles.id`
| column | type | notes |
|---|---|---|
| id | uuid; created_at | |
| bundle_id | uuid | NOT NULL |
| kind | text | default 'morning'; CHECK in ('morning','update') |
| parent_briefing_id | uuid, nullable | FK → briefings.id; set for kind=update (feat-038) |
| trigger_reason, model_id, htf_trend, rip_status | text, nullable | |
| terrain, primary_obj, secondary_obj, danger_zones, overview, raw_model_json | jsonb, nullable | |
| tactical_read | jsonb, nullable | {location, ripStatus, initiative} for updates (feat-038) |
| operator_directive | jsonb, nullable | {objective: primary\|secondary, text} for directive-driven updates (feat-061) |

### entry_levels — FK `briefing_id → briefings.id`
| column | type | notes |
|---|---|---|
| id | uuid; created_at | |
| briefing_id | uuid | NOT NULL |
| objective, label | text, nullable | |
| price, stop | numeric, nullable | |
| direction | text, nullable | CHECK in ('long','short') |
| targets | numeric[], nullable | |
| active | bool | default true |

### eval_results — FKs `bundle_id → raw_bundles.id`, `evaluated_level_id → entry_levels.id`
| column | type | notes |
|---|---|---|
| id | uuid; created_at; model_id | |
| bundle_id | uuid | NOT NULL |
| status | text | CHECK in ('ENTER','WAIT','NOT_VALID','NO_ENTRY_NEAR') |
| near_entry | bool, nullable | |
| evaluated_level_id | uuid, nullable | |
| direction, trigger, reason | text, nullable | |
| stop | numeric, nullable; targets numeric[], nullable | |
| current_price | numeric, nullable | |
| checks | jsonb, nullable | EvalCheck[]: [{name, verdict: pass\|fail\|pending, note}] |
| next_signal | text, nullable | observable that flips WAIT/NOT_VALID → ENTER |
| caution | text, nullable | one line of what NOT to do |
| warnings | jsonb, nullable | string[] runtime warnings (feat: eval_result_warnings) |
| raw_model_json | jsonb, nullable | |

### bundle_requests — FK `bundle_id → raw_bundles.id` (feat: on-demand bundle pulls)
`id` uuid, `requested_at` timestamptz now(), `reason` text default 'manual',
`status` text default 'pending' CHECK in ('pending','fulfilled'),
`fulfilled_at` timestamptz nullable, `bundle_id` uuid nullable.

### push_subscriptions — Web Push (VAPID), one per opted-in browser (feat-027)
`id` uuid, `endpoint` text UNIQUE (natural key), `p256dh` text, `auth` text,
`created_at` timestamptz. Upserted by POST /api/push/subscribe; pruned on 404/410.

## Functions, triggers, realtime, RLS

- **`unused_bundles_before(p_cutoff timestamptz, p_limit int) → SETOF raw_bundles`** —
  bundles older than cutoff with no briefing and no eval, excluding the newest bundle.
  Used for cleanup. Call via `/rest/v1/rpc/unused_bundles_before`.
- **`gekko_broadcast_insert()`** — SECURITY DEFINER trigger fn on briefings/eval_results
  inserts; calls `realtime.send(...)` on private broadcast topic **`gekko:alerts`**
  (event `insert`, type `briefing`|`eval`). Swallows all errors so inserts never fail.
  Client topic constant: `lib/notifications/events.ts` GEKKO_ALERTS_TOPIC.
- **RLS policies**: only one — `anon` can SELECT `entry_levels` where `active = true`.
  Everything else is service-role-only. (The frontend otherwise goes through API routes.)
- **Buckets**: `chart-images`, `bundle-csvs` — both private.

## Migrations & DDL

- Migration SQL files: `supabase/migrations/*.sql` (repo). Live tracking table:
  `supabase_migrations.schema_migrations` (23 rows as of 2026-07-28).
- **Known drift**: live migration `20260719004952_entry_levels_anon_read_active` has
  no corresponding repo file — it added the anon RLS policy above. Don't be surprised
  by the count mismatch (22 repo files vs 23 live).
- Check applied migrations:
  `curl -s -X POST "$URL/rest/v1/rpc/..."` won't work for this — `schema_migrations`
  isn't exposed via PostgREST. Instead compare repo filenames against the snapshot
  above, or run SQL via one of the options below.
- **Arbitrary SQL / DDL cannot go through PostgREST.** No `psql` or `supabase` CLI is
  installed on this machine, and no Supabase access token / DB password is in `.env`.
  Options, in order of preference:
  1. Ask the user to re-enable the Supabase MCP server for the one migration.
  2. `npx supabase db push --db-url "postgresql://..."` — requires the user to supply
     the DB password (Supabase dashboard → Database settings).
  3. Management API `POST https://api.supabase.com/v1/projects/qvhkqilizwozikpomxob/database/query`
     with a personal access token (`sbp_...`) — requires the user to create one.
  Never apply DDL silently; migrations must also land as a file in `supabase/migrations/`.

## Gotchas

- The eval pipeline's config fetch uses `select('*')` + three-tier column degradation
  (full → pre-effort → legacy), so new config columns need care — see
  `lib/config` fetch layer before adding columns.
- Hosted PostgREST has no row cap configured — always pass `limit=` on
  `raw_bundles`/`briefings`/`eval_results` queries; `raw_model_json`/`mgi_json` rows
  are large.
- `config` seed values drift from column defaults (live: model_id
  `openai/gpt-5.6-terra`, triage `google/gemini-3.6-flash`). Never trust defaults for
  current values — read the row.
- Writes to `briefings`/`eval_results` fire the realtime broadcast trigger → the
  operator's browser gets an alert. Don't insert test rows into these tables in prod.
