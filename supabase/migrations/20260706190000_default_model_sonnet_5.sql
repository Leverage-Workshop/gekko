-- feat-018: promote the briefing model default to anthropic/claude-sonnet-5.
-- 2026-07-06 OpenRouter catalog review (models-list, image input + structured
-- outputs): Sonnet 5 dominates the previous default sonnet-4-6 on the
-- Artificial Analysis intelligence/coding/agentic indices (53.4 vs 47.2 II)
-- at ~2/3 the price ($2/$10 vs $3/$15 per M tokens), same 1M context.
-- Escalation option: anthropic/claude-opus-4.8; budget: google/gemini-3.5-flash.

alter table public.config
  alter column model_id set default 'anthropic/claude-sonnet-5';

-- Only migrate rows still on the old default; a deliberate operator override
-- of model_id is left untouched.
update public.config
set model_id = 'anthropic/claude-sonnet-5',
    updated_at = now()
where id = 1
  and model_id = 'anthropic/claude-sonnet-4-6';
