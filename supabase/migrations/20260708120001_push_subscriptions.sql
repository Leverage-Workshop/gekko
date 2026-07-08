-- feat-027: Web Push (VAPID) subscriptions.
--
-- One row per opted-in browser. The client registers the service worker,
-- calls pushManager.subscribe with the VAPID public key, and POSTs the
-- resulting subscription to /api/push/subscribe, which upserts here with the
-- service-role client (endpoint is the natural key — re-subscribing the same
-- browser refreshes its encryption keys instead of duplicating the row).
-- lib/push/sendPush.ts loads all rows, web-pushes to each, and prunes rows
-- whose push service answers 404/410 (subscription gone).
--
-- RLS is enabled with NO policies (house lockdown style): all reads/writes go
-- through the API route + tasks with the service role; the anon key gets
-- nothing.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push (VAPID) subscriptions, one per opted-in browser (feat-027). Upserted by POST /api/push/subscribe; pruned when the push service returns 404/410.';
comment on column public.push_subscriptions.endpoint is
  'Push-service URL identifying the subscription (unique natural key).';
comment on column public.push_subscriptions.p256dh is
  'Client public encryption key (subscription.keys.p256dh).';
comment on column public.push_subscriptions.auth is
  'Client auth secret (subscription.keys.auth).';

alter table public.push_subscriptions enable row level security;
