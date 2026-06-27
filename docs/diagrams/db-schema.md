# Database Schema (Supabase / Postgres)

Source: `docs/agent-architecture-plan.md` → *Persistence* (lines 221–238), cross-checked
against the live migrations in `supabase/migrations/` (feat-005, **done**, applied to project
`qvhkqilizwozikpomxob`).

Five tables plus a singleton `config` row. Files (PNGs, CSVs) live in Supabase Storage; rows
hold string refs. Small JSON (MGI) is stored inline as `jsonb`. Current price is read from
the latest `raw_bundles` row — there is no separate hot-price store. RLS is enabled on all
tables with no policies (service-role-only access).

> Mermaid ER attribute types can't contain brackets, so Postgres `numeric[]` arrays
> (`entry_levels.targets`, `eval_results.targets`) are shown as `numeric_arr`.

```mermaid
erDiagram
  config {
    int id PK
    text model_id "default anthropic/claude-sonnet-4-6"
    text triage_model_id "default anthropic/claude-haiku-4-5"
    numeric rr_min "default 3.0"
    timestamptz updated_at
  }
  raw_bundles {
    uuid id PK
    timestamptz received_at
    jsonb mgi_json
    text exec_csv_ref
    text vol_profile_ref
    text delta_profile_ref
    text htf_png_ref
    text tpo_png_ref
    text exec_png_ref
    numeric current_price
    bool is_stale
  }
  briefings {
    uuid id PK
    uuid bundle_id FK
    timestamptz created_at
    text trigger_reason
    text model_id
    text htf_trend
    text rip_status
    jsonb terrain
    jsonb primary_obj
    jsonb secondary_obj
    jsonb danger_zones
    jsonb overview
    jsonb raw_model_json
  }
  entry_levels {
    uuid id PK
    uuid briefing_id FK
    text objective
    text label
    numeric price
    text direction
    numeric stop
    numeric_arr targets
    bool active "default true"
    timestamptz created_at
  }
  eval_results {
    uuid id PK
    uuid bundle_id FK
    timestamptz created_at
    text model_id
    bool near_entry
    text status "ENTER|WAIT|NOT_VALID|NO_ENTRY_NEAR"
    uuid evaluated_level_id FK
    text direction
    text trigger
    numeric stop
    numeric_arr targets
    text reason
    numeric current_price
    jsonb raw_model_json
  }

  raw_bundles ||--o{ briefings : "bundle_id"
  briefings  ||--o{ entry_levels : "briefing_id"
  raw_bundles ||--o{ eval_results : "bundle_id"
  entry_levels ||--o{ eval_results : "evaluated_level_id"
```

## `entry_levels` lifecycle

Each new briefing deactivates the prior set and inserts a fresh one; `eval-task` only ever
evaluates `active=true` rows (lines 230–236).

```mermaid
stateDiagram-v2
  [*] --> Active: analyze-task inserts new set (active=true)
  Active --> Inactive: next briefing → prior rows set active=false
  Inactive --> [*]
  note right of Active
    eval-task evaluates active=true rows only
  end note
```
