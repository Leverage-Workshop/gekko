# System Architecture & Data Flow

Source: `docs/agent-architecture-plan.md` → *Stack* (lines 43–46) and *Architecture & Data
Flow* (lines 50–91).

## Components & data flow

Three tiers: the trader's Windows box (Sierra Chart), a thin local uploader, and the cloud
(Next.js on Vercel + trigger.dev + Supabase + OpenRouter). Ingest is continuous (~30s);
analysis is **on-demand only** — there is no scheduler, live price feed, or proximity
automation.

```mermaid
graph TD
  subgraph win["Sierra Chart / Windows box"]
    SC["Sierra Chart + custom ACSIL studies"]
    ACSIL["ACSIL export studies"]
    DUMP["Chart image auto-dump"]
    EXPORT["folder: C:\gekko\export"]
    SC --> ACSIL
    SC --> DUMP
    ACSIL -->|"mgi_static_levels.json · execution_bar_data.rolling.csv<br/>four-hundred-rotation.vbp.md · rolling-five-day.vbp.md<br/>half-rotation-delta.vbp.md · full-rotation-delta.vbp.md"| EXPORT
    DUMP -->|"htf_clean.png · tpo.png · execution_clean.png"| EXPORT
  end

  subgraph up["Local uploader — Node + chokidar"]
    WATCH["watch · debounce · bundle"]
  end
  EXPORT --> WATCH

  WATCH -->|"multipart POST ~30s"| ING

  subgraph cloud["Cloud — Next.js on Vercel"]
    ING["/api/ingest  (no auto-analyze)"]
    BRUN["/api/briefings/run"]
    ERUN["/api/eval/run"]
    subgraph td["trigger.dev"]
      AT["analyze-task"]
      ET["eval-task"]
      NT["notify-task"]
    end
    UI["Next.js UI<br/>terrain map · briefing · eval · 2 buttons · config"]
  end

  subgraph sb["Supabase"]
    PG[("Postgres<br/>config · raw_bundles · briefings<br/>entry_levels · eval_results")]
    ST[("Object Storage<br/>chart-images · bundle-csvs")]
    RT["Realtime channels"]
  end

  OR["OpenRouter gateway"]
  LLM["Claude Sonnet 4.6 · Haiku 4.5 · Opus 4.8"]

  ING -->|"PNGs / CSVs"| ST
  ING -->|"mgi jsonb + raw_bundles row"| PG
  UI -->|"Run Briefing"| BRUN
  UI -->|"Check Entry"| ERUN
  BRUN --> AT
  ERUN --> ET
  AT --> OR
  ET --> OR
  OR --> LLM
  AT -->|"persist briefing + entry_levels"| PG
  ET -->|"persist eval_results"| PG
  AT --> NT
  ET --> NT
  PG --> RT
  RT --> UI
```

**Why a local uploader (not direct ACSIL HTTP):** ACSIL can POST JSON but can't easily
screenshot+upload a PNG, and auth/retry in C++ is brittle. A ~100-line chokidar watcher
isolates all fragile local concerns (file-write timing, screen capture, retries, bearer
auth) in one debuggable JS process.

## End-to-end "Run Briefing" sequence

Continuous ingest keeps the latest `raw_bundles` row fresh; the user then triggers analysis
by clicking a button. Current price is read from the latest bundle (no separate price store).

```mermaid
sequenceDiagram
  participant SC as Sierra Chart
  participant UP as Uploader
  participant IN as /api/ingest
  participant DB as Supabase
  participant UI as Next.js UI
  participant API as /api/briefings/run
  participant AT as analyze-task
  participant OR as OpenRouter

  Note over SC,DB: Continuous ingest (~30s) — no auto-analyze
  SC->>UP: export bundle to C:\gekko\export
  UP->>IN: multipart POST (PNGs, CSVs, mgi JSON)
  IN->>DB: store files in Storage + insert raw_bundles row

  Note over UI,OR: On-demand only — user clicks a button
  UI->>API: Run Briefing
  API->>AT: tasks.trigger("analyze-task", {triggerReason:"manual"})
  AT->>DB: load latest raw_bundles + config
  AT->>OR: generateObject (Briefing schema, images + facts)
  OR-->>AT: structured Briefing JSON
  AT->>DB: persist briefing + refresh entry_levels
  AT->>DB: notify-task → Realtime event
  DB-->>UI: Realtime push → render briefing + terrain map
```
