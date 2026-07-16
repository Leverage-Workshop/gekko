-- Move the triage (eval-task) model from gpt-5.6-terra to gpt-5.6-luna, the
-- cost-efficient tier of the same OpenAI 5.6 series: $1.00/$6.00 per M tokens
-- vs terra's $2.50/$15 (~2.5x cheaper), same 1M context, image input +
-- structured outputs + reasoning. Entry checks are high-frequency and
-- latency-sensitive — luna's design point.

alter table public.config
  alter column triage_model_id set default 'openai/gpt-5.6-luna';

-- Only migrate rows still on the prior default; a deliberate operator
-- override of triage_model_id is left untouched.
update public.config
set triage_model_id = 'openai/gpt-5.6-luna',
    updated_at = now()
where id = 1
  and triage_model_id = 'openai/gpt-5.6-terra';
