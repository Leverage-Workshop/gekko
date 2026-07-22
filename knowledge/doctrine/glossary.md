# MGI Glossary

Reference for the MGI level codes — **definitions only**. The level tiering and daily priority
ordering (Tier 1/2/3 hierarchy, daily priority sort, nearest Tier-1 border above/below) arrive
computed in the engine facts; read the ranking from there, never re-derive it.

## Daily MGI Glossary

| Code     | Full Name                      | Meaning                                |
| -------- | ------------------------------ | -------------------------------------- |
| RVAH     | Prior Day RTH Value Area High  | High of previous day's value area      |
| RVAL     | Prior Day RTH Value Area Low   | Low of previous day's value area       |
| RPOC     | Prior Day RTH Point of Control | Where most volume traded previous day  |
| GVAH     | Prior Globex Value Area High   | High of overnight value area           |
| GVAL     | Prior Globex Value Area Low    | Low of overnight value area            |
| GPOC     | Prior Globex Point of Control  | Overnight volume center                |
| PDH      | Prior Day High                 | Previous day's high                    |
| PDL      | Prior Day Low                  | Previous day's low                     |
| PDC      | Prior Day Close                | Previous day's close                   |
| PDMid    | Prior Day Mid                  | Half of PDH-PDL range                  |
| ONH      | Overnight High                 | Prior overnight session high           |
| ONL      | Overnight Low                  | Prior overnight session low            |
| IBH      | Initial Balance High           | First 30-min range high                |
| IBL      | Initial Balance Low            | First 30-min range low                 |
| IBMid    | Initial Balance Mid            | Midpoint of IB range                   |
| RTH VWAP | RTH Volume Weighted Average    | Regular trading hours VWAP             |
| 24 VWAP  | 24-Hour VWAP                   | Full day VWAP                          |
| RTH Mid  | RTH Midpoint                   | Midpoint of RTH range                  |
| 24 Mid   | 24-Hour Midpoint               | Midpoint of full day range             |
| Rip      | Rolling Pivot                  | Dynamic intraday directional indicator |

## Weekly MGI Glossary

| Code                | Full Name                          | Meaning                                |
| ------------------- | ---------------------------------- | -------------------------------------- |
| Weekly IB           | Weekly Initial Balance             | Sunday Globex open to Monday 9:30am CT |
| Weekly IB Ext 1x-4x | Weekly Initial Balance Extensions  | 50%, 100%, 150%, 200% of IB range      |
| Weekly VWAP         | Weekly Volume Weighted Average     | Current week's VWAP                    |
| PW High/Low/Close   | Prior Week High/Low/Close          | Previous week's extremes               |
| PW VAH/VAL/POC      | Prior Week Value Area High/Low/POC | Previous week's value area             |
| PW Open             | Prior Week Open                    | Previous week's opening price          |
| CW Open             | Current Week Open                  | This week's opening price              |
| CW VAH/VAL/Mid      | Current Week Value Area            | This week's developing value area      |

## Monthly MGI Glossary

| Code              | Full Name                  | Meaning                       |
| ----------------- | -------------------------- | ----------------------------- |
| PM-Hi/PM-Lo/PM-Cl | Prior Month High/Low/Close | Previous month extremes       |
| MTH-Op            | Monthly Open               | Current month's opening price |
| MTH-VAH/VAL/POC   | Monthly Value Area         | This month's value area       |
| PM-VAH/VAL/POC    | Prior Month Value Area     | Previous month's value area   |
| PM-Op             | Prior Month Open           | Previous month's open         |
| mVWAP             | Monthly VWAP               | Current month's VWAP          |

## Tiering & priority

The Daily MGI Priority Order and the Structural Hierarchy (Tier 1 Campaign Borders / Tier 2
Intraday Direction / Tier 3 Micro-Timing) arrive computed in the engine facts. The qualitative
takeaways:

- **Macro terrain overrides the micro skirmish** — Tier-1 HTF MGI (Weekly/Monthly levels, VRange
  extremes, major composite edges, ONH/ONL) strictly dictate Primary/Secondary planning, targets,
  and hard invalidations. Weekly Open is a very strong magnet.
- **Leg VWAP is Tier 3** and may never be a primary structural target, an entry border, or a hard
  stop (see Constraints).
