```python
import json

data = {
  "current": {"time": "09:44:31", "price": 29718.00},
  "daily": {
    "orHigh": 29815.75, "orLow": 29689.75, "orMid": 29752.75,
    "pdh": 29752.50, "pdl": 29393.25, "pdc": 29466.25,
    "onh": 29921.75, "onl": 29303.50,
    "ibh": 29815.75, "ibl": 29567.50,
    "rip": 29746.74, "vwap24": 29640.52
  },
  "weekly": {
    "vwap": 29624.62, "pwHigh": 30094.00, "pwLow": 28909.75, "wkOpen": 29952.00
  },
  "monthly": {
    "vwap": 29743.41, "pmHigh": 30975.50, "pmLow": 28227.75,
    "mthOpen": 30505.75, "pmVAH": 30453.00, "pmVAL": 28583.75
  },
  "vRange": {
    "high": 29919.00, "low": 29703.00,
    "extPlus2": 30199.50, "extPlus3": 30242.50,
    "extMinus2": 29422.50, "extMinus3": 29379.50
  }
}

print("Current Price:", data['current']['price'])
print("Rip:", data['daily']['rip'])
print("Price vs Rip:", data['current']['price'] - data['daily']['rip'])
print("Monthly VWAP:", data['monthly']['vwap'])
print("Weekly Open:", data['weekly']['wkOpen'])
print("ONH:", data['daily']['onh'])
print("ONL:", data['daily']['onl'])
print("VRange High:", data['vRange']['high'])
print("VRange Low:", data['vRange']['low'])


```

```text
Current Price: 29718.0
Rip: 29746.74
Price vs Rip: -28.7400000000016
Monthly VWAP: 29743.41
Weekly Open: 29952.0
ONH: 29921.75
ONL: 29303.5
VRange High: 29919.0
VRange Low: 29703.0


```

```python
import pandas as pd

df = pd.read_csv('execution_bar_data.rolling.csv')
print(df.tail(15))
print("\nColumns:", df.columns.tolist())


```

```text
                DateTime      Open      High       Low     Close   LegVWAP  DeltaIntensity
235  2026-07-14 09:34:48  29759.18  29780.00  29759.18  29767.25      0.00             2.0
236  2026-07-14 09:35:17  29763.22  29773.50  29751.00  29765.69      0.00             2.0
237  2026-07-14 09:35:31  29764.45  29793.00  29764.00  29780.38      0.00             2.0
238  2026-07-14 09:36:04  29772.41  29800.00  29771.75  29786.25      0.00             2.0
239  2026-07-14 09:36:34  29779.33  29790.00  29766.25  29778.19      0.00            -2.0
240  2026-07-14 09:37:06  29778.76  29782.00  29757.50  29769.56      0.00            -3.0
241  2026-07-14 09:38:07  29774.16  29792.75  29755.00  29774.12      0.00            -2.0
242  2026-07-14 09:38:54  29774.14  29789.00  29767.00  29782.38      0.00            -3.0
243  2026-07-14 09:39:37  29778.26  29800.00  29778.26  29790.38      0.00            -2.0
244  2026-07-14 09:40:24  29784.32  29801.50  29765.75  29783.94  29785.66            -3.0
245  2026-07-14 09:41:14  29784.13  29788.00  29763.50  29774.75  29779.79            -4.0
246  2026-07-14 09:42:11  29779.44  29779.44  29753.75  29765.00  29773.71            -4.0
247  2026-07-14 09:42:56  29772.22  29772.22  29729.25  29744.44  29765.98            -4.0
248  2026-07-14 09:43:38  29758.33  29758.33  29722.25  29730.69  29758.92            -4.0
249  2026-07-14 09:44:31  29744.51  29744.51  29715.75  29718.00  29754.56            -4.0

Columns: ['DateTime', 'Open', 'High', 'Low', 'Close', 'LegVWAP', 'DeltaIntensity']


```

```python
# Let's inspect the exact MGI levels and organize them chronologically / structurally from top to bottom
levels = {
    "Monthly Open": 30505.75,
    "Prior Month VAH": 30453.00,
    "Prior Week High": 30094.00,
    "Weekly Open": 29952.00,
    "Overnight High (ONH)": 29921.75,
    "VRange High": 29919.00,
    "OR High": 29815.75,
    "IB High": 29815.75,
    "Prior Day High (PDH)": 29752.50,
    "OR Mid": 29752.75,
    "Rip (Rolling Pivot)": 29746.74,
    "Monthly VWAP": 29743.41,
    "VRange Low": 29703.00,
    "OR Low": 29689.75,
    "24-Hour VWAP": 29640.52,
    "Weekly VWAP": 29624.62,
    "IB Low": 29567.50,
    "Prior Day Close (PDC)": 29466.25,
    "Prior Day Low (PDL)": 29393.25,
    "Overnight Low (ONL)": 29303.50,
    "Prior Week Low": 28909.75,
    "Prior Month VAL": 28583.75
}

sorted_levels = sorted(levels.items(), key=lambda x: x[1], reverse=True)
for name, price in sorted_levels:
    print(f"{name:25}: {price:.2f}")


```

```text
Monthly Open             : 30505.75
Prior Month VAH          : 30453.00
Prior Week High          : 30094.00
Weekly Open              : 29952.00
Overnight High (ONH)     : 29921.75
VRange High              : 29919.00
OR High                  : 29815.75
IB High                  : 29815.75
OR Mid                   : 29752.75
Prior Day High (PDH)     : 29752.50
Rip (Rolling Pivot)      : 29746.74
Monthly VWAP             : 29743.41
VRange Low               : 29703.00
OR Low                   : 29689.75
24-Hour VWAP             : 29640.52
Weekly VWAP              : 29624.62
IB Low                   : 29567.50
Prior Day Close (PDC)    : 29466.25
Prior Day Low (PDL)      : 29393.25
Overnight Low (ONL)      : 29303.50
Prior Week Low           : 28909.75
Prior Month VAL          : 28583.75


```

```python
# Let's check the price range of the data and see what makes logical sense for the 5 contiguous zones
# Stratosphere (Campaign Ceiling) -> Abyss (Campaign Floor)
# Let's list all candidate structural boundaries from top to bottom:
# 30505.75 (Monthly Open) - let's see if 30094.00 (Prior Week High) is the campaign ceiling or 30094
# Let's check the levels around current price (29718.00):
# Above current price:
# 29743.41 (Monthly VWAP)
# 29746.74 (Rip / Rolling Pivot)
# 29752.50 (PDH)
# 29815.75 (OR High / IB High)
# 29919.00 (VRange High)
# 29921.75 (ONH)
# 29952.00 (Weekly Open)
# 30094.00 (Prior Week High)

# Below current price:
# 29703.00 (VRange Low)
# 29689.75 (OR Low)
# 29640.52 (24-Hour VWAP)
# 29624.62 (Weekly VWAP)
# 29567.50 (IB Low)
# 29466.25 (PDC)
# 29393.25 (PDL)
# 29303.50 (ONL)
# 28909.75 (Prior Week Low)

print("Current Price is at 29718.00")


```

```text
Current Price is at 29718.00


```

```python
# Let's print out the relationships and see how the zones stack up cleanly:
print("Top / Stratosphere:", 30094.00, "(Prior Week High)")
print("Level / Boundary 1:", 29952.00, "(Weekly Open)")
print("Level / Boundary 2:", 29815.75, "(IB High / OR High)")
print("Level / Boundary 3:", 29752.50, "(PDH / OR Mid / Rip cluster around 29746-29752)")
print("Level / Boundary 4:", 29624.62, "(Weekly VWAP / 24h VWAP cluster around 29624-29640)")
print("Level / Boundary 5:", 29567.50, "(IB Low)")
print("Level / Boundary 6:", 29393.25, "(PDL)")
print("Level / Boundary 7:", 29303.50, "(ONL)")
print("Bottom / Abyss:", 28909.75, "(Prior Week Low)")


```

```text
Top / Stratosphere: 30094.0 (Prior Week High)
Level / Boundary 1: 29952.0 (Weekly Open)
Level / Boundary 2: 29815.75 (IB High / OR High)
Level / Boundary 3: 29752.5 (PDH / OR Mid / Rip cluster around 29746-29752)
Level / Boundary 4: 29624.62 (Weekly VWAP / 24h VWAP cluster around 29624-29640)
Level / Boundary 5: 29567.5 (IB Low)
Level / Boundary 6: 29393.25 (PDL)
Level / Boundary 7: 29303.5 (ONL)
Bottom / Abyss: 28909.75 (Prior Week Low)


```

```python
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


```

```text
Risk A: 18.26 pts
T1 Reward: 56.99 pts | R/R: 3.12:1
T2 Reward: 122.12 pts | R/R: 6.69:1
T3 Reward: 179.24 pts | R/R: 9.82:1


```

```python
entry_b = 29689.75  # OR Low breakdown
stop_b = 29708.00   # Above VRange Low (29703.00)
risk_b = stop_b - entry_b

print(f"Risk B: {risk_b:.2f} pts")
print(f"T2 Reward from Entry B: {entry_b - t2:.2f} pts | R/R: {(entry_b - t2)/risk_b:.2f}:1")
print(f"T3 Reward from Entry B: {entry_b - t3:.2f} pts | R/R: {(entry_b - t3)/risk_b:.2f}:1")


```

```text
Risk B: 18.25 pts
T2 Reward from Entry B: 65.13 pts | R/R: 3.57:1
T3 Reward from Entry B: 122.25 pts | R/R: 6.70:1


```

```python
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


```

```text
Long Risk A: 19.62 pts
Long T1 Reward: 65.13 pts | R/R: 3.32:1
Long T2 Reward: 122.12 pts | R/R: 6.22:1
Long T3 Reward: 191.13 pts | R/R: 9.74:1

Long Risk B: 20.00 pts
Long T3 Reward from Entry B: 60.75 pts | R/R: 3.04:1


```

```csv
Price,Price 2 (Rect only),Note,Color,Line Type,Line Width,Text Alignment
29952.00,30094.00,,blue,2,2,
29815.75,29952.00,,red,2,2,
29567.50,29815.75,,green,2,2,
29303.50,29567.50,,pink,2,2,
28909.75,29303.50,,purple,2,2,
30094.00,,,yellow,3,5,
29952.00,,,yellow,3,5,
29921.75,,,yellow,3,5,
29815.75,,,yellow,3,5,
29752.50,,,yellow,3,5,
29746.74,,,yellow,3,5,
29624.62,,,yellow,3,5,
29567.50,,,yellow,3,5,
29303.50,,,yellow,3,5,
28909.75,,,yellow,3,5,

```

1. **Tactical Overview**
* **Current Position**:
* Price is trading at **29718.00** within the active **Kill Box** (**29567.50** - **29815.75**), positioned below the **OR Mid** (**29752.75**) and **Monthly VWAP** (**29743.41**) resistance cluster after rejecting the upper boundary.
* We are operating under **Condition Red (Control Flipped)**; price has breached the **Rip** (**29746.74**) by -28.74 points with heavy red delta building beneath it, confirming short-term seller initiative.


* **Structural Architecture**:
* Active acceptance is anchored between **Weekly VWAP** (**29624.62**) and **IB High** / **OR High** (**29815.75**), with a major volume shelf (Wall) protecting the **IB Low** (**29567.50**) border.
* Below **IB Low** (**29567.50**) lies a steep **Elevator Shaft** (void zone) extending down to the overnight support shelf at **ONL** (**29303.50**).


* **Order Flow Context**:
* Sellers hold overwhelming initiative with **Delta Intensity** pinned at **-4.0** and price trading below the **Leg VWAP** (**29754.56**) micro-trend baseline.
* A classic **Failed Breakout Trap** executed at **OR High** (**29815.75**), where stacked blue delta was absorbed and rejected by aggressive reoffers, triggering a liquidation flush down through the **Rip** (**29746.74**).


* **Key Inflection Points**:
* **Rip** (**29746.74**) / **PDH** (**29752.50**): Immediate tactical ceiling; holding reoffers below this border validates short continuation, while a decisive reclaim invalidates the seller thesis.
* **Weekly VWAP** (**29624.62**): Primary structural support and macro magnet; a failure here exposes the **IB Low** (**29567.50**) shelf and the void zone below.




2. **Strategic Alignment**:
I. **PRIMARY OBJECTIVE (The Highest Probability Setup)**
* **Macro Goal:** Fade reoffers at the **Rip** (**29746.74**) resistance border to test **Weekly VWAP** (**29624.62**) and **IB Low** (**29567.50**).
* **Rationale:** 3:1+ R/R short setup off LVN resistance with confirmed red initiative (**Delta Intensity -4.0**) following a **Failed Breakout Trap** at **OR High** (**29815.75**).
* **Target Sequence:** **OR Low** (**29689.75**) -> **Weekly VWAP** (**29624.62**) -> **IB Low** (**29567.50**)
* **Table View:**
| Action Point                | Price      | Level / Description                                                                                   |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| **Entry A (Ideal)**         | `29746.74` | **Rip** (**29746.74**) / **Monthly VWAP** (**29743.41**) LVN resistance border reoffer                |
| **Stop A**                  | `29765.00` | Structural invalidation above **PDH** (**29752.50**) and **OR Mid** (**29752.75**)                    |
| **Entry B (Add-on)**        | `29689.75` | Breakdown confirmation below **OR Low** (**29689.75**) acceptance border                              |
| **Stop B**                  | `29708.00` | Structural invalidation above **VRange Low** (**29703.00**)                                           |
| **Target 1 (Tactical)**     | `29689.75` | **OR Low** (**29689.75**) immediate S/R obstacle                                                      |
| **Target 2 (Objective)**    | `29624.62` | **Weekly VWAP** (**29624.62**) standard acceptance target                                             |
| **Target 3 (Campaign Max)** | `29567.50` | **IB Low** (**29567.50**) full traverse of HTF distribution to Volume Shelf (Wall) at bottom of range |




II. **SECONDARY OBJECTIVE (Contingency)**
* **Macro Goal:** Execute a **Controlled Flush & Reload** from **Weekly VWAP** (**29624.62**) support to target **OR High** (**29815.75**).
* **Rationale:** Defensive long posture if red selling momentum exhausts into major HTF support and DOM confirms blue refill.
* **Target Sequence:** **OR Low** (**29689.75**) -> **Rip** (**29746.74**) -> **OR High** (**29815.75**)
* **Table View:**
| Action Point                | Price      | Level / Description                                                                          |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| **Entry A (Fade)**          | `29624.62` | **Weekly VWAP** (**29624.62**) support flush with confirmed blue absorption                  |
| **Stop A**                  | `29605.00` | Structural invalidation below intermediate volume shelf protecting **IB Low** (**29567.50**) |
| **Entry B (Break)**         | `29755.00` | Reclaim confirmation above **PDH** (**29752.50**) and **Rip** (**29746.74**) border          |
| **Stop B**                  | `29735.00` | Structural invalidation below **Monthly VWAP** (**29743.41**)                                |
| **Target 1 (Tactical)**     | `29689.75` | **OR Low** (**29689.75**) immediate resistance rebound                                       |
| **Target 2 (Objective)**    | `29746.74` | **Rip** (**29746.74**) rolling pivot and mean-reversion target                               |
| **Target 3 (Campaign Max)** | `29815.75` | **IB High** / **OR High** (**29815.75**) full traverse to upper Volume Shelf (Wall)          |




III. **DANGER ZONES**
* **Avoid:** Trading inside the middle of value between **Monthly VWAP** (**29743.41**) and **OR Mid** (**29752.75**) without confirmed initiative. | **Why:** Center-of-gravity consensus zones act as meat grinders; entries in the middle of value lack structural protection and violate the 3:1 R/R requirement.



**Action**: Execute short reoffers at the **Rip** (**29746.74**) resistance border with stop at **29765.00**, targeting **Weekly VWAP** (**29624.62**). Structure is defined; trust the plan.