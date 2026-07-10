# Deterministic Engine

Source: `docs/agent-architecture-plan.md` → *Deterministic Engine vs LLM* (lines 94–147).
Computable doctrine lives in TypeScript under `lib/engine/` (pure, no I/O), so the prompt
stays small and an error class (gap math, R/R arithmetic) is removed.

## Module data lineage

Arrows show **data lineage**, not import coupling — every module is a pure function whose
inputs the caller passes in. `✓` = built, `✗` = planned (feature id in parens).

```mermaid
graph TD
  subgraph inputs["Raw bundle inputs"]
    VBP["four-hundred-rotation.vbp.md + rolling-five-day.vbp.md"]
    DELTA["half-rotation-delta.vbp.md + full-rotation-delta.vbp.md"]
    CSV["execution_bar_data.rolling.csv"]
    MGIJSON["mgi_static_levels.json"]
    OBJ["model-proposed objective + prior briefing stop"]
  end

  PP["parseProfile.ts ✓"]
  PE["parseExecBars.ts ✓"]
  DT["deltaTelemetry.ts ✓"]
  MP["mgiPriority.ts ✓"]
  RS["ripStatus.ts ✓"]
  RR["riskReward.ts ✓"]
  LVN["lvnDetection.ts ✓ (per profile)"]
  MC["magnetCheck.ts ✓"]
  TZ["terrainZones.ts ✓"]
  ABS["absorption.ts ✓ (feat-036)"]

  VBP --> PP
  DELTA --> PP
  CSV --> PE
  PE --> DT
  MGIJSON --> MP
  PP --> LVN
  PP --> MC
  PP --> TZ
  PP --> ABS
  LVN --> MC
  LVN --> TZ
  MGIJSON --> MC
  MGIJSON -->|"price + Rip"| RS
  PE -->|"DeltaIntensity"| RS
  OBJ --> RR

  classDef done fill:#1f6f43,stroke:#0d3b24,color:#fff;
  classDef todo fill:#7a2f2f,stroke:#3b1414,color:#fff;
  class PP,PE,DT,MP,RS,RR,LVN,MC,TZ,ABS done;
```

What each module computes:

- **parseProfile.ts** — parse each VbP / Delta Markdown export standalone (`{price, volume}[]` /
  `{price, delta}[]`); no cross-profile join (the grids differ).
- **parseExecBars.ts** — parse the ~250-row exec CSV → typed `ExecBar[]`.
- **deltaTelemetry.ts** — reduce `ExecBar[]` to a compact summary (delta trend, sign, ±3/±4 extremes, Leg-VWAP position).
- **mgiPriority.ts** — MGI Tier 1/2/3 hierarchy + daily priority; nearest Tier-1 border above/below price.
- **ripStatus.ts** — Vanguard Protocol Green/Yellow/Red from price-vs-Rip + DeltaIntensity.
- **riskReward.ts** — direction-aware 3:1 R/R gate; enforces "stops never widen" vs the prior briefing.
- **lvnDetection.ts** — LVN valleys + HVN peaks, run on each VbP volume series (rotation + five-day).
- **magnetCheck.ts** — Trench/Wall/Magnet = POC/VAH/VAL + HVN peaks (rotation profile), cross-referenced to MGI.
- **terrainZones.ts** — contiguous Stratosphere→Abyss zone stack (rotation profile, volume structure) with the No-Gap invariant.
- **absorption.ts** — one-sided bin stacks on the half/full-rotation delta profiles → absorption **candidates** (model confirms price stalled).

## Deterministic engine vs LLM (the key split)

The engine computes facts; the model supplies perception and judgment it can't get from data
alone (lines 114–121).

```mermaid
flowchart LR
  subgraph engine["Engine — code-owned facts"]
    E1["gap / No-Gap zone contiguity"]
    E2["R/R arithmetic + 3:1 gate"]
    E3["LVN/HVN + Magnet detection from data"]
    E4["MGI tiering · Rip status · delta telemetry"]
  end
  subgraph model["LLM — perception + judgment"]
    M1["absorption vs exhaustion shape"]
    M2["Three-Push / Flush-&-Reload patterns"]
    M3["poor highs / single prints on TPO"]
    M4["synthesis: Asymmetric Initiative,<br/>Campaign Boundary Override, persona narrative"]
  end
```

## Hybrid LVN flow

LVN/border detection is a round trip: the engine proposes from data, the model confirms
against the chart image, the engine re-validates (lines 120–121).

```mermaid
flowchart LR
  H1["engine proposes<br/>LVN/border candidates from data"] --> H2["model confirms/adjusts<br/>against the chart image"] --> H3["engine re-validates<br/>final borders (No-Gap)"]
```
