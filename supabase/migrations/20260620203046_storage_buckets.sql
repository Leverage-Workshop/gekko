-- Storage buckets for ingested bundle files.
--
-- Two private buckets:
--   chart-images : HTF / TPO / exec PNG snapshots
--   bundle-csvs  : exec-bar + volume/delta profile CSV exports
--
-- Both are private (public = false): files are read/written server-side via the
-- service role. RLS on storage.objects stays at its default (no anon policies),
-- so only the service role can access objects until per-feature policies exist.

insert into storage.buckets (id, name, public)
values
  ('chart-images', 'chart-images', false),
  ('bundle-csvs', 'bundle-csvs', false)
on conflict (id) do nothing;
