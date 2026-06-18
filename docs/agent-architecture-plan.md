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

**Intended outcome:** an advisory-only agent that (a) runs analysis **on demand from the
web UI** — a "Run Briefing" button for a full briefing and a "Check Entry" button for an
entry-validity eval at the current price, (b) renders briefings as a rich web UI (real
terrain/zone map, not markdown), (c) is materially faster, and (d) has a clean, deduped
knowledge base with computable doctrine moved into code.

### Decisions locked with the user
- **Scope:** Advisory only — never connects to a broker or places orders.
- **Inputs:** Hybrid — keep screenshots (LVN/spatial detection is hard to code) **and**
  use the structured data exports (volume profile, delta profile, MGI, exec CSV).
- **Triggering:** On demand only — two UI buttons ("Run Briefing", "Check Entry"). No
  scheduler, no live price feed, no proximity automation.
- **Notifications:** Simple web notifications (he's at his desk).
- **Models (latency goal):** Default **`anthropic/claude-sonnet-4-6`** (vision + strong
  reasoning, faster than Gemini Pro 3.1) for full briefings; **`anthropic/claude-haiku-4-5`**
  for the cheap "Check Entry"/"is this entry warranted" eval triage;
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
  └─ Chart image auto-dump ──▶ C:\gekko\export\  (htf.png, tpo.png, exec.png)

[Local uploader (Node + chokidar)]
  └─ watches export folder, debounces, bundles ─── POST /api/ingest (multipart, ~30s)

====================== CLOUD (Next.js + trigger.dev + Supabase) ======================
  /api/ingest        → store raw bundle (files→storage, mgi→jsonb)  [no auto-analyze]
  /api/briefings/run → tasks.trigger("analyze-task", {triggerReason:"manual"})   ◀ UI button
  /api/eval/run      → tasks.trigger("eval-task")                                 ◀ UI button
  trigger.dev:
    ├─ analyze-task (full-briefing LLM task):
    │     1) deterministic engine (TS)  2) Claude (vision+structured JSON)
    │     3) validate (Zod)  4) persist briefing + refresh entry_levels  5) notify
    ├─ eval-task (entry-eval triage; current price = latest bundle):
    │     load latest bundle + active entry_levels → triage model → EvalResult
    │     → validate (Zod) → persist eval_results → notify
    └─ notify-task (web push / realtime)
  Supabase: config, raw_bundles, briefings, entry_levels, eval_results
  Next.js UI: terrain/zone map (SVG/canvas), briefing render, eval result, two trigger buttons, config
```

**Why a local uploader (not direct ACSIL HTTP):** ACSIL *can* POST JSON
(`sc.MakeHTTPPOSTRequest`), but it can't easily screenshot+upload a PNG, and embedding
auth/retry in C++ is brittle. A ~100-line `chokidar` watcher isolates all fragile local
concerns (file-write timing, screen capture, retries, bearer auth) in one debuggable JS
process.

**Current price (no live feed):** Sierra Chart exports the bundle every ~30s, so the latest
`raw_bundles` row is fresh; the eval uses its `current_price`. There is no ACSIL price
heartbeat, no `/api/price`, and no `latest_price` table — avoiding both the C++ HTTP path and
any third-party feed cost / data-redistribution licensing.

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
- **Cache TTL:** runs are user-initiated (button clicks), so there's no fixed interval to
  tune against. Use the default 5-min TTL; bursts of clicks reuse the warm doctrine prefix.
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

The **eval-task** ("Check Entry") emits a separate, lighter contract — the `instructions.md`
eval logic (ENTER/WAIT/NOT VALID, else "no entry near"):
```ts
EvalResult = {
  meta: { createdAt, currentPrice, nearEntry:boolean, zone?:string },
  status: 'ENTER' | 'WAIT' | 'NOT_VALID' | 'NO_ENTRY_NEAR',
  evaluatedLevel?: { label:string, price:number, direction:'long'|'short' },
  direction?: 'long'|'short',
  trigger?: string, stop?: number, targets?: number[],
  reason: string
}
```

---

## Persistence (Supabase / Postgres)

```
config(id, model_id='claude-sonnet-4-6', triage_model_id='claude-haiku-4-5', rr_min=3.0, updated_at)
raw_bundles(id, received_at, mgi_json jsonb, exec_csv_ref, vol_profile_ref, delta_profile_ref,
            htf_png_ref, tpo_png_ref, exec_png_ref, current_price, is_stale)
briefings(id, bundle_id fk, created_at, trigger_reason, model_id, htf_trend, rip_status,
          terrain jsonb, primary_obj jsonb, secondary_obj jsonb, danger_zones jsonb,
          overview jsonb, raw_model_json jsonb)
entry_levels(id, briefing_id fk, objective, label, price, direction, stop, targets numeric[],
             active bool default true, created_at)   -- eval-task evaluates active=true only
eval_results(id, bundle_id fk, created_at, model_id, near_entry bool, status,  -- ENTER|WAIT|NOT_VALID|NO_ENTRY_NEAR
             evaluated_level_id fk, direction, trigger, stop, targets numeric[],
             reason, current_price, raw_model_json jsonb)
```
On each new briefing: set prior `entry_levels.active=false`, insert the new set. Files
(PNGs, CSVs) go to Supabase Storage; rows hold refs. Small JSON (mgi) stored inline. Current
price is read from the latest `raw_bundles` row (no separate hot-price store).

---

## trigger.dev Tasks
- `analyze-task` — full-briefing LLM task, triggered on demand from `/api/briefings/run`
  ("Run Briefing" button): load latest bundle → engine → AI SDK `generateObject` via
  OpenRouter (images + engine facts, Zod `Briefing` schema, cached doctrine prefix) → Zod
  validate → persist briefing + refresh `entry_levels` → trigger notify. Checks bundle
  freshness and flags staleness; never serves stale as fresh. Uses retries; logs model/cost
  to run metadata.
- `eval-task` — entry-eval triage, triggered on demand from `/api/eval/run` ("Check Entry"
  button): load latest bundle (current price = `raw_bundles.current_price`) + active
  `entry_levels` → AI SDK `generateObject` via OpenRouter with the **triage model**
  (`config.triage_model_id`, default `claude-haiku-4-5`; images + delta telemetry, Zod
  `EvalResult` schema) implementing the `instructions.md` eval logic → Zod validate →
  persist `eval_results` → trigger notify.
- `notify-task` — thin; sends the alert so notification failures don't fail analysis.

## Web Notifications
Start simple: **Notification API + Service Worker**, driven by **Supabase Realtime** on
the `briefings`/`eval_results` channel — fires on a new briefing or eval result while the
tab is open/backgrounded, no VAPID setup. Add **Web Push (VAPID + `web-push`)** later only
if "tab fully closed" alerting is needed.

---

## Phased Build Order

**Phase 0 — De-risk (do first; these are the real unknowns):**
1. **DONE** — profile DATA format confirmed from samples now in the repo
   (`chart-data/vbp_export.md`, `chart-data/delta_vbp_export.md`); parsing spec locked (see
   *Profile Export Format*). Remaining Phase-0 step: validate `lvnDetection`/`magnetCheck`
   output against a hand-labeled chart. *(The engine is the system's main edge over the Gem.)*
2. Prove Sierra Chart **chart-image auto-export** yields clean, consistently-cropped PNGs on
   a timer. *(If flaky, the "remove the manual loop" goal degrades.)*

**Phase 1 — Thinnest end-to-end loop (reproduce the Gem, on demand):**
Supabase schema + `/api/ingest`; local uploader bundling the existing files; `analyze-task`
calling `anthropic/claude-sonnet-4-6` via the AI SDK + OpenRouter with images + raw data
(no engine yet) → JSON → persist; bare Next.js page rendering the briefing JSON with a
"Run Briefing" button → `/api/briefings/run`. Ship it.

**Phase 2 — Deterministic engine:** build `deltaTelemetry`, `mgiPriority`, `ripStatus`,
then `lvnDetection`/`magnetCheck`/`terrainZones`/`riskReward`; inject engine facts, shrink
the prompt; add the terrain/zone-map UI.

**Phase 3 — On-demand eval + notifications:** "Check Entry" button → `/api/eval/run` →
`eval-task` (Haiku triage, eval logic vs active `entry_levels` at the latest bundle's
price); Notification API + Realtime; config UI (model, triage model, rr_min).

**Phase 4 — Hardening:** staleness detection; Web Push (tab-closed); cost/latency
observability; Opus flag for high-conviction reviews.

---

## Verification (end-to-end)
- **Phase 0:** unit tests for engine math against a hand-labeled chart (LVN/Trench/Wall/
  Magnet, contiguous zones with no gaps, R/R values).
- **Phase 1:** drop a known bundle into the export folder → uploader POSTs → click "Run
  Briefing" → exactly one `analyze-task` runs → a briefing row appears → the Next.js page
  renders primary/secondary objectives and danger zones. Compare the output against the
  existing sample briefing for parity.
- **Phase 3:** with active `entry_levels` present, click "Check Entry" → exactly one
  `eval-task` runs → an `eval_results` row appears with status (ENTER/WAIT/NOT_VALID or
  NO_ENTRY_NEAR) → the UI renders it and a web notification fires.
- **Throughout:** assert `response.model` is the configured model; confirm prompt-cache
  hits via `usage.cache_read_input_tokens > 0` on repeat runs.

## Top Risks (ranked)
1. Engine **LVN/Magnet detection quality** — the main edge. Format is now locked from samples;
   residual risk is detection accuracy, validated against a hand-labeled chart in Phase 0.
2. **Chart-image auto-export reliability** — validate in Phase 0.
3. **Single-machine availability** — no running Sierra Chart/uploader = no data; must detect
   and surface staleness, never serve stale briefings as fresh.
4. **Doctrine drift** between engine code and `constraints.md` guardrails — keep in sync,
   engine authoritative.
