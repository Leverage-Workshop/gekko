-- feat-118 follow-up: the Job source studies live on TWO charts (Daily Job Pivot + JBA
-- boxes on one, Weekly Job Pivot + Autoplot Balance Area on another), so the single
-- JobStudyExporter split into two Sierra studies writing two files:
--
--   job-study-daily.json  -> job_study_daily_ref   (dailyPivots + JBA balance areas)
--   job-study-weekly.json -> job_study_weekly_ref  (weeklyPivots + Autoplot extremes)
--
-- job_study_ref (feat-121) is renamed to job_study_daily_ref: the one-file exporter was
-- never deployed, the column is all-NULL, and nothing reads it yet (the parser lands
-- with feat-125), so the rename is contract-safe. Additive otherwise.

do $$
begin
  if exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_bundles'
      and column_name = 'job_study_ref'
  ) then
    alter table public.raw_bundles rename column job_study_ref to job_study_daily_ref;
  end if;
end $$;

alter table public.raw_bundles
  add column if not exists job_study_weekly_ref text;

comment on column public.raw_bundles.job_study_daily_ref is
  'Storage path (bundle-csvs) of job-study-daily.json — Job daily pivots, value zones, target ladders, chart-drawn JBA balance areas (feat-121; emitted by feat-118''s Gekko Job Daily Exporter).';

comment on column public.raw_bundles.job_study_weekly_ref is
  'Storage path (bundle-csvs) of job-study-weekly.json — Job weekly pivots, value zones, target ladders, Autoplot Balance Area extremes (feat-121; emitted by feat-118''s Gekko Job Weekly Exporter).';
