-- feat-082: status-discriminated eval verdict contract. NOT_VALID verdicts no
-- longer carry a flip-to-ENTER nextSignal (a dead level does not resurrect on
-- one print); they state the advisory next step instead.
alter table public.eval_results
  add column if not exists revalidation_action text;

comment on column public.eval_results.revalidation_action is
  'NOT_VALID only (feat-082): the advisory next step now that the evaluated level is dead (e.g. run an Update after new structure forms). Null on every other status.';
