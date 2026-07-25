-- feat-048: daily value-area history export. The Sierra study
-- GekkoDailyValueAreasExporter writes daily-value-areas.csv
-- (Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume — rolling 20
-- completed RTH sessions, most recent first); the uploader ships it as the
-- `daily_va` field and ingest stores its object path here. Additive and
-- nullable: bundles exported before the study is deployed simply have no
-- value-area history (the engine degrades with a warning).

alter table public.raw_bundles
  add column if not exists daily_va_ref text;

comment on column public.raw_bundles.daily_va_ref is
  'Storage path (bundle-csvs) of daily-value-areas.csv — per-session POC/VAH/VAL history (feat-048).';
