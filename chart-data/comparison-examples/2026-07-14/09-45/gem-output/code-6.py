# Let's verify the exact R/R ratios for Primary Objective (SHORT)
entry_a = 29746.74  # Rip / Rolling Pivot
stop_a = 29765.00   # Structural invalidation above PDH (29752.50) / OR Mid (29752.75) and LVN border
risk_a = stop_a - entry_a

t1 = 29689.75       # OR Low (First Obstacle / Immediate S/R)
t2 = 29624.62       # Weekly VWAP (Next Acceptance Border / Standard Target)
t3 = 29567.50       # IB Low (Full Traverse of HTF Distribution / Shelf at bottom of Kill Box)

print(f"Risk A: {risk_a:.2f} pts")
print(f"T1 Reward: {entry_a - t1:.2f} pts | R/R: {(entry_a - t1)/risk_a:.2f}:1")
print(f"T2 Reward: {entry_a - t2:.2f} pts | R/R: {(entry_a - t2)/risk_a:.2f}:1")
print(f"T3 Reward: {entry_a - t3:.2f} pts | R/R: {(entry_a - t3)/risk_a:.2f}:1")