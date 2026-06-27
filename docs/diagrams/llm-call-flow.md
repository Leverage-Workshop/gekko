# LLM Call Construction & Flow

Source: `docs/agent-architecture-plan.md` → *Deterministic Engine vs LLM* (lines 94–122),
*Knowledge Restructure* (lines 151–189), *trigger.dev Tasks* (lines 242–256).

Both tasks call the LLM the same way: a **cached system prefix** (static doctrine) followed
by a **volatile user message** (per-run data + images), through the Vercel AI SDK
`generateObject` over OpenRouter, validated against a Zod schema. Model IDs come from the
`config` row, never hardcoded.

## `analyze-task` — full briefing (default Sonnet 4.6)

```mermaid
sequenceDiagram
  participant T as analyze-task
  participant DB as Supabase
  participant ENG as Engine (lib/engine)
  participant OR as OpenRouter
  participant M as Claude Sonnet 4.6

  T->>DB: load latest raw_bundles + config
  T->>T: check bundle freshness (flag staleness)
  T->>ENG: run engine modules (deltaTelemetry, mgiPriority, ripStatus,<br/>lvnDetection, magnetCheck, terrainZones, riskReward)
  ENG-->>T: engine facts (zones, levels, telemetry, R/R)
  Note over T,M: System = cached prefix from /knowledge/** (5-min TTL)
  T->>OR: generateObject(Briefing schema)<br/>user msg: currentPrice + mgi_json + telemetry + 3 PNGs + facts
  OR->>M: forward (vision + constrained JSON)
  M-->>OR: Briefing JSON
  OR-->>T: structured object + usage (cache_read_input_tokens above 0 on repeat runs)
  T->>T: Zod validate Briefing
  T->>DB: persist briefings row (model_id, cost/latency to run metadata)
  T->>DB: set prior entry_levels.active=false, insert new set
  T->>DB: trigger notify-task
```

## `eval-task` — entry triage (default Haiku 4.5)

Lighter: only `deltaTelemetry` runs, against active entry levels, with the cheaper triage
model and the `EvalResult` schema.

```mermaid
sequenceDiagram
  participant T as eval-task
  participant DB as Supabase
  participant ENG as Engine
  participant OR as OpenRouter
  participant M as Claude Haiku 4.5 (triage)

  T->>DB: load latest raw_bundles (current_price)
  T->>DB: load active entry_levels (active=true)
  T->>ENG: deltaTelemetry only (lightweight)
  ENG-->>T: delta telemetry summary
  T->>OR: generateObject(EvalResult schema, triage model)<br/>user msg: current price + active levels + telemetry + PNGs
  OR->>M: forward
  M-->>OR: EvalResult JSON (ENTER / WAIT / NOT_VALID / NO_ENTRY_NEAR)
  OR-->>T: structured object
  T->>T: Zod validate EvalResult
  T->>DB: persist eval_results row
  T->>DB: trigger notify-task
```

## Prompt assembly: cached prefix vs volatile message

Static doctrine is assembled into the **cached prefix** (Anthropic `cache_control` /
`providerOptions` through OpenRouter — ~0.1× read cost + lower latency). Volatile per-run
data goes in the user message **after** the prefix; interpolating it into the system prompt
would invalidate the cache every run. This is the main cost/latency lever (lines 176–185).

```mermaid
graph LR
  subgraph cached["Cached system prefix · /knowledge/** · 5-min TTL · ~0.1x read"]
    P["system/persona.md"]
    C["system/constraints.md"]
    OS["system/output-schema.md"]
    PAT["doctrine/patterns.md"]
    CR["doctrine/chart-reading.md"]
    GL["doctrine/glossary.md"]
  end
  subgraph volatile["Volatile user message · changes every run"]
    CP["current price / time"]
    MGI["mgi_json"]
    TEL["delta telemetry"]
    IMG["3 chart PNGs (vision parts)"]
    FACT["engine facts: zones · levels · R/R"]
  end
  cached --> CALL["generateObject"]
  volatile --> CALL
  CALL --> RULE["Volatile data MUST follow the prefix —<br/>interpolating it into the system prompt<br/>invalidates the cache each run"]
```
