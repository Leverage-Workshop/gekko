-- Reasoning-effort selectors for the three config model slots (2026-07-25
-- briefing audit, docs/briefing-audit-2026-07-25.md): the operator wants to
-- steer OpenRouter's `reasoning.effort` per model from /settings instead of
-- always running provider defaults (both gemini-3.6-flash and gpt-5.6-terra
-- default to "medium").
--
-- NULL means "provider default" — generateStructured sends no reasoning
-- parameter at all. Non-null values are constrained to the effort levels the
-- @openrouter/ai-sdk-provider accepts; providers reject efforts they don't
-- support, which surfaces as a failed run rather than silent degradation.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260708090000_high_conviction_flag.sql; `add column if not exists` makes
-- re-runs safe.

alter table public.config
  add column if not exists model_effort text
    check (model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh'));

alter table public.config
  add column if not exists triage_model_effort text
    check (triage_model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh'));

alter table public.config
  add column if not exists high_conviction_model_effort text
    check (high_conviction_model_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh'));

comment on column public.config.model_effort is
  'OpenRouter reasoning.effort for the full analyze/update briefing model; NULL = provider default.';

comment on column public.config.triage_model_effort is
  'OpenRouter reasoning.effort for the eval-task triage model; NULL = provider default.';

comment on column public.config.high_conviction_model_effort is
  'OpenRouter reasoning.effort for the high-conviction briefing model; NULL = provider default.';
