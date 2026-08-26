-- feat-128: the Job planner's own table + image bucket (docs/job-planning-task-plan.md
-- "Key decisions" 5, "Persistence and reproducibility").
--
-- job_plans — one row per job-plan-task RUN (run_id UNIQUE: attempt retries upsert
-- their own row, distinct operator presses are distinct rows). The row is written only
-- AFTER computation completes; status 'ready' carries the plan (CHECK), 'insufficient'
-- carries the reasons inside the plan and never overwrites a persisted 'ready' (the
-- task's write contract, lib/job-plan/runJobPlan.ts).
--
--   bundle_id          FK ON DELETE RESTRICT (audit trail): the pre-existing cleanup
--                      select/delete race becomes a loud failure instead of silent loss.
--   trading_day        the study's trading day the plan was built for.
--   status             'ready' | 'insufficient'.
--   planner_revision   PLANNER_REVISION at run time.
--   input_fingerprint  sha256 over the exact downloaded bytes consumed + PLANNER_REVISION
--                      + rendered image hashes + VISION_PROMPT_REVISION + vision model id;
--                      per-source hashes live in plan.meta.sourceHashes so a later Storage
--                      overwrite is detectable.
--   plan               the JobPlan (knowledge/schema/job-plan.schema.ts), verbatim.
--   warnings           string[] — the run's warnings (plan warnings + shell warnings).
--   profile_nodes      the vision read (consensus + raw samples + model/effort +
--                      VISION_PROMPT_REVISION + image hashes); NULL when the read was
--                      off (config.profile_vision_model_id NULL, R14).
--
-- Additive: creates a table, an index, a bucket and replaces one STABLE function.

create table if not exists public.job_plans (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.raw_bundles (id) on delete restrict,
  trading_day date not null,
  trigger_reason text not null default 'manual',
  status text not null check (status in ('ready', 'insufficient')),
  planner_revision text not null,
  input_fingerprint text not null,
  run_id text not null unique,
  plan jsonb,
  warnings jsonb not null default '[]'::jsonb,
  profile_nodes jsonb,
  created_at timestamptz not null default now(),
  constraint job_plans_ready_has_plan check (status <> 'ready' or plan is not null)
);

create index if not exists job_plans_bundle_id_idx
  on public.job_plans (bundle_id);

create index if not exists job_plans_created_at_idx
  on public.job_plans (created_at desc);

-- Service-role only, like bundle_requests / push_subscriptions: RLS on, NO policies.
alter table public.job_plans enable row level security;

comment on table public.job_plans is
  'Job planner output, one row per job-plan-task run (feat-128). status ready carries the JobPlan; insufficient carries the reasons. run_id is the trigger.dev run id (retries upsert their own row).';
comment on column public.job_plans.input_fingerprint is
  'sha256 over the exact downloaded bytes consumed + PLANNER_REVISION + rendered image hashes + VISION_PROMPT_REVISION + vision model id (feat-128).';
comment on column public.job_plans.profile_nodes is
  'The profile vision read (feat-123): consensus + raw samples + model/effort + VISION_PROMPT_REVISION + image hashes. NULL when the read was off (R14).';

-- The PNGs the vision read looked at, keyed by hash (`<sha256>.png`): operator grading
-- and the plan card's node overlay. Private, service-role only (no storage policies).
insert into storage.buckets (id, name, public)
values ('job-plan-images', 'job-plan-images', false)
on conflict (id) do nothing;

-- The cleanup selection function (feat-039) gains the job_plans guard IN THE SAME
-- MIGRATION: a bundle a plan was built on is never a cleanup candidate. Body otherwise
-- identical to 20260718100000_unused_bundles_fn.sql.
create or replace function public.unused_bundles_before(
  p_cutoff timestamptz,
  p_limit  integer
)
returns setof public.raw_bundles
language sql
stable
as $$
  select b.*
  from public.raw_bundles b
  where b.received_at < p_cutoff
    and not exists (
      select 1 from public.briefings br where br.bundle_id = b.id
    )
    and not exists (
      select 1 from public.eval_results ev where ev.bundle_id = b.id
    )
    and not exists (
      select 1 from public.job_plans jp where jp.bundle_id = b.id
    )
    and b.id <> (
      select id from public.raw_bundles order by received_at desc limit 1
    )
  order by b.received_at asc
  limit p_limit;
$$;

comment on function public.unused_bundles_before(timestamptz, integer) is
  'Cleanup candidates: raw_bundles older than the cutoff with no briefings/eval_results/job_plans referencing them, never the newest row. Oldest first (feat-039; job_plans guard feat-128).';
