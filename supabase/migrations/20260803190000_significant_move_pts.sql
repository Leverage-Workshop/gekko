-- Significant-move floor for objective selection (feat-086): the objective
-- contract is now entry-first — each slot answers "walking outward from
-- current price, what is the CLOSEST level with a decent probability of
-- reversal AND at least this much room for the reversal to travel". This
-- column is that room floor in points (operator directive 2026-08-03,
-- default 50). It replaces rr_min as the binding number in objective
-- construction; rr_min remains display-only.
--
-- Idempotent ALTER-style follow-up in the house style of
-- 20260801090000_execution_bar_volume.sql; `add column if not exists`
-- makes re-runs safe.

alter table public.config
  add column if not exists significant_move_pts integer not null default 50
    check (significant_move_pts >= 10 and significant_move_pts <= 500);

comment on column public.config.significant_move_pts is
  'Minimum expected reversal traverse (points) a level must offer to anchor an objective entry (feat-086 entry-first contract). Injected into the analyze/update prompts; the doctrine prefix never states the number.';
