# trigger.dev Task Orchestration & Notifications

Source: `docs/agent-architecture-plan.md` → *trigger.dev Tasks* (lines 242–256) and
*Web Notifications* (lines 257–261).

## Task orchestration

Two UI buttons hit two API routes, each triggering one task; both tasks fan out to a thin
`notify-task` on success and log model/cost/latency to run metadata. Tasks use retries.

```mermaid
graph LR
  UIb["UI · Run Briefing"] --> BR["/api/briefings/run"]
  UIe["UI · Check Entry"] --> ER["/api/eval/run"]
  BR -->|"tasks.trigger('analyze-task', {triggerReason:'manual'})"| AT["analyze-task<br/>Sonnet 4.6 · Briefing schema"]
  ER -->|"tasks.trigger('eval-task')"| ET["eval-task<br/>Haiku 4.5 · EvalResult schema"]
  AT -->|"on success"| NT["notify-task (thin)"]
  ET -->|"on success"| NT
  AT -.->|"retries · model/cost/latency"| META["run metadata"]
  ET -.-> META
```

## Notification flow

`notify-task` is thin so a failed alert never fails the analysis. Delivery starts simple —
Supabase Realtime on the `briefings` / `eval_results` channel drives the Notification API via
a Service Worker while the tab is open or backgrounded. Web Push (VAPID + `web-push`) is
added later only for tab-fully-closed alerting (feat-027).

```mermaid
sequenceDiagram
  participant T as analyze-task / eval-task
  participant DB as Supabase Postgres
  participant RT as Supabase Realtime
  participant SW as Service Worker
  participant N as Notification API

  T->>DB: insert briefings / eval_results row
  DB->>RT: row change on briefings / eval_results channel
  RT->>SW: realtime event (tab open or backgrounded)
  SW->>N: show notification
  Note over T,N: notify-task is thin — a failed alert never fails the analysis
```
