-- job_plan_bands: a TWO-WAY play (feat-152) is a purple ('both') band.
--
-- feat-152 adds a third play type: direction 'two-way' with stance 'two-way' — one play at
-- an unreached important level carrying both the fail and the hold in one slot. The view's
-- 'both' kind (the Sierra study's Two-Sided colour, purple) previously meant "a band
-- carrying a long AND a short play"; it now also covers a two-way play. The R10 stand-down
-- (direction 'two-way', stance 'stand-down') stays excluded as before.

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
     or (p->>'direction' = 'two-way' and p->>'stance' = 'two-way')
),
grouped as (
  select
    trading_day,
    band_key,
    min(label) as label,
    min(low) as low,
    max(high) as high,
    case
      when count(distinct direction) > 1 or bool_or(direction = 'two-way') then 'both'
      else min(direction)
    end as kind
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
