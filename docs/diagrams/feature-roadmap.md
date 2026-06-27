# Feature Roadmap

Source: `feature_list.json` (34 features) and `docs/agent-architecture-plan.md` →
*Phased Build Order* (lines 265–290). **11 done, 23 not-started.**

## Dependency graph

Edges point from a dependency to the feature it unblocks. Green = done, red = not-started,
orange = the **critical path** (`feat-033 → 014 → 015/016 → 018 → 019/020/021`) that
currently gates the entire UI pipeline.

```mermaid
graph LR
  F001["feat-001 scaffold"]
  F002["feat-002 parseProfile"]
  F003["feat-003 image PoC"]
  F004["feat-004 parseExecBars"]
  F005["feat-005 supabase schema"]
  F006["feat-006 Zod contracts"]
  F007["feat-007 AI SDK + OpenRouter"]
  F008["feat-008 /api/ingest"]
  F009["feat-009 uploader"]
  F010["feat-010 trigger.dev setup"]
  F011["feat-011 deltaTelemetry"]
  F012["feat-012 mgiPriority"]
  F013["feat-013 ripStatus"]
  F014["feat-014 lvnDetection"]
  F015["feat-015 magnetCheck"]
  F016["feat-016 terrainZones"]
  F017["feat-017 riskReward"]
  F018["feat-018 analyze-task"]
  F019["feat-019 briefing page"]
  F020["feat-020 Run Briefing button"]
  F021["feat-021 Vercel deploy"]
  F022["feat-022 knowledge restructure"]
  F023["feat-023 prompt caching"]
  F024["feat-024 entry_levels lifecycle"]
  F025["feat-025 eval-task + button"]
  F026["feat-026 web notifications"]
  F027["feat-027 Web Push"]
  F028["feat-028 config UI"]
  F029["feat-029 staleness"]
  F030["feat-030 cost/latency"]
  F031["feat-031 Opus flag"]
  F032["feat-032 doctrine drift guard"]
  F033["feat-033 LVN fixtures (Phase A)"]
  F034["feat-034 LVN /goal loop (Phase C)"]

  F001 --> F002
  F001 --> F004
  F001 --> F005
  F001 --> F006
  F001 --> F007
  F001 --> F010
  F001 --> F012
  F001 --> F013
  F001 --> F017
  F005 --> F008
  F008 --> F009
  F004 --> F011
  F002 --> F033
  F002 --> F014
  F033 --> F014
  F002 --> F015
  F014 --> F015
  F002 --> F016
  F014 --> F016
  F006 --> F018
  F007 --> F018
  F008 --> F018
  F010 --> F018
  F011 --> F018
  F012 --> F018
  F013 --> F018
  F014 --> F018
  F015 --> F018
  F016 --> F018
  F017 --> F018
  F018 --> F019
  F018 --> F020
  F019 --> F020
  F018 --> F021
  F019 --> F021
  F006 --> F022
  F022 --> F023
  F018 --> F023
  F005 --> F024
  F018 --> F024
  F006 --> F025
  F010 --> F025
  F018 --> F025
  F019 --> F025
  F024 --> F025
  F018 --> F026
  F026 --> F027
  F005 --> F028
  F019 --> F028
  F008 --> F029
  F018 --> F030
  F023 --> F030
  F018 --> F031
  F022 --> F032
  F018 --> F032
  F014 --> F034

  classDef done fill:#1f6f43,stroke:#0d3b24,color:#fff;
  classDef todo fill:#7a2f2f,stroke:#3b1414,color:#fff;
  classDef crit fill:#b5651d,stroke:#5e340d,color:#fff;
  class F001,F002,F003,F004,F005,F006,F007,F008,F009,F010,F011,F012,F013,F017,F022 done;
  class F023,F024,F025,F026,F027,F028,F029,F030,F031,F032,F034 todo;
  class F033,F014,F015,F016,F018,F019,F020,F021 crit;
```

## Phase 0–4 build order

The architecture plan groups the work into five phases. The LVN sub-effort (`feat-033` Phase
A → `feat-014` Phase B → `feat-034` Phase C) is the Phase-0 de-risk thread — it is the
system's main edge over the existing Gem and gates `analyze-task`.

```mermaid
graph TD
  subgraph P0["Phase 0 — De-risk"]
    direction LR
    p0a["feat-002 parseProfile ✓"]
    p0b["feat-003 image export PoC ✓"]
    p0c["feat-033 LVN fixtures (Phase A)"]
    p0d["feat-014 lvnDetection + eval (Phase B)"]
  end
  subgraph P1["Phase 1 — Thinnest end-to-end loop"]
    direction LR
    p1a["feat-005 schema + storage ✓"]
    p1b["feat-008 /api/ingest ✓"]
    p1c["feat-009 uploader ✓"]
    p1d["feat-018 analyze-task (no engine first)"]
    p1e["feat-019 briefing page"]
    p1f["feat-020 Run Briefing button"]
  end
  subgraph P2["Phase 2 — Deterministic engine"]
    direction LR
    p2a["feat-011/012/013 telemetry · mgi · rip ✓"]
    p2b["feat-015/016/017 magnet · terrain · R/R"]
    p2c["terrain/zone-map UI"]
  end
  subgraph P3["Phase 3 — Eval + notifications"]
    direction LR
    p3a["feat-025 eval-task + Check Entry"]
    p3b["feat-024 entry_levels lifecycle"]
    p3c["feat-026 notifications"]
    p3d["feat-028 config UI"]
  end
  subgraph P4["Phase 4 — Hardening"]
    direction LR
    p4a["feat-029 staleness"]
    p4b["feat-027 Web Push"]
    p4c["feat-030 cost/latency"]
    p4d["feat-031 Opus flag"]
  end
  P0 --> P1 --> P2 --> P3 --> P4
```

> Cross-cutting features not pinned to a single phase: `feat-007` (AI SDK), `feat-010`
> (trigger.dev setup), and `feat-022` (knowledge restructure) underpin Phases 1–2;
> `feat-023` (prompt caching) and `feat-032` (doctrine drift guard) ride alongside the
> engine work.
