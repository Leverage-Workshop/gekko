-- feat-037: the rolling five-day export is replaced by balance-area.vbp.md —
-- an HTF volume profile anchored to the Balance Area (a balance starts when
-- two days of overlapping value occur and expands while following days keep
-- overlapping value; exceptions exist for a peak above/below).
-- Rename rather than drop+add: the ref semantics (long-term HTF VbP object
-- path) are unchanged; only the anchor definition moved.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raw_bundles'
      and column_name = 'five_day_vbp_ref'
  ) then
    alter table public.raw_bundles
      rename column five_day_vbp_ref to balance_area_vbp_ref;
  end if;
end $$;

comment on column public.raw_bundles.balance_area_vbp_ref is
  'Storage path (bundle-csvs) of balance-area.vbp.md — HTF volume profile anchored to the current Balance Area (feat-037).';
