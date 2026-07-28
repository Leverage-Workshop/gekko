-- feat-061: operator directive — a short free-text steer the operator typed
-- into an objective card's header, honored by the update-task regeneration.
alter table public.briefings
  add column if not exists operator_directive jsonb;

comment on column public.briefings.operator_directive is
  'For directive-driven kind=update rows: {objective: primary|secondary, text} the operator submitted from the objective card (feat-061). Null for all other briefings. Shape mirrors OperatorDirective in lib/update/directive.ts.';
