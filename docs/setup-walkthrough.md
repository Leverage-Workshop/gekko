# Gekko — Getting It Running on Your Machine

A step-by-step runbook to go from a fresh checkout to a working advisory loop:
Sierra Chart exports → local uploader → `/api/ingest` → **Run Briefing** /
**Check Entry** buttons → trigger.dev tasks → briefing rendered in the web UI.

The app runs **locally on the trading machine** (Vercel deploy was descoped —
feat-021). Three processes are involved in daily operation:

| Process | Where it runs | What it does |
|---|---|---|
| Next.js app | trading machine (WSL or Windows) | UI + API routes (`/`, `/settings`, `/api/*`) |
| Local uploader | Windows (same box as Sierra Chart) | watches `C:\gekko\export`, POSTs bundles to `/api/ingest` |
| trigger.dev tasks | trigger.dev cloud | `analyze-task` / `eval-task` (the LLM calls) |

Supabase (Postgres + Storage + Realtime) is the shared store; OpenRouter is the
LLM gateway.

---

## 1. Prerequisites

- **Node ≥ 20.12** (the uploader uses `process.loadEnvFile`; Next 16 needs ≥ 20.9).
  Check with `node --version`.
- Accounts/credentials you already have:
  - **Supabase** project `qvhkqilizwozikpomxob` (live; 4 of 7 migrations applied — see step 4)
  - **trigger.dev** project `proj_txmafkbausaizdmtsoiw` (org `leverage-workshop-c42c`)
  - **OpenRouter** API key (https://openrouter.ai/keys)
- Sierra Chart on the Windows box with the ACSIL export studies writing to
  `C:\gekko\export\`.

## 2. Get the code and verify the baseline

```bash
git clone <repo-url> gekko && cd gekko
npm install
./init.sh        # typecheck + lint + tests + build — must be green before anything else
```

If `./init.sh` fails on a clean checkout, stop and fix that first.

## 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` (the Next.js app reads `.env.local`; the uploader now loads
`.env.local` then `.env` itself):

**Required for the app:**

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page (anon/publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (service role — keep secret) |
| `INGEST_BEARER_TOKEN` | generate once: `openssl rand -hex 32` |
| `TRIGGER_SECRET_KEY` | trigger.dev dashboard → Project → API keys (`tr_dev_*` for dev, `tr_prod_*` for the deployed worker — see step 5) |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |

**Required for the uploader** (same file if the uploader runs from this checkout;
otherwise put them in the uploader machine's `.env` — see step 7):

| Variable | Value |
|---|---|
| `INGEST_URL` | `http://localhost:3000/api/ingest` (or the app machine's LAN address) |
| `GEKKO_EXPORT_DIR` | `C:\gekko\export` |
| `INGEST_BEARER_TOKEN` | the **same** value as the app's |

**Optional** (can be added later): `LANGSMITH_*` (LLM tracing, step 8) and
`VAPID_*` (tab-closed push, step 8). The model IDs are **not** env vars — they
live in the `config` DB row and are editable at `/settings`.

## 4. Supabase — migrations

**As of 2026-07-08 all 7 migrations are applied to the live project** (verified:
`init_core_schema`, `storage_buckets`, `seed_config`, `default_model_sonnet_5`,
`high_conviction_flag`, `realtime_notifications`, `push_subscriptions`) — nothing
to do for a normal setup.

If you ever point the app at a **fresh** Supabase project instead, apply the
whole `supabase/migrations/` folder in filename order, either:

- **CLI:** `supabase link --project-ref <ref>` (needs the DB password), then
  `supabase db push`, or
- **Dashboard:** SQL editor → paste each file's contents → run, in order.

Symptoms of missing migrations (the app degrades gracefully): `/settings` saves
fail with an explicit "apply the migration" message, the alerts strip receives
no events, and push subscribe returns a clean 500.

## 5. trigger.dev — tasks and their environment

The LLM work runs in trigger.dev's cloud, so the **tasks need their own copies
of the secrets** (they do not see your `.env.local`):

In the trigger.dev dashboard → Environment Variables, set for the environment
you'll use (at minimum **prod**):

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- optional: `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT`, `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`

Then pick a mode:

- **Daily use (recommended): deploy the tasks.**
  ```bash
  npx trigger.dev@latest login     # once
  npx trigger.dev@latest deploy
  ```
  Put the **`tr_prod_*`** key in `.env.local` as `TRIGGER_SECRET_KEY`. Buttons
  now work with nothing else running.
- **Development: run a local task worker.**
  ```bash
  npx trigger.dev@latest dev       # keeps running; loads your local .env
  ```
  Use the **`tr_dev_*`** key in `.env.local`. Runs only execute while `dev` is up.

## 6. Run the web app

```bash
npm run build && npm start    # production mode — recommended on the trading machine
# or: npm run dev
```

Open http://localhost:3000. With an empty-ish DB you'll see the "No Briefing
Yet" state and (until a bundle arrives) a STALE DATA banner — both expected.

Note: `NEXT_PUBLIC_*` values are inlined at **build** time — rerun
`npm run build` after changing them.

## 7. The Windows uploader + Sierra Chart

The uploader must run **on Windows, next to Sierra Chart** (it watches the
export folder). In a clone of this repo on that box (Node ≥ 20.12):

```powershell
npm install
npm run uploader
```

It reads `.env.local`/`.env` from the repo root — set `INGEST_URL`,
`GEKKO_EXPORT_DIR`, `INGEST_BEARER_TOKEN` there (step 3). It watches for the
nine export files Sierra writes (~every 30 s):

```
htf_clean.png, tpo.png, execution_clean.png,
execution_bar_data.rolling.csv,
four-hundred-rotation.vbp.md, rolling-five-day.vbp.md,       (HTF volume profiles)
half-rotation-delta.vbp.md, full-rotation-delta.vbp.md,      (execution delta profiles)
mgi_static_levels.json      (current price/time come from this file)
```

On each settled write-burst it debounces (2 s default), bundles whatever files
exist, and POSTs with retry/backoff. Retries are idempotent (a stable bundle id
is reused), so a flaky connection can't create duplicate bundles.

If the app runs in WSL2 on the same box, `http://localhost:3000/api/ingest`
works from Windows as-is.

## 8. Optional extras

**Web Push (alerts with the tab fully closed):**

```bash
npx web-push generate-vapid-keys   # once
```

- `.env.local`: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (e.g. `mailto:you@example.com`), and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same
  value as the public key). **Rebuild the app** afterwards.
- Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` on the
  trigger.dev environment too (the tasks do the sending).
- Requires the `push_subscriptions` migration (step 4). Then click **Enable
  Push** in the app's alerts strip.

Tab-**open** alerts (Supabase Realtime) need no keys — just the
`realtime_notifications` migration and clicking **Enable Alerts**.

**LangSmith tracing:** set `LANGSMITH_API_KEY` (+ optional `LANGSMITH_PROJECT`)
on the **trigger.dev environment**. Every analyze/eval LLM call is then traced
(prompt + JSON response, chart images redacted). Unset = fully disabled.

## 9. First end-to-end smoke test

1. Start the app (step 6) and the uploader (step 7); make sure tasks are
   deployed or `trigger.dev dev` is running (step 5).
2. Let Sierra export once (or drop the sample files from `chart-data/` into the
   export folder). Uploader log should show a successful POST; the STALE DATA
   banner on the dashboard should clear on reload.
3. Click **Run Briefing**. Watch the run in the trigger.dev dashboard
   (`analyze-task`); on completion, reload — the full briefing + terrain map
   should render.
4. Click **Check Entry at Current Price** → an `eval-task` run → the eval
   result (ENTER / WAIT / NOT_VALID / NO_ENTRY_NEAR) renders. With no active
   entry levels yet it returns NO_ENTRY_NEAR without an LLM call.
5. Visit `/settings` to confirm the config row loads (model, triage model,
   rr_min, high-conviction flag).
6. If you enabled alerts/push: run another briefing and confirm the
   notification fires (tab backgrounded for Realtime; tab closed for push).

## 10. Daily operation

- Keep running: Sierra Chart (with export studies), the uploader
  (`npm run uploader`), and the app (`npm start`). Tasks run in trigger.dev
  cloud — nothing else needed if deployed.
- Fresh data guard: a bundle older than **180 s** flags everything STALE — the
  dashboard banners it and briefings/evals carry the warning. If you see it,
  check Sierra exports and the uploader console.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Run Briefing` → 500 mentioning `TRIGGER_SECRET_KEY` | key missing/wrong in `.env.local`; match it to the environment (dev vs prod) you're using |
| Run queued but never executes | using `tr_dev_*` without `npx trigger.dev dev` running — deploy + use `tr_prod_*`, or start dev |
| `/settings` save → 400 "apply … high_conviction_flag.sql first" | step-4 migration #1 not applied |
| Alerts strip stuck on "Connecting…" / no events ever | `realtime_notifications` migration not applied, or missing `NEXT_PUBLIC_SUPABASE_*` env |
| "Realtime error … Reconnecting" persists | Supabase Realtime unreachable; it auto-retries with backoff — check network / project status |
| Enable Push fails immediately | VAPID env vars missing (rebuild after setting `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) or `push_subscriptions` migration not applied |
| Uploader exits with "Invalid uploader configuration" | `INGEST_URL` / `GEKKO_EXPORT_DIR` / `INGEST_BEARER_TOKEN` not set in `.env.local`/`.env` on the uploader box; Node must be ≥ 20.12 |
| Uploader gets 401 from ingest | `INGEST_BEARER_TOKEN` mismatch between uploader and app |
| Briefing task fails with a model-id error | check the `config` row via `/settings`; the id must be an OpenRouter id (e.g. `anthropic/claude-sonnet-5`); check OpenRouter credits |
| Permanent STALE DATA banner | no recent bundle: Sierra not exporting, uploader not running, or ingest URL/token wrong |
