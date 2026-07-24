-- feat-046: numeric TPO / Market Profile export. The Sierra study
-- GekkoTpoDataExporter writes tpo.data.md (Metadata + Summary + fenced csv of
-- Price,TPOCount,Letters); the uploader ships it as the `tpo_data` field and
-- ingest stores its object path here. Additive and nullable: bundles exported
-- before the study is deployed simply have no TPO data (the engine degrades
-- with a warning).

alter table public.raw_bundles
  add column if not exists tpo_data_ref text;

comment on column public.raw_bundles.tpo_data_ref is
  'Storage path (bundle-csvs) of tpo.data.md — numeric TPO / Market Profile export (feat-046).';
