-- feat-038: reinstate the Gem "Update" action as update-task.
--
-- Doctrine (gem-files/instructions.md, Prompt: "Update"): a lighter re-read
-- between full briefings — Immediate Tactical Read (location / rip status /
-- initiative) + a fresh Strategic Alignment (primary / secondary / danger
-- zones). An update persists as a NEW briefings row whose overview + terrain
-- carry forward from the parent briefing, so the dashboard and entry_levels
-- lifecycle work unchanged.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260708090000_high_conviction_flag.sql; `add column if not exists` makes
-- re-runs safe. Existing rows backfill to kind='morning' via the default.

alter table public.briefings
  add column if not exists kind text not null default 'morning';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'briefings_kind_check' and conrelid = 'public.briefings'::regclass
  ) then
    alter table public.briefings
      add constraint briefings_kind_check check (kind in ('morning', 'update'));
  end if;
end $$;

-- ON DELETE SET NULL, not cascade: a parent briefing cascade-deletes with its
-- raw_bundle, but an update row (which has its own bundle) should survive its
-- parent's deletion as a standalone briefing.
alter table public.briefings
  add column if not exists parent_briefing_id uuid references public.briefings (id) on delete set null;

alter table public.briefings
  add column if not exists tactical_read jsonb;

create index if not exists briefings_parent_briefing_id_idx
  on public.briefings (parent_briefing_id);

comment on column public.briefings.kind is
  'morning = full analyze-task briefing; update = update-task re-read that regenerates objectives/danger zones and inherits overview/terrain from parent_briefing_id (feat-038).';

comment on column public.briefings.parent_briefing_id is
  'For kind=update rows: the briefing whose overview/terrain this update inherited. Null for morning briefings (feat-038).';

comment on column public.briefings.tactical_read is
  'For kind=update rows: the Immediate Tactical Read {location, ripStatus, initiative} — model prose, mirrors TacticalRead in knowledge/schema/briefing.schema.ts (feat-038).';
