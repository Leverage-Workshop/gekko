-- feat-155: named config presets the operator switches between on /settings.
--
-- Presets are SNAPSHOTS. The config singleton (id = 1) stays the one live row
-- every pipeline reads (analyze / update / eval / Job planner untouched);
-- applying a preset copies its values into row 1 through the ordinary
-- /api/config write path, so ConfigUpdateSchema and the migration guard keep
-- working. `values` is jsonb holding exactly the ConfigUpdate fields (never
-- updated_at) so a new config column never needs a preset migration: loading a
-- preset merges its values over the live row, unknown keys are ignored and
-- missing keys keep the live value. The active preset is DERIVED (the preset
-- whose values equal the live row) rather than tracked on row 1.
--
-- RLS on, no policies: service-role only, like every other table.

create table if not exists public.config_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60),
  values jsonb not null check (jsonb_typeof(values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.config_presets enable row level security;

comment on table public.config_presets is
  'Named snapshots of the config singleton''s editable fields (feat-155); /settings loads one into the form, Save Settings writes row 1.';

comment on column public.config_presets.values is
  'jsonb of the ConfigUpdate fields (model ids, efforts, rr_min, sigma, bar volume, profile vision); never updated_at.';
