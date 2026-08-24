---
name: gekko-db
description: Interact with Gekko's Supabase database (project qvhkqilizwozikpomxob) directly via REST, without the Supabase MCP server. Use whenever a task needs to read or write config, raw_bundles, briefings, entry_levels, eval_results, bundle_requests, or push_subscriptions, download bundle files from storage, check applied migrations, or apply schema changes. Contains the full live schema snapshot.
---

# Gekko Supabase DB — direct access (no MCP)

The Supabase MCP server is disabled (token cost). Everything below uses `curl` against
the project's REST APIs. Schema snapshot updated 2026-08-23 (33 applied migrations live;
nothing pending — latest applied: `20260823210000_job_study_split_refs.sql` via the
claude.ai Supabase MCP `apply_migration` tool, same day it landed in the repo).
If migrations have been added since, re-verify against `supabase/migrations/` before
trusting column lists.

## Connection & auth

- Project ref: `qvhkqilizwozikpomxob`
- URL: `https://qvhkqilizwozikpomxob.supabase.co`
- Credentials reach the process as **environment variables**. Locally they come from
  `.env` at the repo root; in Claude Code / CI sessions they are **injected directly into
  the environment and there is no `.env` file at all**. **Do not conclude the database is
  unreachable because `.env` is missing — check the environment first:**

  ```bash
  env | grep -E 'SUPABASE'    # NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
  ```

  (An earlier session wrongly reported "no credentials" after testing only for `.env`,
  which cost two features their live-data verification. Test the variables, not the file.)

- **Note:** the URL var is `NEXT_PUBLIC_SUPABASE_URL` — there is no plain `SUPABASE_URL`.

```bash
# Only if a .env exists; in an injected-env session the vars are already set and this
# line fails harmlessly — guard it rather than assuming either shape.
[ -f .env ] && { set -a && source .env && set +a; }
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
| model_effort / triage_model_effort / high_conviction_model_effort | text, nullable | CHECK in ('none','minimal','low','medium','high','xhigh','max'); NULL = provider default (feat-055; 'max' added 2026-08-04) |
| rr_min | numeric | 3.0 — display-only since feat-086 (no longer gates objectives) |
| significant_move_sigma | numeric | **0.3** (feat-112, was 0.4) — feat-086 entry-first contract, feat-096 units: min reversal traverse a level must offer to anchor an objective entry, as a MULTIPLE of the measured recency-weighted Parkinson session sigma (`lib/engine/volatilityScale.ts`) rather than raw points; CHECK 0.05–2.0; resolved to points per run (~77 pts at bundle b6f71b2e's 257-pt sigma, ~85 at the review's 283-pt reference) and injected into analyze/update prompts in BOTH units, /settings-editable. **Replaced `significant_move_pts` (int, default 50, CHECK 10–500), dropped by the feat-096 migration on 2026-08-11** — 50 pts was 0.18σ and filtered nothing (review D3), while 0.4σ over-filtered once the regime widened (feat-112) |
| proximity_window_seconds | int | 60 — recency window of exec bars feeding the eval near-entry gate |
| execution_bar_volume | int | 750 — per-bar volume of the Sierra execution-chart bars (feat-079); CHECK 50–50000; injected into analyze/update prompts, /settings-editable |
| profile_vision_model_id | text, nullable | Job planner profile vision read model (feat-124); NULL = read OFF (profile nodes unavailable, R14) |
| profile_vision_model_effort | text, nullable | CHECK in ('none','minimal','low','medium','high','xhigh','max'); NULL = provider default (feat-124) |
| profile_vision_samples | int | 3 — samples per profile image in the vision consensus (feat-123); CHECK 1–5 (feat-124) |
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
| job_study_daily_ref | text, nullable | job-study-daily.json — Job daily pivots/value zones/target ladders + chart-drawn JBA balance areas (feat-121, renamed from job_study_ref 2026-08-23 when the exporter split into two per-chart studies; NULL until the uploader ships it) |
| job_study_weekly_ref | text, nullable | job-study-weekly.json — Job weekly pivots/value zones/target ladders + Autoplot Balance Area extremes (added 2026-08-23 with the exporter split; NULL until the uploader ships it) |
| five_day_vbp_ref / four_hour_vbp_ref | text, nullable | five-day-rolling.vbp.md / four-hour-rolling.vbp.md rolling profiles for the Job planner vision read (feat-121) |

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
| next_signal | text, nullable | WAIT only (feat-082): observable that authorizes the level |
| revalidation_action | text, nullable | NOT_VALID only (feat-082): advisory next step for a dead level |
| caution | text, nullable | one line of what NOT to do |
| warnings | jsonb, nullable | string[] runtime warnings (feat: eval_result_warnings) |
| absorption_stack | jsonb, nullable | code-selected stall-confirmed absorption stack (ConfirmedAbsorptionCandidate, feat-072) |
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

- **Nothing is pending as of 2026-08-23.** `20260823210000_job_study_split_refs.sql`
  (renames `raw_bundles.job_study_ref` → `job_study_daily_ref`, adds
  `job_study_weekly_ref` — the feat-118 exporter split into two per-chart studies) was
  applied that day via the MCP tool below and verified in information_schema (first
  attempt was blocked by the permission classifier; the operator authorized a retry).
- Previously: feat-121's `20260822200000_job_input_refs.sql`
  (three nullable `raw_bundles` ref columns) and feat-124's
  `20260822210000_profile_vision_config.sql` (three `config` columns) were applied that day
  via the MCP tool below.
  Earlier: `20260809140000_volatility_scaled_gates.sql`
  had been committed-but-unapplied since 2026-08-09; it and feat-112's
  `20260811170000_significant_move_sigma_030.sql` were both applied on 2026-08-11 via the
  **claude.ai Supabase MCP `apply_migration` tool**, which IS reachable in Claude Code
  sessions even though this skill exists because the MCP is normally left disabled. Reach
  for it first when DDL is needed — it is far cheaper than the fallbacks below. Live
  `config` now returns `significant_move_sigma = 0.3` and no `significant_move_pts`.
  - Cost of letting that drift sit: for two days the operator's `/settings` value was
    dead. `fetchConfigRow` degraded exactly as designed — retry without the column, pad
    `significant_move_sigma` with the code default, set `significantMoveColumnMissing` —
    but only `/settings` surfaces that flag, so the analyze path silently enforced a
    ~146-pt floor while the stored row still said 50 pts. **A padded config default is
    invisible to the pipeline that consumes it; apply the migration the same day.**
- Migration SQL files: `supabase/migrations/*.sql` (repo). Live tracking table:
  `supabase_migrations.schema_migrations` (33 rows as of 2026-08-23; repo
  `20260802200000_revalidation_action.sql` applied via the claude.ai Supabase
  MCP, so its live timestamp differs from the filename).
- **Known drift**: live migration `20260719004952_entry_levels_anon_read_active` has
  no corresponding repo file — it added the anon RLS policy above. And live version
  timestamps can differ from repo filenames when applied via the claude.ai Supabase
  MCP (repo `20260731030000_absorption_stack.sql` is live `20260731033446`). Don't be
  surprised by count/name mismatches (29 repo files vs 30 live; repo `20260801090000_execution_bar_volume.sql`, `20260803190000_significant_move_pts.sql`, and `20260804000000_model_effort_max.sql` were applied live via the Supabase MCP, so their live timestamps differ. feat-112's two are the exception — `volatility_scaled_gates` and `significant_move_sigma_030` were applied under their own repo filenames' dates).
- Check applied migrations:
  `curl -s -X POST "$URL/rest/v1/rpc/..."` won't work for this — `schema_migrations`
  isn't exposed via PostgREST. Instead compare repo filenames against the snapshot
  above, or run SQL via one of the options below.
- **Arbitrary SQL / DDL cannot go through PostgREST.** The service-role key is a
  PostgREST credential: it bypasses RLS on data, but grants no DDL. `psql` **is** installed
  (`/usr/bin/psql`), so a direct connection is the shortest path *once someone supplies a
  connection string* — but no `SUPABASE_ACCESS_TOKEN` (`sbp_...`), `SUPABASE_DB_PASSWORD`
  or `postgresql://` URL is injected into the environment, so psql alone is not enough.
  Options, in order of preference:
  1. **The claude.ai Supabase MCP `apply_migration` tool** — verified working from Claude
     Code on 2026-08-11 (both feat-112 migrations went in this way). Load its schema with
     `ToolSearch("select:mcp__claude_ai_Supabase__apply_migration")`, then call it with
     `project_id: "qvhkqilizwozikpomxob"`, a snake_case `name` and the SQL. `list_migrations`
     confirms before/after. **Try this first** — earlier sessions assumed the server was
     disabled and escalated to the user unnecessarily, which is how a migration sat
     unapplied for two days.
  2. `npx supabase db push --db-url "postgresql://..."` — requires the user to supply
     the DB password (Supabase dashboard → Database settings).
  3. Management API `POST https://api.supabase.com/v1/projects/qvhkqilizwozikpomxob/database/query`
     with a personal access token (`sbp_...`) — requires the user to create one.
  Never apply DDL silently; migrations must also land as a file in `supabase/migrations/`.

## Gotchas

- The eval pipeline's config fetch uses `select('*')` + multi-tier column degradation
  (full → pre-significant-move → pre-bar-volume → pre-effort → legacy), so new config
  columns need care — see `lib/config` fetch layer before adding columns. Note the
  pre-significant-move tier now covers BOTH pre-feat-086 databases and databases still on
  the retired `significant_move_pts` column: the units differ, so a stale point value is
  never read as a sigma multiple.
- Hosted PostgREST has no row cap configured — always pass `limit=` on
  `raw_bundles`/`briefings`/`eval_results` queries; `raw_model_json`/`mgi_json` rows
  are large.
- `config` seed values drift from column defaults (live: model_id
  `openai/gpt-5.6-terra`, triage `google/gemini-3.6-flash`). Never trust defaults for
  current values — read the row.
- Writes to `briefings`/`eval_results` fire the realtime broadcast trigger → the
  operator's browser gets an alert. Don't insert test rows into these tables in prod.
