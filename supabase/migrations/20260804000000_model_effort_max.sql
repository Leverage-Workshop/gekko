-- Add 'max' to the allowed reasoning-effort values for the three config model
-- slots. OpenRouter documents `reasoning.effort = "max"` (~95% of max_tokens,
-- the same allocation as 'xhigh'), so the /settings selector now offers it and
-- the check constraints must accept it.
--
-- The original constraints were declared inline by
-- 20260726000000_model_reasoning_effort.sql, so they carry Postgres's
-- auto-generated <table>_<column>_check names. Drop-and-recreate with
-- `if exists` keeps re-runs safe; no rows are touched.

alter table public.config
  drop constraint if exists config_model_effort_check;
alter table public.config
  add constraint config_model_effort_check
    check (model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

alter table public.config
  drop constraint if exists config_triage_model_effort_check;
alter table public.config
  add constraint config_triage_model_effort_check
    check (triage_model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

alter table public.config
  drop constraint if exists config_high_conviction_model_effort_check;
alter table public.config
  add constraint config_high_conviction_model_effort_check
    check (high_conviction_model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
