-- feat-031: Opus high-conviction review flag.
--
-- Doctrine (docs/agent-architecture-plan.md, "Decisions locked" + Phase 4):
-- anthropic/claude-opus-4-8 sits behind a config flag for max-fidelity
-- reviews. When high_conviction_enabled is true, the analyze-task routes the
-- FULL briefing generation to high_conviction_model_id instead of model_id —
-- maximum fidelity at higher cost/latency. The eval-task triage path is
-- deliberately unaffected: triage stays on the cheap triage_model_id.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260706190000_default_model_sonnet_5.sql; `add column if not exists`
-- makes re-runs safe. The model id is a column default, not a hardcode —
-- runtime routing always reads the config row.

alter table public.config
  add column if not exists high_conviction_enabled boolean not null default false;

alter table public.config
  add column if not exists high_conviction_model_id text not null default 'anthropic/claude-opus-4-8';

comment on column public.config.high_conviction_enabled is
  'When true, analyze-task routes full-briefing generation to high_conviction_model_id instead of model_id (feat-031). Eval triage is unaffected.';

comment on column public.config.high_conviction_model_id is
  'OpenRouter model id for high-conviction full-briefing reviews (default anthropic/claude-opus-4-8).';
