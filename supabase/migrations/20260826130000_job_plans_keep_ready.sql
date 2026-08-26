-- feat-128 follow-up (Codex gate P1): make the job_plans write contract ATOMIC.
--
-- "An insufficient result never overwrites a persisted ready one" was enforced
-- task-side with a read-then-upsert; two overlapping attempts of the same run
-- could both read "no ready row" and the slower insufficient one could then
-- upsert over the other's ready plan. This BEFORE UPDATE trigger keeps the
-- persisted ready row whenever an update would demote it to insufficient: the
-- write becomes a no-op and RETURNING hands back the row as it stands, so the
-- task derives its outcome ('persisted' | 'kept-ready') from what the database
-- actually holds. Additive: one function + one trigger, no data change.

create or replace function public.job_plans_keep_ready()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'ready' and new.status = 'insufficient' then
    -- Keep the ready row verbatim (the returned row is the one written).
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists job_plans_keep_ready on public.job_plans;
create trigger job_plans_keep_ready
  before update on public.job_plans
  for each row execute function public.job_plans_keep_ready();

comment on function public.job_plans_keep_ready() is
  'job_plans write contract (feat-128): an UPDATE that would demote a ready row to insufficient keeps the ready row (no-op write).';
