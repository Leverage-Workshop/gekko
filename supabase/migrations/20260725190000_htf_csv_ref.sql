-- feat-049: HTF 30-min bar export. The Sierra study GekkoHtfBarDataExporter
-- writes htf_bar_data.rolling.csv (DateTime,Open,High,Low,Close,Volume,
-- BidVolume,AskVolume — 30-min bars, chronological, rolling 90 days, current
-- partial bar last); the uploader ships it as the `htf_csv` field and ingest
-- stores its object path here. Additive and nullable: bundles exported before
-- the study is deployed simply have no HTF bar data (the engine degrades with
-- a warning).

alter table public.raw_bundles
  add column if not exists htf_csv_ref text;

comment on column public.raw_bundles.htf_csv_ref is
  'Storage path (bundle-csvs) of htf_bar_data.rolling.csv — 30-min HTF bars, rolling 90 days (feat-049).';
