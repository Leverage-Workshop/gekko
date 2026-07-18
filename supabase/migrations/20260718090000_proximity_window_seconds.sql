-- Nuanced eval proximity gate: the near-entry check now also considers the
-- high/low range of execution bars within a recent window, not just the
-- snapshot `raw_bundles.current_price` — a wick through a level that pulls
-- back between ~30s exports no longer yields a false NO_ENTRY_NEAR. This
-- column configures the window length; the code default mirrors it (60s,
-- roughly two export cycles of intrabar price action).

alter table public.config
  add column if not exists proximity_window_seconds integer not null default 60;

comment on column public.config.proximity_window_seconds is
  'Recency window (seconds) of execution bars whose high/low feeds the eval near-entry gate alongside the snapshot price.';
