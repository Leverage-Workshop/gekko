-- feat-121: bundle plumbing for the Job-planning inputs (docs/job-planning-task-plan.md
-- step 2). Three new export files ride the existing uploader -> ingest -> Storage path:
--
--   job-study.json            -> job_study_ref      (bundle-csvs, application/json)
--   five-day-rolling.vbp.md   -> five_day_vbp_ref   (bundle-csvs, text/markdown)
--   four-hour-rolling.vbp.md  -> four_hour_vbp_ref  (bundle-csvs, text/markdown)
--
-- The filenames are the contract feat-118's Sierra exporter emits. Additive and
-- nullable: bundles exported before the exporter ships simply lack the refs, and the
-- job-plan task (feat-128) fails closed with a "bundle has no job-study export"
-- message rather than planning on stale inputs. Nothing in analyze/eval reads them.
--
-- Deliberately NOT touched here: `public.unused_bundles_before` (cleanup selection).
-- Its NOT EXISTS guard for job_plans lands with the migration that creates the
-- job_plans table (feat-128) — a guard referencing a table that does not exist yet
-- would fail to apply. Cleanup already removes every ref column in FILE_FIELDS, so
-- the new objects are covered without a SQL change.

alter table public.raw_bundles
  add column if not exists job_study_ref text;

alter table public.raw_bundles
  add column if not exists five_day_vbp_ref text;

alter table public.raw_bundles
  add column if not exists four_hour_vbp_ref text;

comment on column public.raw_bundles.job_study_ref is
  'Storage path (bundle-csvs) of job-study.json — JBA daily/weekly pivots, value zones, target ladders, chart-drawn balance areas, Autoplot extremes (feat-121; emitted by feat-118).';

comment on column public.raw_bundles.five_day_vbp_ref is
  'Storage path (bundle-csvs) of five-day-rolling.vbp.md — 5-day rolling volume profile for the Job planner vision read (feat-121).';

comment on column public.raw_bundles.four_hour_vbp_ref is
  'Storage path (bundle-csvs) of four-hour-rolling.vbp.md — 4-hour rolling volume profile for the Job planner vision read (feat-121).';
