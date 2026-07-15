entry_b = 29689.75  # OR Low breakdown
stop_b = 29708.00   # Above VRange Low (29703.00)
risk_b = stop_b - entry_b

print(f"Risk B: {risk_b:.2f} pts")
print(f"T2 Reward from Entry B: {entry_b - t2:.2f} pts | R/R: {(entry_b - t2)/risk_b:.2f}:1")
print(f"T3 Reward from Entry B: {entry_b - t3:.2f} pts | R/R: {(entry_b - t3)/risk_b:.2f}:1")