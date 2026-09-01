-- job_plan_bands: flat band rows of the LATEST ready Job plan, for chart overlays.
--
-- Consumed by the Sierra Chart "Gekko Job Plan Bands" study (ACS_Source/GekkoJobPlan.cpp)
-- with the anon key, mirroring how entry_levels feeds the Entry A Bands study. job_plans
-- itself stays service-role-only; this view deliberately runs with the owner's rights
-- (security_invoker = off) to expose ONLY the flattened band geometry of the newest
-- ready plan:
--   kind  = 'frame' (the trend-filter line) | 'long' | 'short'
--         | 'both' (a band carrying a long AND a short play)
--   label / low / high / trading_day
-- Stand-down (two-way enclosing-zone) plays are excluded — entries only.

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
    (plan->'frame'->>'price')::float8 as low,
    (plan->'frame'->>'price')::float8 as high,
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
