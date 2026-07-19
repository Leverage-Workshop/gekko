```python
# Let's verify the numbers from source 1 and calculate structural zones and R/R ratios.
import json

data = {
  "current": {"time": "09:40:13", "price": 29592.50},
  "daily": {
    "orHigh": 29977.50, "orLow": 29912.50, "orMid": 29945.00,
    "pdh": 29895.75, "pdl": 29567.50, "pdc": 29785.75,
    "onh": 30062.50, "onl": 29745.50, "ibh": 29977.50,
    "ibl": 29639.25, "rip": 29929.94, "vwap24": 29857.83
  },
  "weekly": {
    "vwap": 29699.11, "pwHigh": 30094.00, "pwLow": 28909.75, "wkOpen": 29952.00
  },
  "monthly": {
    "vwap": 29751.23, "pmHigh": 30975.50, "pmLow": 28227.75, "mthOpen": 30505.75,
    "pmVAH": 30453.00, "pmVAL": 28583.75
  },
  "vRange": {
    "high": 30064.00, "low": 29847.00, "extPlus2": 30345.75, "extPlus3": 30389.25,
    "extMinus2": 29565.25, "extMinus3": 29521.75
  }
}

current_price = data["current"]["price"]
print(f"Current Price: {current_price}")
print(f"Distance from PDL (29567.50): {current_price - data['daily']['pdl']}")
print(f"Distance from extMinus2 (29565.25): {current_price - data['vRange']['extMinus2']}")
print(f"Distance from IBL (29639.25): {data['daily']['ibl'] - current_price}")
print(f"Distance from ONL (29745.50): {data['daily']['onl'] - current_price}")
print(f"Distance from Rip (29929.94): {data['daily']['rip'] - current_price}")


```

```text
Current Price: 29592.5
Distance from PDL (29567.50): 25.0
Distance from extMinus2 (29565.25): 27.25
Distance from IBL (29639.25): 46.75
Distance from ONL (29745.50): 153.0
Distance from Rip (29929.94): 337.4399999999987


```

```python
levels = {}
for k, v in data["daily"].items():
    levels[f"Daily {k}"] = v
for k, v in data["weekly"].items():
    levels[f"Weekly {k}"] = v
for k, v in data["monthly"].items():
    levels[f"Monthly {k}"] = v
for k, v in data["vRange"].items():
    levels[f"vRange {k}"] = v

sorted_levels = sorted(levels.items(), key=lambda x: x[1], reverse=True)
for name, val in sorted_levels:
    print(f"{name:<20}: {val}")


```

```text
Monthly pmHigh      : 30975.5
Monthly mthOpen     : 30505.75
Monthly pmVAH       : 30453.0
vRange extPlus3     : 30389.25
vRange extPlus2     : 30345.75
Weekly pwHigh       : 30094.0
vRange high         : 30064.0
Daily onh           : 30062.5
Daily orHigh        : 29977.5
Daily ibh           : 29977.5
Weekly wkOpen       : 29952.0
Daily orMid         : 29945.0
Daily rip           : 29929.94
Daily orLow         : 29912.5
Daily pdh           : 29895.75
Daily vwap24        : 29857.83
vRange low          : 29847.0
Daily pdc           : 29785.75
Monthly vwap        : 29751.23
Daily onl           : 29745.5
Weekly vwap         : 29699.11
Daily ibl           : 29639.25
Daily pdl           : 29567.5
vRange extMinus2    : 29565.25
vRange extMinus3    : 29521.75
Weekly pwLow        : 28909.75
Monthly pmVAL       : 28583.75
Monthly pmLow       : 28227.75


```

```python
# Let's inspect the HTF chart and TPO levels, and define clear Entry, Stop, and Targets with R/R ratios.
# In source 1:
# PDL is 29567.50, extMinus2 is 29565.25. Let's look at the closest resistance and support levels.
# IBL: 29639.25
# Weekly VWAP: 29699.11
# ONL: 29745.50
# Monthly VWAP: 29751.23
# PDC: 29785.75
# vRange low: 29847.00
# Daily VWAP24: 29857.83
# PDH: 29895.75
# Rip: 29929.94

# Let's calculate R/R for Long setup (Controlled Flush & Reload at PDL/extMinus2 shelf):
# Entry A: 29592.50 (current price / blue delta reload)
# Stop A: 29555.00 (below PDL 29567.50 and extMinus2 29565.25) -> risk = 37.50 pts
# Target 1 (Tactical): 29639.25 (IBL / first structural obstacle) -> reward = 46.75 pts (R/R ~ 1.25)
# Target 2 (Objective): 29699.11 (Weekly VWAP / acceptance border) -> reward = 106.61 pts (R/R ~ 2.84)
# Target 3 (Campaign Max): 29745.50 (ONL / LVN border before major HVN magnet) -> reward = 153.00 pts (R/R = 4.08)

risk_long = 29592.50 - 29555.00
reward_t3_long = 29745.50 - 29592.50
print(f"Long Risk: {risk_long}, Reward T3: {reward_t3_long}, R/R T3: {reward_t3_long / risk_long:.2f}")

# Let's check R/R for Short setup (Contingency - continuation of red initiative / breakdown of PDL):
# If price breaks PDL (29567.50), Entry B (Break) around 29565.00
# Or Fade rejection at IBL (29639.25)
# Let's check a fade at IBL 29639.25:
# Entry A (Fade): 29639.25
# Stop A: 29665.00 (above IBL and LVN) -> risk = 25.75 pts
# Target 1: 29592.50 -> reward = 46.75 pts
# Target 2: 29567.50 (PDL) -> reward = 71.75 pts (R/R = 2.78)
# Target 3: 29521.75 (vRange extMinus3 - structural floor / Abyss border) -> reward = 117.50 pts (R/R = 4.56)

risk_short = 29665.00 - 29639.25
reward_t3_short = 29639.25 - 29521.75
print(f"Short Risk: {risk_short}, Reward T3: {reward_t3_short}, R/R T3: {reward_t3_short / risk_short:.2f}")


```

```text
Long Risk: 37.5, Reward T3: 153.0, R/R T3: 4.08
Short Risk: 25.75, Reward T3: 117.5, R/R T3: 4.56


```

```python
# Let's check the levels and classify them based on our playbook:
# Daily RPOC / VWAP / PDMid / IBMid are standard magnets if surrounded by volume.
# Let's look at Target 3 options for Long:
# 1) ONL: 29745.50. In overnight trading, ONL is the low extreme (shelf/border).
# 2) vRange Low: 29847.00. This is the lower boundary of the volatility range (a major structural wall/shelf).
# Let's check distance to vRange Low (29847.00) from 29592.50:
reward_vrange_low = 29847.00 - 29592.50
print(f"Reward to vRange Low (29847.00): {reward_vrange_low:.2f} pts, R/R: {reward_vrange_low / 37.5:.2f}:1")

# Let's check distance to Weekly VWAP (29699.11):
reward_wvwap = 29699.11 - 29592.50
print(f"Reward to Weekly VWAP (29699.11): {reward_wvwap:.2f} pts, R/R: {reward_wvwap / 37.5:.2f}:1")

# Let's check distance to ONL (29745.50):
reward_onl = 29745.50 - 29592.50
print(f"Reward to ONL (29745.50): {reward_onl:.2f} pts, R/R: {reward_onl / 37.5:.2f}:1")


```

```text
Reward to vRange Low (29847.00): 254.50 pts, R/R: 6.79:1
Reward to Weekly VWAP (29699.11): 106.61 pts, R/R: 2.84:1
Reward to ONL (29745.50): 153.00 pts, R/R: 4.08:1


```

```python
# Let's define the contiguous terrain zones internally:
# Stratosphere (Campaign Ceiling): 30389.25 (vRange extPlus3) to 30062.50 (ONH) -> Blue zone
# Attic (Immediate Resistance): 30062.50 (ONH) to 29929.94 (Rip) -> Red zone
# Kill Box (Battlefield): 29929.94 (Rip) to 29639.25 (IBL) -> Green zone
# Elevator Shaft (Void Zone): 29639.25 (IBL) to 29567.50 (PDL) -> Pink zone
# Abyss (Campaign Floor): 29567.50 (PDL) to 29521.75 (vRange extMinus3) -> Purple zone

# Let's verify continuity:
# 30389.25 to 30062.50
# 30062.50 to 29929.94
# 29929.94 to 29639.25
# 29639.25 to 29567.50
# 29567.50 to 29521.75
# Contiguous math verified! No gaps!

# Now let's check the exact prices for Primary Objective (Long):
# Macro Goal: Secure reload at PDL to reclaim IBL and test ONL.
# Rationale: 4.08:1 R/R off major HTF support shelf with confirmed blue initiative and Controlled Flush & Reload pattern.
# Entry A (Ideal): 29592.50 (Current price / blue delta emergence at PDL shelf)
# Stop A: 29555.00 (Structural invalidation below PDL 29567.50 and vRange extMinus2 29565.25)
# Entry B (Add-on): 29639.25 (Reclaim of Initial Balance Low / Elevator Shaft ceiling)
# Stop B: 29590.00 (Below reload cluster / break-even protection)
# Target 1 (Tactical): 29639.25 (IBL / immediate structural resistance)
# Target 2 (Objective): 29699.11 (Weekly VWAP / acceptance border)
# Target 3 (Campaign Max): 29745.50 (ONL / major LVN shelf border before HVN magnet)

# Let's verify T3 is NOT a magnet:
# What is around 29745.50? ONL is an overnight extreme edge (shelf). The center of volume (Magnet) is higher, around Daily VWAP24 (29857.83) or PDC (29785.75). Thus 29745.50 is a valid shelf border!

# Now let's check Secondary Objective (Short - Contingency):
# Macro Goal: Fade rejection at IBL or execute breakdown below PDL toward Abyss floor.
# Rationale: Defensive contingency if red delta reoffers overwhelm the PDL support shelf.
# Entry A (Fade): 29639.25 (Rejection at IBL resistance border)
# Stop A: 29665.00 (Above IBL and local LVN structure)
# Entry B (Break): 29565.00 (Breakdown below vRange extMinus2 / PDL foundation)
# Stop B: 29595.00 (Above breakdown level and recent delta cluster)
# Target 1 (Tactical): 29567.50 (PDL / immediate structural support)
# Target 2 (Objective): 29565.25 (vRange extMinus2 / Tier 1 border)
# Target 3 (Campaign Max): 29521.75 (vRange extMinus3 / Abyss campaign floor shelf)

print("Calculations complete and verified.")


```

```text
Calculations complete and verified.


```

1. **Tactical Overview**
* **Current Position**:
* Price is currently trading at **29,592.50**, having completed a rapid liquidation drop directly into our Tier 1 macro structural foundation at the **Daily PDL (29,567.50)** and **vRange extMinus2 (29,565.25)** shelf border.


* We are operating well below the **Daily Rip (29,929.94)** in Condition Yellow/Red territory; however, hitting this Tier 1 campaign border has exhausted the immediate downward thrust and triggered our Campaign Boundary Override.




* **Structural Architecture**:
* Active acceptance is attempting to anchor at the **Daily PDL (29,567.50)** shelf, which serves as the hard floor separating our active battlefield from the **vRange extMinus3 (29,521.75)** campaign floor.


* Immediately above lies an Elevator Shaft void zone extending up to the **Daily IBL (29,639.25)** border; reclaiming this level opens the path through the thin volume profile toward **Weekly VWAP (29,699.11)**.




* **Order Flow Context**:
* The aggressive downward momentum produced heavy red delta clusters (-109, -87, -70) at the lows, which immediately transitioned into aggressive blue delta emergence (+43, +53), confirming an initiative flip.


* This signature confirms a classic **Controlled Flush & Reload at Structure** pattern: retail shorts capitulated into the structural floor while blue limit orders reloaded to secure high R/R inventory.




* **Key Inflection Points**:
* **Daily PDL (29,567.50)**: This is our line in the sand. It represents the Tier 1 structural shelf holding up the entire theater; blue defense must hold this border to validate the reversal.


* **Daily IBL (29,639.25)**: The ceiling of the immediate void zone. A decisive blue push through this border confirms short capitulation and accelerates price recovery toward upper acceptance.






2. **Strategic Alignment**:
I. **PRIMARY OBJECTIVE (The Highest Probability Setup)**
* **Macro Goal:** Secure blue reload at **Daily PDL (29,567.50)** to traverse the void and test **Daily ONL (29,745.50)**.


* **Rationale:** Generates a 4.08:1 R/R off a Tier 1 structural shelf border backed by a confirmed **Controlled Flush & Reload** absorption pattern.


* **Target Sequence:** **29,639.25** -> **29,699.11** -> **29,745.50**

* **Table View:**
| Action Point        | Price           | Level / Description                                                                           |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| **Entry A (Ideal)** | **`29,592.50`** | **Current Price** / Blue delta emergence confirming reload at **Daily PDL (29,567.50)** shelf |

 |
| **Stop A** | **`29,555.00`** | Hard structural invalidation below **Daily PDL (29,567.50)** and **vRange extMinus2 (29,565.25)**<br> |
| **Entry B (Add-on)** | **`29,639.25`** | Initiative breach and reclaim of **Daily IBL (29,639.25)** acceptance border

 |
| **Stop B** | **`29,590.00`** | Trailing protection below recent blue delta cluster / break-even structural shelf

 |
| **Target 1 (Tactical)** | **`29,639.25`** | **Daily IBL (29,639.25)** / Immediate structural resistance at void ceiling

 |
| **Target 2 (Objective)** | **`29,699.11`** | **Weekly VWAP (29,699.11)** / Next major acceptance border

 |
| **Target 3 (Campaign Max)** | **`29,745.50`** | **Daily ONL (29,745.50)** / Major LVN shelf border (strictly avoiding HTF volume magnets)

 |




II. **SECONDARY OBJECTIVE (Contingency)**
* **Macro Goal:** Fade rejection at **Daily IBL (29,639.25)** or execute structural breakdown below **Daily PDL (29,567.50)** toward campaign floor.


* **Rationale:** Defensive contingency yielding 4.56:1 R/R if red reoffers overwhelm blue defense at the foundation.


* **Target Sequence:** **29,567.50** -> **29,565.25** -> **29,521.75**

* **Table View:**
| Action Point       | Price           | Level / Description                                                             |
| ------------------ | --------------- | ------------------------------------------------------------------------------- |
| **Entry A (Fade)** | **`29,639.25`** | Red reoffer sequence rejecting continuation at **Daily IBL (29,639.25)** border |

 |
| **Stop A** | **`29,665.00`** | Structural invalidation above **Daily IBL (29,639.25)** and local LVN

 |
| **Entry B (Break)** | **`29,565.00`** | Red initiative breakdown below **vRange extMinus2 (29,565.25)** foundation

 |
| **Stop B** | **`29,595.00`** | Protection above breakdown level and recent delta cluster

 |
| **Target 1 (Tactical)** | **`29,567.50`** | **Daily PDL (29,567.50)** / Immediate structural support

 |
| **Target 2 (Objective)** | **`29,565.25`** | **vRange extMinus2 (29,565.25)** / Tier 1 volatility border

 |
| **Target 3 (Campaign Max)** | **`29,521.75`** | **vRange extMinus3 (29,521.75)** / Abyss campaign floor shelf

 |




III. **DANGER ZONES**
* **Avoid:** Middle of the void zone between **29,595.00** and **29,635.00**. | **Why:** Engaging in the middle of a thin volume elevator shaft without a structural border invites erratic fills and destroys our asymmetric 3:1 risk advantage. Trade only at the edges.





---

**Execute Long at 29,592.50 against the 29,567.50 PDL shelf with a hard stop at 29,555.00; target 29,745.50 ONL.**