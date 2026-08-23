-- feat-124: config knobs for the Job planner's profile vision read (feat-123).
-- docs/job-planning-task-plan.md "Model / effort".
--
--   profile_vision_model_id      NULL = the vision read is OFF. feat-128 treats a
--                                NULL model as "profile nodes unavailable" (R14):
--                                the operator turns the read ON by setting a model
--                                after ratifying R15 from feat-124's bench.
--   profile_vision_model_effort  OpenRouter reasoning.effort for the vision calls;
--                                NULL = provider default (same CHECK as the feat-055
--                                effort columns, 'max' included per feat-057).
--   profile_vision_samples       S in the P x S x T consensus (feat-123); 1..5,
--                                default 3.
--
-- Additive and idempotent (`add column if not exists`), house style of
-- 20260726000000_model_reasoning_effort.sql. Nothing reads these until feat-124's
-- fetchConfig tier + /settings, and the planner not until feat-128.

alter table public.config
  add column if not exists profile_vision_model_id text;

alter table public.config
  add column if not exists profile_vision_model_effort text
    check (profile_vision_model_effort in
      ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

alter table public.config
  add column if not exists profile_vision_samples integer not null default 3
    check (profile_vision_samples between 1 and 5);

comment on column public.config.profile_vision_model_id is
  'OpenRouter model id for the Job planner profile vision read (feat-124); NULL = read OFF (profile nodes unavailable, R14).';

comment on column public.config.profile_vision_model_effort is
  'OpenRouter reasoning.effort for the profile vision read; NULL = provider default (feat-124).';

comment on column public.config.profile_vision_samples is
  'Samples per profile image in the vision-read consensus (feat-123); 1..5, default 3 (feat-124).';
