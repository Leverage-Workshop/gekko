# Analyze Task — User Prompt

> Source: LangSmith trace `019f81c1-b05a-7000-8000-00e3bb801f03` (analyze-task, 2026-07-20 22:59:42 UTC, model `x-ai/grok-4.20` via OpenRouter)
>
> The message also included 3 `image/png` chart attachments (image bytes are not stored in the trace).

# Mission
Produce one `Briefing` object for the NQ futures session, per the doctrine in the system prompt.

# Data ownership (non-negotiable)
The ENGINE FACTS below are computed deterministically from the exact numeric export data and are authoritative:
- LVN/HVN node prices, the magnet set, MGI tiering, the Rip/Vanguard condition and the terrain zone stack are code-owned. Do NOT adjust, re-derive or contradict them.
- LVN/HVN nodes and profile summaries are reported per volume profile: `rotation` (the 400-pt rotation, medium-term) and `balanceArea` (anchored to the current Balance Area, long-term). A Balance Area begins when two days of overlapping value occur and expands while subsequent days keep overlapping value, with exceptions for a peak above/below the balance. A node on the balance-area profile is structurally MORE significant than the same node on the rotation profile. The terrain zone stack is anchored to the rotation profile; the magnet set (magnetCheck and the terrain magnet verdicts) is anchored to the balance-area profile.
- `absorptionCandidates` are code-detected stacks of one-sided bins on the execution delta profiles. They are CANDIDATES ONLY — a stack by itself means nothing. Call absorption only where the execution chart shows price STALLED at the stack; otherwise ignore the candidate.
- `terrain.zones` in your output MUST reproduce the engine zone stack exactly — same contiguous top/bottom border prices (30094, 29952, 29657.72, 29532, 29480.23, 29216.75, 29078.5, 29022, 28980.5, 28909.75, 28887.5, 28711.25, 28686, 28583.75, 28539.75, 28408.25, 28235). You supply only each zone's color and narrative label.
- `terrain.levels` MUST carry the engine border verdicts (price + kind verbatim); you supply the label wording.
- Engine zone borders may be COMPOSITE: several clustered MGI levels merged into one border (`terrain.borders[].members` lists them). Treat the cluster as one border band — name the composite in your labels and pick entry/stop prices from its member levels. A composite of kind `mgi` is an MGI COMPOSITE EDGE: Tier-1/session levels partitioning a void beyond the anchoring profile's data (classified against the balance-area profile where it has coverage) — a valid border band for entries, stops and targets like any other.
- Read the attached screenshots ONLY for perception the numeric data cannot give: absorption vs exhaustion shape, TPO single prints / poor highs-lows, delta clustering quality, and the doctrine patterns.
- ACTIVE PATTERN SCAN (required): scan the execution chart for the doctrine playbook setups (Failed Breakout Trap, Controlled Flush & Reload, Three-Push Exhaustion, absorption or exhaustion at a border). At least one `overview.orderFlowContext` bullet MUST either name the active pattern and where it fired, or state plainly that no playbook pattern is present.
- Every `overview` prose section needs at least 2 substantive bullets naming concrete engine levels (the schema rejects fewer).
- `Objective.rr` is recomputed and overwritten by the engine after you answer; still populate it honestly from your chosen entry/stop/T1. The R/R gate is 3:1 — do not propose objectives that cannot clear it.
- Entries, stops and T1 must sit on engine-supplied structure — a zone border or a `terrain.levels` price — never in the middle of value. Target rungs: T1 = the first obstacle / immediate S/R (any engine level qualifies), T2 = the next acceptance border, T3 (Campaign Max) = the full traverse of the HTF distribution. T3 must land on a Trench or Wall at the NEAR edge of the void being traversed — never a Magnet, and never a level that can only be reached by crossing a second void.
- BOTH objectives (primary AND secondary) must each carry at least one entry, at least one stop on the protective side of that entry, and at least T1. The secondary is the best available counter-scenario; if it is not yet actionable, express that in its entry `trigger` conditions — never by omitting entries, stops or targets.
- TACTICAL LADDER (required): each objective carries EXACTLY ONE entry with ONE protective stop — primary: Entry A (Ideal) at the border defining ITS trade; secondary: Entry A (Fade) at the DIFFERENT border defining the counter-scenario. NEVER emit an Entry B / add-on / breakout rung or a second stop. Each objective still carries the FULL T1 -> T2 -> T3 target ladder whenever distinct engine borders exist in the trade direction (distinct rungs even for close levels). Ship fewer targets ONLY when the engine map genuinely offers no further border before the campaign extreme, and say so in the rationale.
- ENTRY PRIORITY (trend direction): Entry A (Ideal) is the reoffer/rebid at the nearest FAILED structural border in the pullback direction (Condition Red: the failed trench/wall overhead, e.g. a broken IBL; Condition Green: the reclaimed border below). A breach-and-accept THROUGH a Tier-1 campaign border is NEVER the entry. Do not chase breakdowns below a floor cluster or breakouts above a ceiling cluster.
- STOP PLACEMENT: a stop must sit BEYOND THE FAR SIDE of the entry's ENTIRE composite border band (every member level) plus a structural buffer — behind the level that proves the trade wrong, not on another member of the same band. A stop a few points from entry inside the same band is invalid: it makes the engine-recomputed R/R a fiction and gets swept by noise.
- DISTINCT ANCHORS (required): the primary and secondary objectives MUST anchor at DIFFERENT structural borders, at least 5 pts apart — validation rejects the briefing otherwise. A same-level opposite-direction straddle ("short the reoffer / long the hold" at one border) is ONE undecided scenario, not two objectives. The counter-scenario anchors at the structure defining ITS OWN trade — the floor cluster below for a fade long, the failed ceiling overhead for a counter short — with its entry trigger expressing the reclaim/failure that activates it.
- ENTRY STANDOFF (required): current price is 28743.5 and every entry must sit at least 15 pts away from it — validation rejects the briefing otherwise. If the doctrinally ideal border is already being contested (within 15 pts of price), anchor at the NEXT structural border in the entry's direction instead: the briefing is a forward-looking map, and the live decision at a contested level belongs to the eval-task, never to an entry pinned where price already trades.
- CAMPAIGN BOUNDARY CHECK (required): current price 28743.5 is 32.25 pts from the Tier-1 border VRange High 28711.25. Explicitly evaluate the Campaign Boundary Override: an extended move INTO a Tier-1 campaign border showing exhaustion, a failed-breakout trap or a controlled flush-and-reload shifts the Primary Objective to the structural reversal. State in the primary rationale whether the override applies and why.

# Meta fields
- meta.createdAt = "2026-07-20T22:59:39.716Z"
- meta.triggerReason = "manual"
- meta.currentPrice = 28743.5
- meta.ripStatus = the engine condition ("green") plus a short read.
- meta.htfTrend = your HTF trend read from the planning chart.

# Attached charts
Image 1: HTF planning chart (30-min, 90-day)
Image 2: TPO / Market Profile chart
Image 3: Execution chart (short timeframe)

# Bundle freshness
Bundle is fresh (2s old).

# Engine facts (authoritative)
```json
{
 "currentPrice": 28743.5,
 "staleness": {
  "isStale": false,
  "hasData": true,
  "ageMs": 2206,
  "ageSeconds": 2,
  "marginMs": 180000,
  "receivedAt": "2026-07-20T22:59:37.510Z",
  "evaluatedAt": "2026-07-20T22:59:39.716Z",
  "warning": null
 },
 "deltaTelemetry": {
  "barCount": 250,
  "recentWindow": 20,
  "recentMeanDelta": -2.45,
  "recentRedExtremeCount": 8,
  "recentBlueExtremeCount": 0,
  "recentTrend": "rising",
  "sign": "negative",
  "recentRange": {
   "high": 28857.75,
   "low": 28739.25,
   "lastClose": 28743.5,
   "position": 0.04,
   "priorMinClose": 28757.75,
   "priorMaxClose": 28843.75
  },
  "extremes": {
   "posStrong": 33,
   "posExtreme": 22,
   "negStrong": 37,
   "negExtreme": 28,
   "lastExtreme": -3
  },
  "legVwap": {
   "value": 28772.28,
   "close": 28743.5,
   "distance": -28.78,
   "position": "below"
  }
 },
 "ripStatus": {
  "condition": "green",
  "currentPrice": 28743.5,
  "rip": 28605.21,
  "distance": 138.29,
  "position": "above",
  "deltaIntensity": -2.45,
  "redExtremeCount": 8,
  "redInitiative": true,
  "headline": "Condition Green — Trend Intact",
  "action": "Price above the Rip. Pullbacks into the Rip are defensive lines. Expect blue defense; look for rebids to enter continuation longs. DO NOT FADE."
 },
 "profileSummary": {
  "rotation": {
   "pocPrice": 28852,
   "valueAreaHigh": 28895,
   "valueAreaLow": 28607
  },
  "balanceArea": {
   "pocPrice": 29700,
   "valueAreaHigh": 29982,
   "valueAreaLow": 29366
  }
 },
 "lvnHvnNodes": {
  "rotation": {
   "hvn": [
    {
     "price": 28846,
     "volume": 988.53,
     "prominence": 0.92
    },
    {
     "price": 28502,
     "volume": 471.29,
     "prominence": 0.4
    }
   ],
   "lvn": [
    {
     "price": 28883,
     "volume": 285.29,
     "type": "taper-edge",
     "strength": 0.31
    },
    {
     "price": 28822,
     "volume": 642.88,
     "type": "valley",
     "strength": 0.2
    },
    {
     "price": 28710,
     "volume": 49.94,
     "type": "valley",
     "strength": 0.43
    },
    {
     "price": 28589,
     "volume": 144.65,
     "type": "valley",
     "strength": 0.18
    },
    {
     "price": 28453,
     "volume": 189.65,
     "type": "valley",
     "strength": 0.12
    }
   ],
   "peakVolume": 988.53
  },
  "balanceArea": {
   "hvn": [
    {
     "price": 30044,
     "volume": 5040,
     "prominence": 0.23
    },
    {
     "price": 29864,
     "volume": 10726.88,
     "prominence": 0.89
    },
    {
     "price": 29706,
     "volume": 10374.29,
     "prominence": 0.28
    },
    {
     "price": 29404,
     "volume": 9463.65,
     "prominence": 0.43
    }
   ],
   "lvn": [
    {
     "price": 29992,
     "volume": 3205.24,
     "type": "taper-edge",
     "strength": 0.31
    },
    {
     "price": 29758,
     "volume": 7376.71,
     "type": "valley",
     "strength": 0.28
    },
    {
     "price": 29672,
     "volume": 8016.18,
     "type": "valley",
     "strength": 0.13
    },
    {
     "price": 29554,
     "volume": 4798,
     "type": "valley",
     "strength": 0.43
    },
    {
     "price": 28904,
     "volume": 304.06,
     "type": "valley",
     "strength": 0.19
    }
   ],
   "peakVolume": 10726.88
  }
 },
 "absorptionCandidates": [
  {
   "source": "full-rotation",
   "side": "sell",
   "top": 28756,
   "bottom": 28749.5,
   "binCount": 3,
   "qualifyingCount": 3,
   "peakAbsDelta": 156,
   "netDelta": -364
  }
 ],
 "magnetCheck": {
  "magnets": [
   {
    "price": 30044,
    "label": "HVN",
    "kind": "hvn",
    "volume": 5040
   },
   {
    "price": 29982,
    "label": "VAH",
    "kind": "vah",
    "volume": null
   },
   {
    "price": 29864,
    "label": "HVN",
    "kind": "hvn",
    "volume": 10726.88
   },
   {
    "price": 29706,
    "label": "HVN",
    "kind": "hvn",
    "volume": 10374.29
   },
   {
    "price": 29700,
    "label": "POC",
    "kind": "poc",
    "volume": null
   },
   {
    "price": 29404,
    "label": "HVN",
    "kind": "hvn",
    "volume": 9463.65
   },
   {
    "price": 29366,
    "label": "VAL",
    "kind": "val",
    "volume": null
   }
  ],
  "tolerance": 10,
  "verdicts": [
   {
    "level": {
     "code": "pmHigh",
     "label": "PM High",
     "price": 30975.5,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 931.5
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "mthOpen",
     "label": "Month Open",
     "price": 30505.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 461.75
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "pmVAH",
     "label": "PM VAH",
     "price": 30453,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 409
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "pwHigh",
     "label": "PW High",
     "price": 30094,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 50
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "wkOpen",
     "label": "Week Open",
     "price": 29952,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29982,
      "label": "VAH",
      "kind": "vah",
      "volume": null
     },
     "distance": 30
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "vwap",
     "label": "Monthly VWAP",
     "price": 29657.72,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29700,
      "label": "POC",
      "kind": "poc",
      "volume": null
     },
     "distance": 42.28
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "vwap",
     "label": "Weekly VWAP",
     "price": 29480.23,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29404,
      "label": "HVN",
      "kind": "hvn",
      "volume": 9463.65
     },
     "distance": 76.23
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "onh",
     "label": "ONH",
     "price": 29220,
     "group": "daily",
     "tier": 1,
     "dailyRank": 2
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 146
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "extPlus3",
     "label": "VRange +3",
     "price": 29022,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 344
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "extPlus2",
     "label": "VRange +2",
     "price": 28980.5,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 385.5
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "pwLow",
     "label": "PW Low",
     "price": 28909.75,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 456.25
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "high",
     "label": "VRange High",
     "price": 28711.25,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 654.75
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "pmVAL",
     "label": "PM VAL",
     "price": 28583.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 782.25
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "onl",
     "label": "ONL",
     "price": 28550,
     "group": "daily",
     "tier": 1,
     "dailyRank": 2
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 816
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "low",
     "label": "VRange Low",
     "price": 28504.25,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 861.75
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "extMinus2",
     "label": "VRange -2",
     "price": 28235,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1131
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "pmLow",
     "label": "PM Low",
     "price": 28227.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1138.25
    },
    "tolerance": 10
   },
   {
    "level": {
     "code": "extMinus3",
     "label": "VRange -3",
     "price": 28193.5,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "isMagnet": false,
    "nearest": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1172.5
    },
    "tolerance": 10
   }
  ],
  "magnetLevels": []
 },
 "mgiPriority": {
  "levels": [
   {
    "code": "pmHigh",
    "label": "PM High",
    "price": 30975.5,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "mthOpen",
    "label": "Month Open",
    "price": 30505.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pmVAH",
    "label": "PM VAH",
    "price": 30453,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pwHigh",
    "label": "PW High",
    "price": 30094,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "wkOpen",
    "label": "Week Open",
    "price": 29952,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "vwap",
    "label": "Monthly VWAP",
    "price": 29657.72,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pdh",
    "label": "PDH",
    "price": 29532,
    "group": "daily",
    "tier": 2,
    "dailyRank": 3
   },
   {
    "code": "vwap",
    "label": "Weekly VWAP",
    "price": 29480.23,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "onh",
    "label": "ONH",
    "price": 29220,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "pdc",
    "label": "PDC",
    "price": 29216.75,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "pdl",
    "label": "PDL",
    "price": 29078.5,
    "group": "daily",
    "tier": 2,
    "dailyRank": 3
   },
   {
    "code": "extPlus3",
    "label": "VRange +3",
    "price": 29022,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "extPlus2",
    "label": "VRange +2",
    "price": 28980.5,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pwLow",
    "label": "PW Low",
    "price": 28909.75,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "ibh",
    "label": "IBH",
    "price": 28887.5,
    "group": "daily",
    "tier": 2,
    "dailyRank": 6
   },
   {
    "code": "high",
    "label": "ATR High",
    "price": 28826.5,
    "group": "atr",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "vwap24",
    "label": "24 VWAP",
    "price": 28752.88,
    "group": "daily",
    "tier": 2,
    "dailyRank": 7
   },
   {
    "code": "high",
    "label": "VRange High",
    "price": 28711.25,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "orHigh",
    "label": "OR High",
    "price": 28686,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "orMid",
    "label": "OR Mid",
    "price": 28612.88,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "rip",
    "label": "Rip",
    "price": 28605.21,
    "group": "daily",
    "tier": 2,
    "dailyRank": 1
   },
   {
    "code": "pmVAL",
    "label": "PM VAL",
    "price": 28583.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "onl",
    "label": "ONL",
    "price": 28550,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "orLow",
    "label": "OR Low",
    "price": 28539.75,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "low",
    "label": "VRange Low",
    "price": 28504.25,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "ibl",
    "label": "IBL",
    "price": 28408.25,
    "group": "daily",
    "tier": 2,
    "dailyRank": 6
   },
   {
    "code": "low",
    "label": "ATR Low",
    "price": 28401.75,
    "group": "atr",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "extMinus2",
    "label": "VRange -2",
    "price": 28235,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pmLow",
    "label": "PM Low",
    "price": 28227.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "extMinus3",
    "label": "VRange -3",
    "price": 28193.5,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   }
  ],
  "tier1": [
   {
    "code": "pmHigh",
    "label": "PM High",
    "price": 30975.5,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "mthOpen",
    "label": "Month Open",
    "price": 30505.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pmVAH",
    "label": "PM VAH",
    "price": 30453,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pwHigh",
    "label": "PW High",
    "price": 30094,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "wkOpen",
    "label": "Week Open",
    "price": 29952,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "vwap",
    "label": "Monthly VWAP",
    "price": 29657.72,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "vwap",
    "label": "Weekly VWAP",
    "price": 29480.23,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "onh",
    "label": "ONH",
    "price": 29220,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "extPlus3",
    "label": "VRange +3",
    "price": 29022,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "extPlus2",
    "label": "VRange +2",
    "price": 28980.5,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pwLow",
    "label": "PW Low",
    "price": 28909.75,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "high",
    "label": "VRange High",
    "price": 28711.25,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pmVAL",
    "label": "PM VAL",
    "price": 28583.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "onl",
    "label": "ONL",
    "price": 28550,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "low",
    "label": "VRange Low",
    "price": 28504.25,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "extMinus2",
    "label": "VRange -2",
    "price": 28235,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "pmLow",
    "label": "PM Low",
    "price": 28227.75,
    "group": "monthly",
    "tier": 1,
    "dailyRank": null
   },
   {
    "code": "extMinus3",
    "label": "VRange -3",
    "price": 28193.5,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   }
  ],
  "dailyPrioritySort": [
   {
    "code": "rip",
    "label": "Rip",
    "price": 28605.21,
    "group": "daily",
    "tier": 2,
    "dailyRank": 1
   },
   {
    "code": "onh",
    "label": "ONH",
    "price": 29220,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "onl",
    "label": "ONL",
    "price": 28550,
    "group": "daily",
    "tier": 1,
    "dailyRank": 2
   },
   {
    "code": "pdh",
    "label": "PDH",
    "price": 29532,
    "group": "daily",
    "tier": 2,
    "dailyRank": 3
   },
   {
    "code": "pdl",
    "label": "PDL",
    "price": 29078.5,
    "group": "daily",
    "tier": 2,
    "dailyRank": 3
   },
   {
    "code": "ibh",
    "label": "IBH",
    "price": 28887.5,
    "group": "daily",
    "tier": 2,
    "dailyRank": 6
   },
   {
    "code": "ibl",
    "label": "IBL",
    "price": 28408.25,
    "group": "daily",
    "tier": 2,
    "dailyRank": 6
   },
   {
    "code": "vwap24",
    "label": "24 VWAP",
    "price": 28752.88,
    "group": "daily",
    "tier": 2,
    "dailyRank": 7
   },
   {
    "code": "pdc",
    "label": "PDC",
    "price": 29216.75,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "orHigh",
    "label": "OR High",
    "price": 28686,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "orMid",
    "label": "OR Mid",
    "price": 28612.88,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   },
   {
    "code": "orLow",
    "label": "OR Low",
    "price": 28539.75,
    "group": "daily",
    "tier": 2,
    "dailyRank": null
   }
  ],
  "nearestTier1Above": {
   "level": {
    "code": "pwLow",
    "label": "PW Low",
    "price": 28909.75,
    "group": "weekly",
    "tier": 1,
    "dailyRank": null
   },
   "distance": 166.25
  },
  "nearestTier1Below": {
   "level": {
    "code": "high",
    "label": "VRange High",
    "price": 28711.25,
    "group": "vRange",
    "tier": 1,
    "dailyRank": null
   },
   "distance": 32.25
  }
 },
 "terrain": {
  "currentPrice": 28743.5,
  "zones": [
   {
    "top": 30094,
    "bottom": 29952,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "stratosphere",
    "label": "Stratosphere (void)"
   },
   {
    "top": 29952,
    "bottom": 29657.72,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29657.72,
    "bottom": 29532,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29532,
    "bottom": 29480.23,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29480.23,
    "bottom": 29216.75,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29216.75,
    "bottom": 29078.5,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29078.5,
    "bottom": 29022,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 29022,
    "bottom": 28980.5,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 28980.5,
    "bottom": 28909.75,
    "volumeClass": "void",
    "meanVolume": 0,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 28909.75,
    "bottom": 28887.5,
    "volumeClass": "void",
    "meanVolume": 81,
    "position": "elevator-shaft",
    "label": "Elevator Shaft (void)"
   },
   {
    "top": 28887.5,
    "bottom": 28711.25,
    "volumeClass": "acceptance",
    "meanVolume": 560.03,
    "position": "killbox",
    "label": "Kill Box (acceptance)"
   },
   {
    "top": 28711.25,
    "bottom": 28686,
    "volumeClass": "void",
    "meanVolume": 75.65,
    "position": "elevator-shaft",
    "label": "Elevator Shaft (void)"
   },
   {
    "top": 28686,
    "bottom": 28583.75,
    "volumeClass": "void",
    "meanVolume": 250.89,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 28583.75,
    "bottom": 28539.75,
    "volumeClass": "void",
    "meanVolume": 247.48,
    "position": "zone",
    "label": "Zone (void)"
   },
   {
    "top": 28539.75,
    "bottom": 28408.25,
    "volumeClass": "acceptance",
    "meanVolume": 280.75,
    "position": "zone",
    "label": "Zone (acceptance)"
   },
   {
    "top": 28408.25,
    "bottom": 28235,
    "volumeClass": "void",
    "meanVolume": 7,
    "position": "abyss",
    "label": "Abyss (void)"
   }
  ],
  "levels": [
   {
    "level": {
     "code": "pmHigh",
     "label": "PM High",
     "price": 30975.5,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 931.5
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "mthOpen",
     "label": "Month Open",
     "price": 30505.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 461.75
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "pmVAH",
     "label": "PM VAH",
     "price": 30453,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 409
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "pwHigh",
     "label": "PW High",
     "price": 30094,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 30044,
      "label": "HVN",
      "kind": "hvn",
      "volume": 5040
     },
     "distance": 50
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "wkOpen",
     "label": "Week Open",
     "price": 29952,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 8866.4,
     "leftMax": 10861,
     "rightMax": 7194,
     "localPeak": 10861,
     "centerRatio": 0.82,
     "leftRatio": 1,
     "rightRatio": 0.66
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29982,
      "label": "VAH",
      "kind": "vah",
      "volume": null
     },
     "distance": 30
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "vwap",
     "label": "Monthly VWAP",
     "price": 29657.72,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 8504.4,
     "leftMax": 10749,
     "rightMax": 11020,
     "localPeak": 11020,
     "centerRatio": 0.77,
     "leftRatio": 0.98,
     "rightRatio": 1
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29700,
      "label": "POC",
      "kind": "poc",
      "volume": null
     },
     "distance": 42.28
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "pdh",
     "label": "PDH",
     "price": 29532,
     "group": "daily",
     "tier": 2,
     "dailyRank": 3
    },
    "local": {
     "centerVol": 5866.4,
     "leftMax": 8066,
     "rightMax": 5939,
     "localPeak": 8066,
     "centerRatio": 0.73,
     "leftRatio": 1,
     "rightRatio": 0.74
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29404,
      "label": "HVN",
      "kind": "hvn",
      "volume": 9463.65
     },
     "distance": 128
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "vwap",
     "label": "Weekly VWAP",
     "price": 29480.23,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 9563.2,
     "leftMax": 9536,
     "rightMax": 8628,
     "localPeak": 9563.2,
     "centerRatio": 1,
     "leftRatio": 1,
     "rightRatio": 0.9
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29404,
      "label": "HVN",
      "kind": "hvn",
      "volume": 9463.65
     },
     "distance": 76.23
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "onh",
     "label": "ONH",
     "price": 29220,
     "group": "daily",
     "tier": 1,
     "dailyRank": 2
    },
    "local": {
     "centerVol": 4164,
     "leftMax": 4971,
     "rightMax": 4448,
     "localPeak": 4971,
     "centerRatio": 0.84,
     "leftRatio": 1,
     "rightRatio": 0.89
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 146
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "pdc",
     "label": "PDC",
     "price": 29216.75,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 3953.2,
     "leftMax": 4971,
     "rightMax": 4493,
     "localPeak": 4971,
     "centerRatio": 0.8,
     "leftRatio": 1,
     "rightRatio": 0.9
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 149.25
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "pdl",
     "label": "PDL",
     "price": 29078.5,
     "group": "daily",
     "tier": 2,
     "dailyRank": 3
    },
    "local": {
     "centerVol": 1639.6,
     "leftMax": 2025,
     "rightMax": 2482,
     "localPeak": 2482,
     "centerRatio": 0.66,
     "leftRatio": 0.82,
     "rightRatio": 1
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 287.5
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "extPlus3",
     "label": "VRange +3",
     "price": 29022,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 1148.6,
     "leftMax": 1737,
     "rightMax": 1982,
     "localPeak": 1982,
     "centerRatio": 0.58,
     "leftRatio": 0.88,
     "rightRatio": 1
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 344
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "structure-shaped but too thin to promote (block 1737 < floor 2216.45)"
   },
   {
    "level": {
     "code": "extPlus2",
     "label": "VRange +2",
     "price": 28980.5,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 1144.2,
     "leftMax": 1224,
     "rightMax": 1737,
     "localPeak": 1737,
     "centerRatio": 0.66,
     "leftRatio": 0.7,
     "rightRatio": 1
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 385.5
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "pwLow",
     "label": "PW Low",
     "price": 28909.75,
     "group": "weekly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 349.6,
     "leftMax": 1269,
     "rightMax": 1195,
     "localPeak": 1269,
     "centerRatio": 0.28,
     "leftRatio": 1,
     "rightRatio": 0.94
    },
    "source": "balance-area",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 456.25
    },
    "detectorNode": {
     "kind": "valley",
     "price": 28904,
     "distance": 5.75
    },
    "kind": "mgi",
    "hard": false,
    "reason": "structure-shaped but too thin to promote (block 1195 < floor 2216.45)"
   },
   {
    "level": {
     "code": "ibh",
     "label": "IBH",
     "price": 28887.5,
     "group": "daily",
     "tier": 2,
     "dailyRank": 6
    },
    "local": {
     "centerVol": 210.3,
     "leftMax": 1321,
     "rightMax": 58,
     "localPeak": 1321,
     "centerRatio": 0.16,
     "leftRatio": 1,
     "rightRatio": 0.04
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 478.5
    },
    "detectorNode": {
     "kind": "taper-edge",
     "price": 28883,
     "distance": 4.5
    },
    "kind": "wall",
    "hard": true,
    "reason": "block below (L 1) drops into void above (R 0.04)"
   },
   {
    "level": {
     "code": "vwap24",
     "label": "24 VWAP",
     "price": 28752.88,
     "group": "daily",
     "tier": 2,
     "dailyRank": 7
    },
    "local": {
     "centerVol": 447.8,
     "leftMax": 403,
     "rightMax": 806,
     "localPeak": 806,
     "centerRatio": 0.56,
     "leftRatio": 0.5,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 613.12
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "high",
     "label": "VRange High",
     "price": 28711.25,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 42.8,
     "leftMax": 303,
     "rightMax": 433,
     "localPeak": 433,
     "centerRatio": 0.1,
     "leftRatio": 0.7,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 654.75
    },
    "detectorNode": {
     "kind": "valley",
     "price": 28710,
     "distance": 1.25
    },
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.1 of local peak) between blocks (L 0.7, R 1)"
   },
   {
    "level": {
     "code": "orHigh",
     "label": "OR High",
     "price": 28686,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 98.27,
     "leftMax": 441,
     "rightMax": 221,
     "localPeak": 441,
     "centerRatio": 0.22,
     "leftRatio": 1,
     "rightRatio": 0.5
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 680
    },
    "detectorNode": null,
    "kind": "wall",
    "hard": true,
    "reason": "block below (L 1) drops into void above (R 0.5)"
   },
   {
    "level": {
     "code": "orMid",
     "label": "OR Mid",
     "price": 28612.88,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 284.6,
     "leftMax": 392,
     "rightMax": 441,
     "localPeak": 441,
     "centerRatio": 0.65,
     "leftRatio": 0.89,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 753.12
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "rip",
     "label": "Rip",
     "price": 28605.21,
     "group": "daily",
     "tier": 2,
     "dailyRank": 1
    },
    "local": {
     "centerVol": 276.5,
     "leftMax": 439,
     "rightMax": 441,
     "localPeak": 441,
     "centerRatio": 0.63,
     "leftRatio": 1,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 760.79
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "pmVAL",
     "label": "PM VAL",
     "price": 28583.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 139.6,
     "leftMax": 501,
     "rightMax": 392,
     "localPeak": 501,
     "centerRatio": 0.28,
     "leftRatio": 1,
     "rightRatio": 0.78
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 782.25
    },
    "detectorNode": {
     "kind": "valley",
     "price": 28589,
     "distance": 5.25
    },
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.28 of local peak) between blocks (L 1, R 0.78)"
   },
   {
    "level": {
     "code": "onl",
     "label": "ONL",
     "price": 28550,
     "group": "daily",
     "tier": 1,
     "dailyRank": 2
    },
    "local": {
     "centerVol": 275.45,
     "leftMax": 506,
     "rightMax": 501,
     "localPeak": 506,
     "centerRatio": 0.54,
     "leftRatio": 1,
     "rightRatio": 0.99
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 816
    },
    "detectorNode": null,
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.54 of local peak) between blocks (L 1, R 0.99)"
   },
   {
    "level": {
     "code": "orLow",
     "label": "OR Low",
     "price": 28539.75,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 173,
     "leftMax": 870,
     "rightMax": 501,
     "localPeak": 870,
     "centerRatio": 0.2,
     "leftRatio": 1,
     "rightRatio": 0.58
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 826.25
    },
    "detectorNode": null,
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.2 of local peak) between blocks (L 1, R 0.58)"
   },
   {
    "level": {
     "code": "low",
     "label": "VRange Low",
     "price": 28504.25,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 472.6,
     "leftMax": 504,
     "rightMax": 506,
     "localPeak": 506,
     "centerRatio": 0.93,
     "leftRatio": 1,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 861.75
    },
    "detectorNode": {
     "kind": "hvn",
     "price": 28502,
     "distance": 2.25
    },
    "kind": "mgi",
    "hard": false,
    "reason": "no local block/void structure to promote"
   },
   {
    "level": {
     "code": "ibl",
     "label": "IBL",
     "price": 28408.25,
     "group": "daily",
     "tier": 2,
     "dailyRank": 6
    },
    "local": {
     "centerVol": 64.83,
     "leftMax": 0,
     "rightMax": 397,
     "localPeak": 397,
     "centerRatio": 0.16,
     "leftRatio": 0,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 957.75
    },
    "detectorNode": null,
    "kind": "wall",
    "hard": true,
    "reason": "block above (R 1) drops into void below (L 0)"
   },
   {
    "level": {
     "code": "extMinus2",
     "label": "VRange -2",
     "price": 28235,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1131
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "pmLow",
     "label": "PM Low",
     "price": 28227.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1138.25
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   },
   {
    "level": {
     "code": "extMinus3",
     "label": "VRange -3",
     "price": 28193.5,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": null,
    "source": null,
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 1172.5
    },
    "detectorNode": null,
    "kind": "mgi",
    "hard": false,
    "reason": "anchor outside the volume profile range"
   }
  ],
  "partitions": [
   {
    "level": {
     "code": "ibh",
     "label": "IBH",
     "price": 28887.5,
     "group": "daily",
     "tier": 2,
     "dailyRank": 6
    },
    "local": {
     "centerVol": 210.3,
     "leftMax": 1321,
     "rightMax": 58,
     "localPeak": 1321,
     "centerRatio": 0.16,
     "leftRatio": 1,
     "rightRatio": 0.04
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 478.5
    },
    "detectorNode": {
     "kind": "taper-edge",
     "price": 28883,
     "distance": 4.5
    },
    "kind": "wall",
    "hard": true,
    "reason": "block below (L 1) drops into void above (R 0.04)"
   },
   {
    "level": {
     "code": "high",
     "label": "VRange High",
     "price": 28711.25,
     "group": "vRange",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 42.8,
     "leftMax": 303,
     "rightMax": 433,
     "localPeak": 433,
     "centerRatio": 0.1,
     "leftRatio": 0.7,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 654.75
    },
    "detectorNode": {
     "kind": "valley",
     "price": 28710,
     "distance": 1.25
    },
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.1 of local peak) between blocks (L 0.7, R 1)"
   },
   {
    "level": {
     "code": "orHigh",
     "label": "OR High",
     "price": 28686,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 98.27,
     "leftMax": 441,
     "rightMax": 221,
     "localPeak": 441,
     "centerRatio": 0.22,
     "leftRatio": 1,
     "rightRatio": 0.5
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 680
    },
    "detectorNode": null,
    "kind": "wall",
    "hard": true,
    "reason": "block below (L 1) drops into void above (R 0.5)"
   },
   {
    "level": {
     "code": "pmVAL",
     "label": "PM VAL",
     "price": 28583.75,
     "group": "monthly",
     "tier": 1,
     "dailyRank": null
    },
    "local": {
     "centerVol": 139.6,
     "leftMax": 501,
     "rightMax": 392,
     "localPeak": 501,
     "centerRatio": 0.28,
     "leftRatio": 1,
     "rightRatio": 0.78
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 782.25
    },
    "detectorNode": {
     "kind": "valley",
     "price": 28589,
     "distance": 5.25
    },
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.28 of local peak) between blocks (L 1, R 0.78)"
   },
   {
    "level": {
     "code": "onl",
     "label": "ONL",
     "price": 28550,
     "group": "daily",
     "tier": 1,
     "dailyRank": 2
    },
    "local": {
     "centerVol": 275.45,
     "leftMax": 506,
     "rightMax": 501,
     "localPeak": 506,
     "centerRatio": 0.54,
     "leftRatio": 1,
     "rightRatio": 0.99
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 816
    },
    "detectorNode": null,
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.54 of local peak) between blocks (L 1, R 0.99)"
   },
   {
    "level": {
     "code": "orLow",
     "label": "OR Low",
     "price": 28539.75,
     "group": "daily",
     "tier": 2,
     "dailyRank": null
    },
    "local": {
     "centerVol": 173,
     "leftMax": 870,
     "rightMax": 501,
     "localPeak": 870,
     "centerRatio": 0.2,
     "leftRatio": 1,
     "rightRatio": 0.58
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 826.25
    },
    "detectorNode": null,
    "kind": "trench",
    "hard": true,
    "reason": "valley (center 0.2 of local peak) between blocks (L 1, R 0.58)"
   },
   {
    "level": {
     "code": "ibl",
     "label": "IBL",
     "price": 28408.25,
     "group": "daily",
     "tier": 2,
     "dailyRank": 6
    },
    "local": {
     "centerVol": 64.83,
     "leftMax": 0,
     "rightMax": 397,
     "localPeak": 397,
     "centerRatio": 0.16,
     "leftRatio": 0,
     "rightRatio": 1
    },
    "source": "rotation",
    "magnet": {
     "magnet": {
      "price": 29366,
      "label": "VAL",
      "kind": "val",
      "volume": null
     },
     "distance": 957.75
    },
    "detectorNode": null,
    "kind": "wall",
    "hard": true,
    "reason": "block above (R 1) drops into void below (L 0)"
   }
  ],
  "borders": [
   {
    "price": 29952,
    "kind": "mgi",
    "label": "Week Open",
    "members": [
     {
      "level": {
       "code": "wkOpen",
       "label": "Week Open",
       "price": 29952,
       "group": "weekly",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 8866.4,
       "leftMax": 10861,
       "rightMax": 7194,
       "localPeak": 10861,
       "centerRatio": 0.82,
       "leftRatio": 1,
       "rightRatio": 0.66
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29982,
        "label": "VAH",
        "kind": "vah",
        "volume": null
       },
       "distance": 30
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29657.72,
    "kind": "mgi",
    "label": "Monthly VWAP",
    "members": [
     {
      "level": {
       "code": "vwap",
       "label": "Monthly VWAP",
       "price": 29657.72,
       "group": "monthly",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 8504.4,
       "leftMax": 10749,
       "rightMax": 11020,
       "localPeak": 11020,
       "centerRatio": 0.77,
       "leftRatio": 0.98,
       "rightRatio": 1
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29700,
        "label": "POC",
        "kind": "poc",
        "volume": null
       },
       "distance": 42.28
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29532,
    "kind": "mgi",
    "label": "PDH",
    "members": [
     {
      "level": {
       "code": "pdh",
       "label": "PDH",
       "price": 29532,
       "group": "daily",
       "tier": 2,
       "dailyRank": 3
      },
      "local": {
       "centerVol": 5866.4,
       "leftMax": 8066,
       "rightMax": 5939,
       "localPeak": 8066,
       "centerRatio": 0.73,
       "leftRatio": 1,
       "rightRatio": 0.74
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29404,
        "label": "HVN",
        "kind": "hvn",
        "volume": 9463.65
       },
       "distance": 128
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29480.23,
    "kind": "mgi",
    "label": "Weekly VWAP",
    "members": [
     {
      "level": {
       "code": "vwap",
       "label": "Weekly VWAP",
       "price": 29480.23,
       "group": "weekly",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 9563.2,
       "leftMax": 9536,
       "rightMax": 8628,
       "localPeak": 9563.2,
       "centerRatio": 1,
       "leftRatio": 1,
       "rightRatio": 0.9
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29404,
        "label": "HVN",
        "kind": "hvn",
        "volume": 9463.65
       },
       "distance": 76.23
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29216.75,
    "kind": "mgi",
    "label": "ONH / PDC",
    "members": [
     {
      "level": {
       "code": "onh",
       "label": "ONH",
       "price": 29220,
       "group": "daily",
       "tier": 1,
       "dailyRank": 2
      },
      "local": {
       "centerVol": 4164,
       "leftMax": 4971,
       "rightMax": 4448,
       "localPeak": 4971,
       "centerRatio": 0.84,
       "leftRatio": 1,
       "rightRatio": 0.89
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 146
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     },
     {
      "level": {
       "code": "pdc",
       "label": "PDC",
       "price": 29216.75,
       "group": "daily",
       "tier": 2,
       "dailyRank": null
      },
      "local": {
       "centerVol": 3953.2,
       "leftMax": 4971,
       "rightMax": 4493,
       "localPeak": 4971,
       "centerRatio": 0.8,
       "leftRatio": 1,
       "rightRatio": 0.9
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 149.25
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29078.5,
    "kind": "mgi",
    "label": "PDL",
    "members": [
     {
      "level": {
       "code": "pdl",
       "label": "PDL",
       "price": 29078.5,
       "group": "daily",
       "tier": 2,
       "dailyRank": 3
      },
      "local": {
       "centerVol": 1639.6,
       "leftMax": 2025,
       "rightMax": 2482,
       "localPeak": 2482,
       "centerRatio": 0.66,
       "leftRatio": 0.82,
       "rightRatio": 1
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 287.5
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 29022,
    "kind": "mgi",
    "label": "VRange +3",
    "members": [
     {
      "level": {
       "code": "extPlus3",
       "label": "VRange +3",
       "price": 29022,
       "group": "vRange",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 1148.6,
       "leftMax": 1737,
       "rightMax": 1982,
       "localPeak": 1982,
       "centerRatio": 0.58,
       "leftRatio": 0.88,
       "rightRatio": 1
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 344
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "structure-shaped but too thin to promote (block 1737 < floor 2216.45)"
     }
    ]
   },
   {
    "price": 28980.5,
    "kind": "mgi",
    "label": "VRange +2",
    "members": [
     {
      "level": {
       "code": "extPlus2",
       "label": "VRange +2",
       "price": 28980.5,
       "group": "vRange",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 1144.2,
       "leftMax": 1224,
       "rightMax": 1737,
       "localPeak": 1737,
       "centerRatio": 0.66,
       "leftRatio": 0.7,
       "rightRatio": 1
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 385.5
      },
      "detectorNode": null,
      "kind": "mgi",
      "hard": false,
      "reason": "no local block/void structure to promote"
     }
    ]
   },
   {
    "price": 28909.75,
    "kind": "mgi",
    "label": "PW Low",
    "members": [
     {
      "level": {
       "code": "pwLow",
       "label": "PW Low",
       "price": 28909.75,
       "group": "weekly",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 349.6,
       "leftMax": 1269,
       "rightMax": 1195,
       "localPeak": 1269,
       "centerRatio": 0.28,
       "leftRatio": 1,
       "rightRatio": 0.94
      },
      "source": "balance-area",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 456.25
      },
      "detectorNode": {
       "kind": "valley",
       "price": 28904,
       "distance": 5.75
      },
      "kind": "mgi",
      "hard": false,
      "reason": "structure-shaped but too thin to promote (block 1195 < floor 2216.45)"
     }
    ]
   },
   {
    "price": 28887.5,
    "kind": "wall",
    "label": "IBH",
    "members": [
     {
      "level": {
       "code": "ibh",
       "label": "IBH",
       "price": 28887.5,
       "group": "daily",
       "tier": 2,
       "dailyRank": 6
      },
      "local": {
       "centerVol": 210.3,
       "leftMax": 1321,
       "rightMax": 58,
       "localPeak": 1321,
       "centerRatio": 0.16,
       "leftRatio": 1,
       "rightRatio": 0.04
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 478.5
      },
      "detectorNode": {
       "kind": "taper-edge",
       "price": 28883,
       "distance": 4.5
      },
      "kind": "wall",
      "hard": true,
      "reason": "block below (L 1) drops into void above (R 0.04)"
     }
    ]
   },
   {
    "price": 28711.25,
    "kind": "trench",
    "label": "VRange High",
    "members": [
     {
      "level": {
       "code": "high",
       "label": "VRange High",
       "price": 28711.25,
       "group": "vRange",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 42.8,
       "leftMax": 303,
       "rightMax": 433,
       "localPeak": 433,
       "centerRatio": 0.1,
       "leftRatio": 0.7,
       "rightRatio": 1
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 654.75
      },
      "detectorNode": {
       "kind": "valley",
       "price": 28710,
       "distance": 1.25
      },
      "kind": "trench",
      "hard": true,
      "reason": "valley (center 0.1 of local peak) between blocks (L 0.7, R 1)"
     }
    ]
   },
   {
    "price": 28686,
    "kind": "wall",
    "label": "OR High",
    "members": [
     {
      "level": {
       "code": "orHigh",
       "label": "OR High",
       "price": 28686,
       "group": "daily",
       "tier": 2,
       "dailyRank": null
      },
      "local": {
       "centerVol": 98.27,
       "leftMax": 441,
       "rightMax": 221,
       "localPeak": 441,
       "centerRatio": 0.22,
       "leftRatio": 1,
       "rightRatio": 0.5
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 680
      },
      "detectorNode": null,
      "kind": "wall",
      "hard": true,
      "reason": "block below (L 1) drops into void above (R 0.5)"
     }
    ]
   },
   {
    "price": 28583.75,
    "kind": "trench",
    "label": "PM VAL",
    "members": [
     {
      "level": {
       "code": "pmVAL",
       "label": "PM VAL",
       "price": 28583.75,
       "group": "monthly",
       "tier": 1,
       "dailyRank": null
      },
      "local": {
       "centerVol": 139.6,
       "leftMax": 501,
       "rightMax": 392,
       "localPeak": 501,
       "centerRatio": 0.28,
       "leftRatio": 1,
       "rightRatio": 0.78
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 782.25
      },
      "detectorNode": {
       "kind": "valley",
       "price": 28589,
       "distance": 5.25
      },
      "kind": "trench",
      "hard": true,
      "reason": "valley (center 0.28 of local peak) between blocks (L 1, R 0.78)"
     }
    ]
   },
   {
    "price": 28539.75,
    "kind": "trench",
    "label": "ONL / OR Low",
    "members": [
     {
      "level": {
       "code": "onl",
       "label": "ONL",
       "price": 28550,
       "group": "daily",
       "tier": 1,
       "dailyRank": 2
      },
      "local": {
       "centerVol": 275.45,
       "leftMax": 506,
       "rightMax": 501,
       "localPeak": 506,
       "centerRatio": 0.54,
       "leftRatio": 1,
       "rightRatio": 0.99
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 816
      },
      "detectorNode": null,
      "kind": "trench",
      "hard": true,
      "reason": "valley (center 0.54 of local peak) between blocks (L 1, R 0.99)"
     },
     {
      "level": {
       "code": "orLow",
       "label": "OR Low",
       "price": 28539.75,
       "group": "daily",
       "tier": 2,
       "dailyRank": null
      },
      "local": {
       "centerVol": 173,
       "leftMax": 870,
       "rightMax": 501,
       "localPeak": 870,
       "centerRatio": 0.2,
       "leftRatio": 1,
       "rightRatio": 0.58
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 826.25
      },
      "detectorNode": null,
      "kind": "trench",
      "hard": true,
      "reason": "valley (center 0.2 of local peak) between blocks (L 1, R 0.58)"
     }
    ]
   },
   {
    "price": 28408.25,
    "kind": "wall",
    "label": "IBL",
    "members": [
     {
      "level": {
       "code": "ibl",
       "label": "IBL",
       "price": 28408.25,
       "group": "daily",
       "tier": 2,
       "dailyRank": 6
      },
      "local": {
       "centerVol": 64.83,
       "leftMax": 0,
       "rightMax": 397,
       "localPeak": 397,
       "centerRatio": 0.16,
       "leftRatio": 0,
       "rightRatio": 1
      },
      "source": "rotation",
      "magnet": {
       "magnet": {
        "price": 29366,
        "label": "VAL",
        "kind": "val",
        "volume": null
       },
       "distance": 957.75
      },
      "detectorNode": null,
      "kind": "wall",
      "hard": true,
      "reason": "block above (R 1) drops into void below (L 0)"
     }
    ]
   }
  ],
  "magnets": [
   {
    "price": 30044,
    "label": "HVN",
    "kind": "hvn",
    "volume": 5040
   },
   {
    "price": 29982,
    "label": "VAH",
    "kind": "vah",
    "volume": null
   },
   {
    "price": 29864,
    "label": "HVN",
    "kind": "hvn",
    "volume": 10726.88
   },
   {
    "price": 29706,
    "label": "HVN",
    "kind": "hvn",
    "volume": 10374.29
   },
   {
    "price": 29700,
    "label": "POC",
    "kind": "poc",
    "volume": null
   },
   {
    "price": 29404,
    "label": "HVN",
    "kind": "hvn",
    "volume": 9463.65
   },
   {
    "price": 29366,
    "label": "VAL",
    "kind": "val",
    "volume": null
   }
  ],
  "dataEdges": [],
  "contiguityValid": true,
  "issues": []
 },
 "warnings": []
}
```

# Raw MGI static levels
```json
{
 "atr": {
  "low": 28401.75,
  "high": 28826.5
 },
 "daily": {
  "ibh": 28887.5,
  "ibl": 28408.25,
  "onh": 29220,
  "onl": 28550,
  "pdc": 29216.75,
  "pdh": 29532,
  "pdl": 29078.5,
  "rip": 28605.21,
  "orLow": 28539.75,
  "orMid": 28612.88,
  "orHigh": 28686,
  "vwap24": 28752.88
 },
 "vRange": {
  "low": 28504.25,
  "high": 28711.25,
  "extPlus2": 28980.5,
  "extPlus3": 29022,
  "extMinus2": 28235,
  "extMinus3": 28193.5
 },
 "weekly": {
  "vwap": 29480.23,
  "pwLow": 28909.75,
  "pwHigh": 30094,
  "wkOpen": 29952
 },
 "current": {
  "time": "09:57:59",
  "price": 28743.5
 },
 "monthly": {
  "vwap": 29657.72,
  "pmLow": 28227.75,
  "pmVAH": 30453,
  "pmVAL": 28583.75,
  "pmHigh": 30975.5,
  "mthOpen": 30505.75
 }
}
```
