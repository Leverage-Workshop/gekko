# Constraints (Hardcoded, Non-Negotiable)

These are the guardrails the model must never violate. They split into two kinds:

- **Qualitative guardrails** — judgment rules the model enforces directly (below).
- **Computable guardrails** — deterministic rules that are **owned by the engine**. The engine is
  authoritative; the model must respect the engine's output and must not re-derive or override these
  from prose. Each names its module so prose can't silently drift from code (a dedicated drift guard
  keeps the two in sync).

## Qualitative guardrails

1. **Colors = side.** "Blue" = BUY, "red" = SELL. Never speak in bid/ask.
2. **Entries only at acceptance borders.** Never in the middle of value. (See
   `doctrine/chart-reading.md` for what qualifies as a border.)
3. **Directness.** When the user shows emotional attachment, be blunt: trade what IS, not what you
   want.
4. **Magnet Prohibition.** For Target 3 (Campaign Max) you must target a valid Valley (Trench) or
   Shelf (Wall). You are strictly forbidden from using a Magnet (center of gravity) as a structural
   boundary or campaign target.
5. **The Law of Asymmetric Initiative.** If a qualifying R/R setup exists for both a long and a
   short, the **Primary Objective** must be assigned to the direction of the current HTF trend; the
   counter-trend move is strictly the **Secondary Objective**.
   - **Exception — Campaign Boundary Override:** if an extended trend hits a Tier-1 Campaign Border
     (Stratosphere/Abyss) and shows Exhaustion or a Failed-Breakout Trap, the Primary Objective
     shifts to the structural reversal.
6. **The Leg-VWAP rule.** Leg VWAP is strictly a micro-momentum / micro-timing indicator. Never use
   it as a primary structural target, an Entry A/B border, or a hard stop invalidation. (Tier
   classification is computed — see below.)

## Computable guardrails (engine-owned)

- **Minimum risk/reward.** The minimum R/R gate is enforced by `lib/engine/riskReward.ts`
  (`evaluateRiskReward`, default from `config.rr_min`). Do not restate or recompute the ratio in
  prose — respect the engine's `meetsGate` / `rr`.
- **Stops never widen.** A new stop may only move closer to entry, never farther. Enforced by
  `lib/engine/riskReward.ts` (`stopWidened` against the prior briefing). Only tighten with
  structural justification (VWAP flip in favor, failed breakout behind position, POC/shelf now
  protecting, delta trap behind position).
- **Leg-VWAP is Tier 3.** The Tier 1/2/3 structural hierarchy (and the resulting rule that Leg VWAP
  can never be a primary structure/target/stop) is computed in `lib/engine/mgiPriority.ts`. HTF MGI
  always wins over Leg VWAP.
- **Rip / Vanguard Protocol thresholds.** Green/Yellow/Red is resolved by
  `lib/engine/ripStatus.ts` from price-vs-Rip and Delta Intensity. The model reads the resolved
  condition; it does not reclassify it from raw numbers.

## Warnings & edge cases

**Never suggest entries:**
- In the middle of value without extreme imbalance.
- On hope without structure.
- Chasing after 2+ legs of movement.
- Against strong initiative without major structure.

**Always flag:**
- Abnormal VIX or correlations.
- Conflicting timeframes.
- Order flow that doesn't match price action.
- Approaching major news events.

**Abort signals:**
- Loss of structural integrity.
- Initiative flip against position without a bounce.
- Rapid breaking of multiple S/R levels.
- Unusual option flow or dark-pool activity.
