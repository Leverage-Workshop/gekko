-- Bundle requests: the "fresh bundle required" flag behind the dashboard's
-- run buttons. Clicking Briefing/Update/Eval inserts a pending row here; the
-- local uploader polls GET /api/ingest, sees the flag, and uploads exactly one
-- bundle; ingest then marks the pending rows fulfilled so the waiting task can
-- commence on the fresh bundle. Replaces the old always-on ~15s upload loop.
create table if not exists public.bundle_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  -- Which button asked: 'analyze' | 'update' | 'eval' (informational only).
  reason text not null default 'manual',
  status text not null default 'pending' check (status in ('pending', 'fulfilled')),
  fulfilled_at timestamptz,
  -- The bundle that satisfied the request. SET NULL so bundle cleanup
  -- (feat-039) never fails on or cascades into the request audit trail.
  bundle_id uuid references public.raw_bundles (id) on delete set null
);

-- The uploader's pending check and ingest's fulfil-all both filter on
-- status + recency.
create index if not exists bundle_requests_status_requested_at_idx
  on public.bundle_requests (status, requested_at desc);

-- Service-role only, like push_subscriptions: RLS on with NO policies.
alter table public.bundle_requests enable row level security;
