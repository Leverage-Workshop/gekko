-- Seed the singleton config row. Idempotent: re-running leaves an existing
-- config row untouched (operators edit it later via the Config UI, feat-028).
insert into public.config (id, model_id, triage_model_id, rr_min)
values (1, 'anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 3.0)
on conflict (id) do nothing;
