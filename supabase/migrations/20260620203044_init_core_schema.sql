-- Gekko core schema: config, raw_bundles, briefings, entry_levels, eval_results.
--
-- Advisory-only autonomous-briefing backend. All writes happen server-side
-- (Next.js API routes + trigger.dev tasks) using the Supabase service role,
-- which bypasses RLS. RLS is enabled on every table so the anon/authenticated
-- roles get NO access by default (these tables live in the API-exposed `public`
-- schema). Client-side read policies (e.g. for the briefing render page and
-- Realtime in later features) are added in their own migrations as needed.

-- ---------------------------------------------------------------------------
-- config: singleton row of run-time settings (model ids, R/R gate).
-- ---------------------------------------------------------------------------
create table if not exists public.config (
  id              integer primary key default 1 check (id = 1),
  model_id        text        not null default 'anthropic/claude-sonnet-4-6',
  triage_model_id text        not null default 'anthropic/claude-haiku-4-5',
  rr_min          numeric     not null default 3.0,
  updated_at      timestamptz not null default now()
);

comment on table public.config is 'Singleton run-time config (id is pinned to 1).';

-- ---------------------------------------------------------------------------
-- raw_bundles: one ingested export bundle (chart PNGs + CSVs + mgi JSON).
-- Files live in Storage; rows hold the object refs. Current price is read from
-- the latest bundle (there is no separate hot-price store).
-- ---------------------------------------------------------------------------
create table if not exists public.raw_bundles (
  id                uuid primary key default gen_random_uuid(),
  received_at       timestamptz not null default now(),
  mgi_json          jsonb,
  exec_csv_ref      text,
  vol_profile_ref   text,
  delta_profile_ref text,
  htf_png_ref       text,
  tpo_png_ref       text,
  exec_png_ref      text,
  current_price     numeric,
  is_stale          boolean not null default false
);

create index if not exists raw_bundles_received_at_idx
  on public.raw_bundles (received_at desc);

-- ---------------------------------------------------------------------------
-- briefings: a full LLM briefing produced from one bundle.
-- ---------------------------------------------------------------------------
create table if not exists public.briefings (
  id             uuid primary key default gen_random_uuid(),
  bundle_id      uuid not null references public.raw_bundles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  trigger_reason text,
  model_id       text,
  htf_trend      text,
  rip_status     text,
  terrain        jsonb,
  primary_obj    jsonb,
  secondary_obj  jsonb,
  danger_zones   jsonb,
  overview       jsonb,
  raw_model_json jsonb
);

create index if not exists briefings_created_at_idx
  on public.briefings (created_at desc);
create index if not exists briefings_bundle_id_idx
  on public.briefings (bundle_id);

-- ---------------------------------------------------------------------------
-- entry_levels: candidate entries attached to a briefing. On each new briefing
-- the prior set is marked active=false; the eval-task evaluates active=true only.
-- ---------------------------------------------------------------------------
create table if not exists public.entry_levels (
  id          uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings (id) on delete cascade,
  objective   text,
  label       text,
  price       numeric,
  direction   text check (direction in ('long', 'short')),
  stop        numeric,
  targets     numeric[],
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists entry_levels_active_idx
  on public.entry_levels (active) where active;
create index if not exists entry_levels_briefing_id_idx
  on public.entry_levels (briefing_id);

-- ---------------------------------------------------------------------------
-- eval_results: one entry-validity check at the current price.
-- ---------------------------------------------------------------------------
create table if not exists public.eval_results (
  id                 uuid primary key default gen_random_uuid(),
  bundle_id          uuid not null references public.raw_bundles (id) on delete cascade,
  created_at         timestamptz not null default now(),
  model_id           text,
  near_entry         boolean,
  status             text not null check (status in ('ENTER', 'WAIT', 'NOT_VALID', 'NO_ENTRY_NEAR')),
  evaluated_level_id uuid references public.entry_levels (id) on delete set null,
  direction          text,
  trigger            text,
  stop               numeric,
  targets            numeric[],
  reason             text,
  raw_model_json     jsonb,
  current_price      numeric
);

create index if not exists eval_results_created_at_idx
  on public.eval_results (created_at desc);
create index if not exists eval_results_bundle_id_idx
  on public.eval_results (bundle_id);

-- ---------------------------------------------------------------------------
-- Lock everything down: enable RLS with no policies, so only the service role
-- (which bypasses RLS) can touch these tables until read policies are added.
-- ---------------------------------------------------------------------------
alter table public.config       enable row level security;
alter table public.raw_bundles  enable row level security;
alter table public.briefings    enable row level security;
alter table public.entry_levels enable row level security;
alter table public.eval_results enable row level security;
