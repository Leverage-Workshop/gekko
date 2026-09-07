-- job_plan_bands: the frame row carries the frame BAND (feat-148).
--
-- Since feat-148 the plan's frame is a bias-line BAND (plan->'frame'->'low' / 'high';
-- a lone line has low = high) rather than a single price. The view's 'frame' row now
-- emits that range so the Sierra "Gekko Job Plan Bands" study draws the whole band;
-- pre-feat-148 plans (no low/high) fall back to the anchor price as before.
-- Everything else about the view is unchanged.

create or replace view public.job_plan_bands
with (security_invoker = off) as
with latest as (
  select plan, trading_day
  from public.job_plans
  where status = 'ready' and plan is not null
  order by created_at desc
  limit 1
),
directional as (
  select
    latest.trading_day,
    coalesce(p->'band'->>'bandId', p->'band'->>'label') as band_key,
    p->'band'->>'label' as label,
    (p->'band'->>'low')::float8 as low,
    (p->'band'->>'high')::float8 as high,
    p->>'direction' as direction
  from latest, jsonb_array_elements(latest.plan->'plays') as p
  where p->>'direction' in ('long', 'short')
),
grouped as (
  select
    trading_day,
    band_key,
    min(label) as label,
    min(low) as low,
    max(high) as high,
    case when count(distinct direction) > 1 then 'both' else min(direction) end as kind
  from directional
  group by trading_day, band_key
)
select kind, label, low, high, trading_day
from (
  select
    'frame'::text as kind,
    plan->'frame'->>'label' as label,
    coalesce((plan->'frame'->>'low')::float8, (plan->'frame'->>'price')::float8) as low,
    coalesce((plan->'frame'->>'high')::float8, (plan->'frame'->>'price')::float8) as high,
    trading_day,
    0 as ord
  from latest
  where jsonb_typeof(plan->'frame') = 'object'
  union all
  select kind, label, low, high, trading_day, 1 as ord
  from grouped
) bands
order by ord, low;

grant select on public.job_plan_bands to anon;
