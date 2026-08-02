-- Execution-chart bar size as config (feat-079, Codex adversarial-review
-- finding #4): the system message's Chart Reading doctrine said "500 volume"
-- while every code surface and the live Sierra exporter use 750-volume bars —
-- the number was hardcoded prose in two places and drifted. The per-bar
-- volume is exporter METADATA the operator controls in Sierra Chart, so it
-- lives in the config row, is editable from /settings, and is injected into
-- the per-run user message; the cached doctrine prefix stays number-free.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260726000000_model_reasoning_effort.sql; `add column if not exists`
-- makes re-runs safe.

alter table public.config
  add column if not exists execution_bar_volume integer not null default 750
    check (execution_bar_volume >= 50 and execution_bar_volume <= 50000);

comment on column public.config.execution_bar_volume is
  'Per-bar volume of the Sierra execution-chart volume bars (exporter metadata, operator-controlled in Sierra). Injected into the analyze/update prompts; the doctrine prefix never states the number.';
