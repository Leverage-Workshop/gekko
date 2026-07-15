# Let's verify R/R for Secondary Objective (LONG)
# Option 1: Entry A at Weekly VWAP (29624.62) with stop below IB Low (29567.50)
entry_a_long = 29624.62
stop_a_long = 29605.00  # Below intermediate volume shelf
risk_a_long = entry_a_long - stop_a_long

t1_long = 29689.75      # OR Low
t2_long = 29746.74      # Rip
t3_long = 29815.75      # IB High / OR High (Volume Shelf at upper border of Kill Box)

print(f"Long Risk A: {risk_a_long:.2f} pts")
print(f"Long T1 Reward: {t1_long - entry_a_long:.2f} pts | R/R: {(t1_long - entry_a_long)/risk_a_long:.2f}:1")
print(f"Long T2 Reward: {t2_long - entry_a_long:.2f} pts | R/R: {(t2_long - entry_a_long)/risk_a_long:.2f}:1")
print(f"Long T3 Reward: {t3_long - entry_a_long:.2f} pts | R/R: {(t3_long - entry_a_long)/risk_a_long:.2f}:1")

# Let's check Entry B (Break): Reclaim above PDH (29752.50) at 29755.00
entry_b_long = 29755.00
stop_b_long = 29735.00  # Below Monthly VWAP (29743.41)
risk_b_long = entry_b_long - stop_b_long
print(f"\nLong Risk B: {risk_b_long:.2f} pts")
print(f"Long T3 Reward from Entry B: {t3_long - entry_b_long:.2f} pts | R/R: {(t3_long - entry_b_long)/risk_b_long:.2f}:1")