-- Persist the eval-task's runtime warnings so the dashboard can explain
-- code-owned coercions. Until now the enforcement notes (e.g. "model returned
-- ENTER but the extreme counts confirm counter-initiative — coerced to WAIT")
-- only reached the trigger.dev run logs, leaving a demoted WAIT
-- indistinguishable from a model WAIT: the persisted row still shows the
-- model's all-pass checks and its pre-demotion reason.

alter table public.eval_results
  add column if not exists warnings jsonb;

comment on column public.eval_results.warnings is
  'string[] jsonb: eval-task runtime warnings (enforcement coercions, staleness, degraded inputs) captured at persist time; null when the run produced none.';
