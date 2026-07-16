-- Structured entry-eval verdicts: decompose the free-text `reason` paragraph
-- into named condition checks plus next-signal / caution lines so the dashboard
-- can render a scannable checklist instead of prose. Columns mirror the new
-- optional EvalResult fields (checks / nextSignal / caution); `reason` remains
-- the 1–2 sentence summary and the fallback for pre-migration rows.

alter table public.eval_results
  add column if not exists checks jsonb,
  add column if not exists next_signal text,
  add column if not exists caution text;

comment on column public.eval_results.checks is
  'EvalCheck[] jsonb: [{name, verdict: pass|fail|pending, note}] — the reason decomposed into named conditions.';
comment on column public.eval_results.next_signal is
  'The single concrete observable that would flip a WAIT/NOT_VALID to ENTER.';
comment on column public.eval_results.caution is
  'One line of what NOT to do right now.';
