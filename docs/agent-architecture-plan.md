# Plan: Turn the "Gekko" NQ-Futures Gem into an Autonomous Agent

## Context

Today, "Gekko" is a Google Gem (Gemini Pro 3.1) that analyzes NQ futures. The trader
manually uploads, every time he wants an update: 3 chart screenshots (HTF 30-min, TPO,
execution/footprint), `mgi_static_levels.json`, and `execution_bar_data.rolling.csv`,
and the Gem returns a "Morning Briefing" as markdown. All inputs are produced by the
user's custom **Sierra Chart ACSIL studies** on his Windows machine; he also has studies
that export volume profiles and volume-delta profiles **as data**.

Four problems motivate the rebuild:
1. Manual loop — he must import files and send a message for every update.
2. Markdown-only output in the Gemini web app — no real visualization.
3. Gemini Pro 3.1 is slow.
4. `instructions.md` and `tactical-companion-playbook.md` are redundant and incoherent
   (an artifact of how Gems force everything into one prompt + a "silent retrieval" hack).

**Intended outcome:** an advisory-only agent that (a) auto-runs analysis on a schedule
**and** when live price nears a previously-identified entry level, (b) renders briefings
as a rich web UI (real terrain/zone map, not markdown), (c) is materially faster, and
(d) has a clean, deduped knowledge base with computable doctrine moved into code.

### Decisions locked with the user
- **Scope:** Advisory only — never connects to a broker or places orders.
- **Inputs:** Hybrid — keep screenshots (LVN/spatial detection is hard to code) **and**
  use the structured data exports (volume profile, delta profile, MGI, exec CSV).
- **Notifications:** Simple web notifications (he's at his desk).
- **Models (latency goal):** Default **`anthropic/claude-sonnet-4-6`** (vision + strong
  reasoning, faster than Gemini Pro 3.1) for full briefings; **`anthropic/claude-haiku-4-5`**
  for the cheap, frequent proximity/"is this entry still valid" triage;
  **`anthropic/claude-opus-4-8`** behind a config flag for max-fidelity reviews.
- **LLM access:** via the **Vercel AI SDK** with **OpenRouter** as the provider gateway
  (model IDs are OpenRouter-namespaced as above). Lets us swap models from `config.model_id`
  with no code change. `generateObject` + the Zod `Briefing` schema gives constrained JSON
  output; image message parts cover the screenshots.
- **Deliverable of this planning round:** save this finalized plan as a markdown file in the
  repo (e.g. `docs/agent-architecture-plan.md`). **No app code is built yet.**

### Stack
Next.js (Vercel) + trigger.dev (scheduling/workflows) + Supabase (Postgres + object
storage + Realtime) + Vercel AI SDK → OpenRouter (LLM). One small **local uploader** (Node)
on the Windows box bridges Sierra Chart to the cloud.

---

## Architecture & Data Flow

```
[Sierra Chart / Windows]
  ├─ ACSIL export studies ──▶ C:\gekko\export\  (mgi.json, exec.csv,
  │                                               vbp_export.md, delta_vbp_export.md)
  ├─ Chart image auto-dump ──▶ C:\gekko\export\  (htf.png, tpo.png, exec.png)
  └─ ACSIL price heartbeat ──HTTP POST /api/price──┐ (price+ts only, every 1–2s)
                                                   │
[Local uploader (Node + chokidar)]                │
  └─ watches export folder, debounces, bundles ───┼─ POST /api/ingest (multipart, ~10 min)
                                                   │
====================== CLOUD (Next.js + trigger.dev + Supabase) ======================
  /api/price  → write latest_price → proximity check (vs active entry_levels)
  /api/ingest → store raw bundle (files→storage, mgi→jsonb) → enqueue analyze-task
  trigger.dev:
    ├─ scheduled-briefing (cron, default */10) → analyze-task
    ├─ proximity (fires from /api/price on |price-level| ≤ threshold, debounced) → analyze-task
    ├─ analyze-task (only task that calls the LLM):
    │     1) deterministic engine (TS)  2) Claude (vision+structured JSON)
    │     3) validate (Zod)  4) persist briefing + refresh entry_levels  5) notify
    └─ notify-task (web push / realtime)
  Supabase: config, raw_bundles, briefings, entry_levels, latest_price
  Next.js UI: terrain/zone map (SVG/canvas), briefing render, config
```

**Why a local uploader (not direct ACSIL HTTP):** ACSIL *can* POST JSON
(`sc.MakeHTTPPOSTRequest`), but it can't easily screenshot+upload a PNG, and embedding
auth/retry in C++ is brittle. A ~100-line `chokidar` watcher isolates all fragile local
concerns (file-write timing, screen capture, retries, bearer auth) in one debuggable JS
process. ACSIL is used only for the trivial fire-and-forget **price heartbeat**, where its
awkward HTTP is fine (a dropped beat is harmless).

**Live price:** use the user's own already-licensed Sierra Chart feed via the heartbeat —
no third-party feed (avoids cost and data-redistribution licensing). `/api/price` never
calls the LLM; it updates `latest_price` and does the cheap proximity comparison inline.

---

## Deterministic Engine vs LLM (the key split)

Move computable doctrine OUT of the prompt into TypeScript (`/lib/engine/`). This lowers
latency (smaller prompt) and removes an error class (gap math, R/R arithmetic the LLM gets
wrong). Reference: the math lives today in `gem-files/tactical-companion-playbook.md`.

**TypeScript modules (engine computes facts, hands them to the model):**
- `terrainZones.ts` — contiguous Stratosphere→Abyss zone stack with the "No-Gap" invariant
  (`Price[N] === Price2[N+1]`); LLM supplies border prices, code assembles+validates.
- `riskReward.ts` — direction-aware 3:1 R/R gate; "stops never widen" enforced vs prior briefing.
- `magnetCheck.ts` / `lvnDetection.ts` — Trench/Wall/Magnet + LVN detection from the parsed,
  joined **volume/delta profile arrays** (peak/valley + gradient detection; see *Profile Export
  Format* below), cross-referenced to MGI levels. Feasible from the *data* (it was "tricky" only
  from the *image*).
- `mgiPriority.ts` — Tier 1/2/3 hierarchy + daily priority sort; compute nearest Tier-1
  border above/below price.
- `ripStatus.ts` — Vanguard Protocol Green/Yellow/Red from price-vs-Rip + DeltaIntensity.
- `deltaTelemetry.ts` — reduce the ~250-row exec CSV to a compact summary (recent delta
  trend, sign, ±3/±4 extremes, Leg-VWAP-relative position).

**Leave to the LLM (Claude Sonnet 4.6):** reading the screenshots for what data can't
capture — absorption-vs-exhaustion *shape*, Three-Push Exhaustion / Flush-&-Reload
*patterns*, poor highs/single prints on the TPO, confirming delta clustering aligns with
the engine's borders — plus synthesis/judgment (Law of Asymmetric Initiative, Campaign
Boundary Override, macro-vs-micro conflict resolution) and the persona narrative.

**Hybrid LVN flow:** engine proposes LVN/border candidates from data → model
confirms/adjusts against the chart image → engine re-validates final borders.

### Profile Export Format (LOCKED — from samples `chart-data/vbp_export.md`, `chart-data/delta_vbp_export.md`)

Both exports are Markdown with an **identical structure**:
- `## Metadata` bullets: Profile Name, Profile Description, **Tick Size** (0.25), **Bin Size (Ticks)** (5).
- `## Summary` bullets: **POC Price**, **Value Area High**, **Value Area Low** — read directly; do **not** recompute VA.
- `## Volume Profile Data` → a fenced ` ```csv ` block, two columns, **prices descending**,
  row step = `tickSize × binSize` (0.25 × 5 = 1.25):
  - **VbP** header `Price,Volume` — non-negative total volume per bin.
  - **Delta** header `Price,Delta` — **signed** (buy − sell) per bin; negative = sell-dominant.

Parser rules (`/lib/engine/parseProfile.ts`):
- Read `tickSize`/`binSize` from Metadata each run (don't hardcode the 1.25 step); derive the
  expected step and validate row spacing.
- Distinguish the two files by the CSV header's **2nd column** (`Volume` vs `Delta`), not just filename.
- Parse into `{price, value}[]`, then **join VbP+Delta on the `Price` key** → `{price, volume, delta}`
  (left-join on the volume series). Don't assume equal ranges/row-alignment — the two profiles
  can differ in width and POC; tolerate gaps.
- **Ingest invariant:** the uploader must export both profiles from the *same* session profile at
  the *same* instant so prices align. (The two sample files were captured at different times —
  POC 30236.25 vs 30293.75 — which is exactly the misalignment to prevent.)

Engine consumption: `lvnDetection.ts` runs on the **VbP volume** series (HVN peaks + low-volume
valleys via local-minima/gradient detection); `magnetCheck.ts` magnets = POC/VAH/VAL (straight from
Summary) + HVN peaks; `terrainZones.ts` classifies regions by **volume (acceptance/HVN vs
rejection/LVN) cross-referenced with delta sign** (absorption vs initiative) on the joined series.

---

## Knowledge Restructure

Drop the Gem "silently retrieve the doctrine" pattern. Dedupe `instructions.md` and
`tactical-companion-playbook.md` (they overlap on the intelligence sequence, Magnet Check,
Asymmetric Initiative, Leg-VWAP rule, output formats). New layout:

```
/knowledge
  /system
    persona.md         # Gekko persona, tone, ADHD UX rules (≤2 highlights, one action)
    constraints.md     # Hardcoded non-negotiables as guardrails (color=side, stops never
                       #   widen, entries only at borders, Leg VWAP rule, Magnet prohibition,
                       #   Asymmetric Initiative + Campaign Boundary Override)
    output-schema.md   # Prose description mirroring the Zod schema
  /doctrine            # Model reads for PERCEPTION/JUDGMENT only
    patterns.md        # consolidate the 4 cheat sheets (absorption/exhaustion,
                       #   rebid/reoffer, failed-breakout, flush-&-reload)
    chart-reading.md   # consolidated <chart_interpretation>
    glossary.md        # MGI glossary (tiering logic itself lives in mgiPriority.ts)
  /schema
    briefing.schema.ts # Zod = single source of truth for the output contract
```

- The "Intelligence Processing Sequence" stops being a prompt waypoint list — it becomes
  the `analyze-task` orchestration (engine steps in code, then one model call).
- Static doctrine is assembled into the **cached prompt prefix** (Anthropic prompt caching:
  ~0.1× read cost + lower latency). Through the Vercel AI SDK this is set via the Anthropic
  provider's `cache_control` / `providerOptions` (passed through OpenRouter) on the system
  content — **wire this explicitly; it's the main cost/latency lever, not an afterthought.**
  Volatile per-run data (MGI JSON, CSV telemetry, screenshots, current price/time) goes in
  the user message **after** the cached prefix — never interpolated into the system prompt
  (that would invalidate the cache each run). Min cacheable prefix clears easily
  (2048 tok Sonnet / 4096 tok Haiku).
- **Cache TTL ↔ interval:** the briefing interval is configurable (`config.interval_min`,
  not hardcoded to 10). Pick the cache TTL from it — default 5-min TTL when the interval is
  ≤5 min, else the 1-hour TTL so the doctrine prefix stays warm between runs.
- **Output is JSON, not markdown** — use the AI SDK `generateObject` with the Zod `Briefing`
  schema; the Next.js UI renders tables and the terrain map from the object. The old CSV
  terrain map becomes a `terrain.zones[]` array drawn as a real zone map.

### Output contract (`briefing.schema.ts`)
```ts
Briefing = {
  meta: { createdAt, triggerReason, currentPrice, htfTrend, ripStatus },
  overview: { currentPosition: string[], structuralArchitecture: string[],
              orderFlowContext: string[], keyInflections: {level:number, why:string}[] },
  terrain: { zones: {color, top, bottom, label}[],     // contiguous, engine-validated
             levels: {price, label, kind:'trench'|'wall'|'magnet'|'mgi'}[] },
  primary: Objective, secondary: Objective,
  dangerZones: { area:string, why:string }[]
}
Objective = { macroGoal, rationale, direction:'long'|'short',
  entries: {label, price, trigger}[], stops: {label, price, invalidation}[],
  targets: {label:'T1'|'T2'|'T3', price, description}[], rr:number }  // rr from riskReward.ts
```

---

## Persistence (Supabase / Postgres)

```
config(id, interval_min=10, proximity_pts=10, model_id='claude-sonnet-4-6', rr_min=3.0, updated_at)
raw_bundles(id, received_at, mgi_json jsonb, exec_csv_ref, vol_profile_ref, delta_profile_ref,
            htf_png_ref, tpo_png_ref, exec_png_ref, current_price, is_stale)
briefings(id, bundle_id fk, created_at, trigger_reason, model_id, htf_trend, rip_status,
          terrain jsonb, primary_obj jsonb, secondary_obj jsonb, danger_zones jsonb,
          overview jsonb, raw_model_json jsonb)
entry_levels(id, briefing_id fk, objective, label, price, direction, stop, targets numeric[],
             active bool default true, created_at)   -- proximity scans active=true only
latest_price(price, ts)                              -- single hot row (or Upstash Redis)
```
On each new briefing: set prior `entry_levels.active=false`, insert the new set. Files
(PNGs, CSVs) go to Supabase Storage; rows hold refs. Small JSON (mgi) stored inline.

---

## trigger.dev Tasks
- `scheduled-briefing` — `schedules.task` cron (default `*/10 * * * *`; if interval must be
  runtime-configurable, use an imperative schedule driven by the `config` row). Skips +
  emits a staleness alert if the latest bundle is older than interval+margin.
- `proximity` — fired from `/api/price` (zero standing poll cost): on
  `|price-level| ≤ config.proximity_pts`, `tasks.trigger("analyze-task", …)` with
  **idempotency + debounce keys** per `level_id` (trailing window, e.g. one analysis per
  level per 3–5 min) so a price oscillating around a level can't fire 20 analyses.
- `analyze-task` — the only LLM task: load bundle → engine → AI SDK `generateObject` via
  OpenRouter (images + engine facts, Zod-schema-constrained, cached doctrine prefix) → Zod
  validate → persist → trigger notify. Uses retries; logs model/cost to run metadata.
- `notify-task` — thin; sends the alert so notification failures don't fail analysis.

## Web Notifications
Start simple: **Notification API + Service Worker**, driven by **Supabase Realtime** on
the `briefings`/`entry_levels` channel — works while the tab is open/backgrounded, no
VAPID setup. Add **Web Push (VAPID + `web-push`)** later only if "tab fully closed"
alerting is needed.

---

## Phased Build Order

**Phase 0 — De-risk (do first; these are the real unknowns):**
1. **DONE** — profile DATA format confirmed from samples now in the repo
   (`chart-data/vbp_export.md`, `chart-data/delta_vbp_export.md`); parsing spec locked (see
   *Profile Export Format*). Remaining Phase-0 step: validate `lvnDetection`/`magnetCheck`
   output against a hand-labeled chart. *(The engine is the system's main edge over the Gem.)*
2. Prove Sierra Chart **chart-image auto-export** yields clean, consistently-cropped PNGs on
   a timer. *(If flaky, the "remove the manual loop" goal degrades.)*
3. Prove ACSIL `sc.MakeHTTPPOSTRequest` can hit a public stub `/api/price`.

**Phase 1 — Thinnest end-to-end loop (reproduce the Gem, automatically):**
Supabase schema + `/api/ingest`; local uploader bundling the existing files; `analyze-task`
calling `anthropic/claude-sonnet-4-6` via the AI SDK + OpenRouter with images + raw data
(no engine yet) → JSON → persist; bare Next.js page rendering the briefing JSON; one
`scheduled-briefing` cron. Ship it.

**Phase 2 — Deterministic engine:** build `deltaTelemetry`, `mgiPriority`, `ripStatus`,
then `lvnDetection`/`magnetCheck`/`terrainZones`/`riskReward`; inject engine facts, shrink
the prompt; add the terrain/zone-map UI.

**Phase 3 — Proximity + notifications:** ACSIL price heartbeat → `/api/price`; proximity +
debounce → `analyze-task`; Notification API + Realtime; config UI (interval, proximity, model).

**Phase 4 — Hardening:** staleness detection; Haiku triage to suppress no-op proximity
analyses; Web Push (tab-closed); cost/latency observability; Opus flag for high-conviction reviews.

---

## Verification (end-to-end)
- **Phase 0:** unit tests for engine math against a hand-labeled chart (LVN/Trench/Wall/
  Magnet, contiguous zones with no gaps, R/R values); a `curl` to the stub `/api/price`
  from the ACSIL heartbeat returns 200.
- **Phase 1:** drop a known bundle into the export folder → uploader POSTs → a briefing
  row appears → the Next.js page renders primary/secondary objectives and danger zones.
  Compare the output against the existing sample briefing for parity.
- **Phase 3:** push a `latest_price` within `proximity_pts` of an active entry level →
  exactly one `analyze-task` fires (debounce holds on oscillation) → a web notification
  appears with the tactical read.
- **Throughout:** assert `response.model` is the configured model; confirm prompt-cache
  hits via `usage.cache_read_input_tokens > 0` on repeat runs.

## Top Risks (ranked)
1. Engine **LVN/Magnet detection quality** — the main edge. Format is now locked from samples;
   residual risk is detection accuracy, validated against a hand-labeled chart in Phase 0.
2. **Chart-image auto-export reliability** — validate in Phase 0.
3. **Single-machine availability** — no running Sierra Chart/uploader = no data; must detect
   and surface staleness, never serve stale briefings as fresh.
4. **Proximity thrash/cost** — mitigated by debounce/idempotency keys + a Haiku triage gate.
5. **Doctrine drift** between engine code and `constraints.md` guardrails — keep in sync,
   engine authoritative.
