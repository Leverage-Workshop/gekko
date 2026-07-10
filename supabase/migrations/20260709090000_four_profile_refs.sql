-- feat-036: four-profile export contract.
--
-- The real Sierra Chart export folder no longer writes vbp_export.md /
-- delta_vbp_export.md. It writes four profile exports instead:
--   four-hundred-rotation.vbp.md  — HTF volume profile, current 400-pt rotation
--   rolling-five-day.vbp.md      — HTF volume profile, last five days
--   half-rotation-delta.vbp.md   — execution delta profile, ~35-pt anchor
--   full-rotation-delta.vbp.md   — execution delta profile, ~75-pt anchor
--
-- The old columns are dropped rather than repurposed: reusing vol_profile_ref
-- for the rotation profile would silently change the semantics of historical
-- rows, and bundles are transient 30-second exports whose old refs carry no
-- value. Idempotent ALTER-style follow-up in the house style of
-- 20260708090000_high_conviction_flag.sql.

alter table public.raw_bundles
  add column if not exists rotation_vbp_ref text;

alter table public.raw_bundles
  add column if not exists five_day_vbp_ref text;

alter table public.raw_bundles
  add column if not exists half_rotation_delta_ref text;

alter table public.raw_bundles
  add column if not exists full_rotation_delta_ref text;

alter table public.raw_bundles
  drop column if exists vol_profile_ref;

alter table public.raw_bundles
  drop column if exists delta_profile_ref;

comment on column public.raw_bundles.rotation_vbp_ref is
  'Storage path (bundle-csvs) of four-hundred-rotation.vbp.md — HTF volume profile anchored to the current 400-pt rotation (feat-036).';

comment on column public.raw_bundles.five_day_vbp_ref is
  'Storage path (bundle-csvs) of rolling-five-day.vbp.md — HTF volume profile over the last five days (feat-036).';

comment on column public.raw_bundles.half_rotation_delta_ref is
  'Storage path (bundle-csvs) of half-rotation-delta.vbp.md — execution delta profile anchored ~35 pts / half rotation (feat-036).';

comment on column public.raw_bundles.full_rotation_delta_ref is
  'Storage path (bundle-csvs) of full-rotation-delta.vbp.md — execution delta profile anchored ~75 pts / full rotation (feat-036).';
