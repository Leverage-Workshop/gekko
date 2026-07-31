-- feat-072: code-selected stall-confirmed absorption stack backing the eval's
-- Absorption condition — persisted verbatim (ConfirmedAbsorptionCandidate) so
-- the dashboard can render the stat row without re-scanning the bundle.
alter table public.eval_results
  add column if not exists absorption_stack jsonb;

comment on column public.eval_results.absorption_stack is
  'Code-selected stall-confirmed absorption stack nearest the evaluated level (ConfirmedAbsorptionCandidate; feat-072). Null when the scan found no confirmed stack.';
