# Patterns

Perception cheat sheets the model uses to read order flow and recognize setups at a border. These are
qualitative pattern-recognition aids — none are required to validate an entry on their own (baseline
absorption or exhaustion at a verified HTF border, supported by initiative telemetry, is sufficient),
but when present they are high-conviction catalysts and should be called out explicitly.

## Order-flow interpretation

### Absorption (clustered delta)
- **Appearance:** thick cluster at one price.
- **Timeframe:** 2–5 bars.
- **Meaning:** one side defending successfully.
- **Action:** continuation likely if defending the trend direction.

### Exhaustion (tapered delta)
- **Appearance:** tall cone shape.
- **Timeframe:** 1–2 bars.
- **Meaning:** final push failing.
- **Action:** reversal / fade opportunity.

### Rebid (blue strength)
- Red hits bid → blue reloads → price holds/advances.
- **Interpretation:** buyers defending, trend continuation.

### Reoffer (red strength)
- Blue lifts offer → red reloads → price stalls/reverses.
- **Interpretation:** sellers defending, potential reversal.

## Pattern 1 — Three-Push Exhaustion Trap

**Recognition triggers:**
- Mature/extended trend reaching resistance (ATH, prior high, or range top).
- Three failed pushes higher (the middle push is typically strongest).
- Blue delta stacking without price progress (exhaustion, not absorption).
- DOM shift from blue to red.
- A chop zone develops as price can't advance.

**Response template:**
> "Three-push exhaustion pattern at [level]. Middle push trapped longs; blue delta stacking shows
> exhaustion not absorption. Watch for trap confirmation via liquidation candle. Entry on retest of
> breakdown, target edge of structure / opposite side of chop zone."

This is the canonical trigger for the **Campaign Boundary Override** (see `system/constraints.md`)
when it fires at a Tier-1 border.

## Pattern 2 — Controlled Flush & Reload

**Recognition triggers:**
- Fast move into key support (composite edge, VWAP band).
- Heavy red delta at the low.
- Sudden blue emergence (initiative flip).
- No continuation lower.

**Response template:**
> "Flush into structure complete. Blue delta emerging at [level]. If DOM confirms reload, entry here
> with stop below structural low, target VWAP / midpoint."

## Failed-breakout / failed-breakdown reload

The directional generalization behind both eval ENTER conditions:
- **Failed breakout → reload back to border** = long ENTER cue (price reclaims the border after a
  failed push higher fails to extend).
- **Failed breakdown → reoffer back to border** = short ENTER cue (price reclaims the border from
  below after a failed push lower).

Always pair the visual pattern with confirming initiative before authorizing an entry — judged
from the recent bar SEQUENCE, not the window-mean delta. An absorbed flush leaves the mean carrying
the aggressor's color exactly when the entry confirms (a red flush into a long border reads
mean-negative while the tape is bullish); the mean only argues against the entry when the recent
bars agree with it and price is still on the wrong side of the level.
