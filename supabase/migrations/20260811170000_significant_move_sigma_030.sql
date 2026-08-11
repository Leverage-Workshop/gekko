-- Significant-move floor: 0.4 sigma -> 0.3 sigma (feat-112). A RE-TUNE of the
-- multiple, not a units change -- feat-096's decision to store the floor in
-- session sigma stands untouched.
--
-- Measured on the 2026-08-11 briefing (bundle b6f71b2e). The promoted terrain
-- borders were 29900 / 29718.75 / 29631.75 / 29450.5 -- spans of 181.25, 87 and
-- 181.25 pts -- with price at 29654, inside the 87-pt span. The floor resolved
-- to 145.56 pts, so the only border pairs clearing it were the outer two, and
-- both objectives were exiled to entries 246 pts above and 203 pts below the
-- market. The prior session's ENTIRE range was 181.25 pts.
--
-- 0.3 sigma ~= 77 pts at the 257-pt sigma that bundle measures under feat-112's
-- recency-weighted estimator, which clears the 87-pt span and restores the
-- near-border objectives. It is ~0.75 of the operator's ~102-pt average
-- rotation and still sits above feat-095's 0.25-sigma noise band. Full
-- rationale: lib/engine/scaledGates.ts.
--
-- Only an UNTOUCHED 0.4 is converted. Any other stored value was a deliberate
-- operator choice at /settings and is left exactly as it is -- the same rule
-- 20260809140000_volatility_scaled_gates.sql applied to the retired point
-- column. Idempotent: re-running finds no 0.4 left to move.

alter table public.config
  alter column significant_move_sigma set default 0.3;

update public.config
  set significant_move_sigma = 0.3
  where significant_move_sigma = 0.4;

comment on column public.config.significant_move_sigma is
  'Minimum expected reversal traverse a level must offer to anchor an objective entry (feat-086 entry-first contract), as a MULTIPLE of the measured recency-weighted Parkinson session sigma (feat-095, feat-112) rather than a raw point count (feat-096 units change). Resolved to points per run against facts.volatilityScale.sessionSigmaPts and injected into the analyze/update prompts in BOTH units; the doctrine prefix never states the number. Default 0.3 sigma (feat-112, was 0.4) ~= 77 pts at the 257-pt sigma of bundle b6f71b2e.';
