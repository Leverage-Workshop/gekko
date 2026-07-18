-- feat-039: selection function for the scheduled bundle-cleanup task.
--
-- At the 15s export cadence the uploader lands ~240 raw_bundles/hour, but only
-- the handful a briefing or eval actually ran against are ever referenced.
-- Both referencing FKs (briefings.bundle_id, eval_results.bundle_id) are
-- ON DELETE CASCADE, so bulk-deleting a referenced bundle would silently
-- destroy the briefing/eval built on it — the cleanup task must only ever see
-- bundles with NO referencing rows. This function is the single place that
-- predicate lives.
--
-- Guards:
--   * NOT EXISTS on both FKs — referenced bundles are never candidates.
--   * received_at < p_cutoff — recent bundles stay (the newest serves current
--     price, and eval proximity reads the exec CSV of the latest bundle).
--   * the newest row is excluded unconditionally, belt-and-suspenders against
--     a caller passing a cutoff in the future.
--
-- Oldest-first ordering means repeated batched calls drain the backlog from
-- the tail. STABLE (read-only); the caller deletes rows itself after removing
-- the Storage objects the refs point to.

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
    and b.id <> (
      select id from public.raw_bundles order by received_at desc limit 1
    )
  order by b.received_at asc
  limit p_limit;
$$;

comment on function public.unused_bundles_before(timestamptz, integer) is
  'Cleanup candidates: raw_bundles older than the cutoff with no briefings/eval_results referencing them, never the newest row. Oldest first (feat-039).';
