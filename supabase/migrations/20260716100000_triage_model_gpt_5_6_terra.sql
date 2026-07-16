-- Promote the triage (eval-task) model default from anthropic/claude-haiku-4-5
-- to openai/gpt-5.6-terra — the operator wants the eval on one of the verified
-- OpenAI models (2026-07-11 five-candidate check against the real schemas).
-- Terra already serves briefings (config.model_id), prices identically to
-- gpt-5.4 ($2.50/$15 per M tokens), and supports image input + structured
-- outputs, so the eval shares one model and one prompt-cache story.

alter table public.config
  alter column triage_model_id set default 'openai/gpt-5.6-terra';

-- Only migrate rows still on the old default; a deliberate operator override
-- of triage_model_id is left untouched.
update public.config
set triage_model_id = 'openai/gpt-5.6-terra',
    updated_at = now()
where id = 1
  and triage_model_id = 'anthropic/claude-haiku-4-5';
