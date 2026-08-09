-- Volatility-scaled significant-move floor (feat-096). UNITS CHANGE, not a
-- re-tune: `significant_move_pts` stored the entry-qualification floor as a raw
-- point count (feat-086, default 50). Bundle review 2026-08-07 D3 measured that
-- number against the 61 RTH sessions in bundle 1c15934a's own HTF export:
--
--   median RTH day range            464 pts  -> 50 pts = 11% of a day
--   median Parkinson session sigma  283 pts  -> 50 pts = 0.18 sigma
--   median 30-min bar range         110 pts  -> 50 pts = 0.45 of ONE bar
--
-- Fifty points is under half of one 30-minute bar, so every level on the map
-- cleared the floor and validateBriefing's reversal-room warning never fired.
-- The number was also fixed while the regime is not (the 20-session range
-- history in the same bundle runs 445-748 pts). The floor is therefore stored
-- as a MULTIPLE of the measured Parkinson session sigma (feat-095,
-- `lib/engine/volatilityScale.ts`) and resolved to points every run.
--
-- Default 0.4 sigma ~= 113 pts at the review's 283-pt reference sigma: one
-- median 30-min bar range, ~1.1 of the operator's average rotation (~102 pts),
-- and above feat-095's 0.25-sigma "noise" band, which the old 0.18-sigma floor
-- sat below. Rationale in full: lib/engine/scaledGates.ts.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260803190000_significant_move_pts.sql; `add column if not exists` plus the
-- guarded conversion block makes re-runs safe.

alter table public.config
  add column if not exists significant_move_sigma numeric not null default 0.4
    check (significant_move_sigma >= 0.05 and significant_move_sigma <= 2.0);

-- Units conversion. An operator's configured POINT value must never survive as
-- a sigma multiple (a stored 50 would read as 50 sigma ~= 14,000 pts and
-- abstain on every level), so the retired column is converted and dropped in
-- the same statement block:
--
--   * exactly 50 (the untouched feat-086 default -> never operator-tuned) takes
--     the new 0.4-sigma default rather than 50/283 = 0.18 sigma, which would
--     carry the no-op gate this feature exists to fix straight across;
--   * any other value was a deliberate operator choice expressed in points, so
--     it is converted proportionally at the 283-pt reference sigma and clamped
--     into the new CHECK range (the old 10-500 pt range maps to 0.04-1.77
--     sigma, so only the very bottom of it clamps).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'config'
      and column_name = 'significant_move_pts'
  ) then
    update public.config
      set significant_move_sigma = case
        when significant_move_pts = 50 then 0.40
        else greatest(0.05, least(2.0, round(significant_move_pts / 283.0, 2)))
      end;

    alter table public.config drop column significant_move_pts;
  end if;
end
$$;

comment on column public.config.significant_move_sigma is
  'Minimum expected reversal traverse a level must offer to anchor an objective entry (feat-086 entry-first contract), as a MULTIPLE of the measured Parkinson session sigma (feat-095) rather than a raw point count (feat-096 units change). Resolved to points per run against facts.volatilityScale.sessionSigmaPts and injected into the analyze/update prompts in BOTH units; the doctrine prefix never states the number. Default 0.4 sigma ~= 113 pts at the 283-pt reference sigma.';
