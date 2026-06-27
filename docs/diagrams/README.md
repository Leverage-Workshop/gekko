# Gekko Architecture Diagrams

A visual companion to [`docs/agent-architecture-plan.md`](../agent-architecture-plan.md)
(the architecture) and [`feature_list.json`](../../feature_list.json) (the work breakdown).
Each file holds [Mermaid](https://mermaid.js.org/) diagrams — GitHub renders ` ```mermaid `
blocks natively, so no tooling is needed to view them.

> **Status note.** These diagrams describe the **designed** system. Gekko is mid-build
> (11 of 34 features done), so some components shown here are not yet implemented. Nodes
> are marked **✓ done** or **✗ planned** wherever build status matters, and the
> [feature roadmap](feature-roadmap.md) is the authoritative status view.

## Index

| Diagram | What it shows | Mainly built? |
| --- | --- | --- |
| [system-architecture.md](system-architecture.md) | Component / data-flow across the three tiers (Sierra Chart → uploader → cloud → UI) + the end-to-end "Run Briefing" sequence | Partial |
| [db-schema.md](db-schema.md) | ER diagram of the 5 Postgres tables + `config` singleton, and the `entry_levels` lifecycle | ✓ (feat-005) |
| [llm-call-flow.md](llm-call-flow.md) | `analyze-task` & `eval-task` LLM sequences + the prompt-caching prefix/volatile split | ✗ (feat-018/023/025) |
| [engine.md](engine.md) | The 8 `lib/engine/` module data-lineage graph + the deterministic-vs-LLM split & hybrid LVN flow | Partial |
| [output-contract.md](output-contract.md) | Zod class diagram for `Briefing` / `Objective` / `EvalResult` | ✓ (feat-006) |
| [trigger-tasks.md](trigger-tasks.md) | trigger.dev task orchestration + the notification flow | ✗ (feat-018/025/026) |
| [feature-roadmap.md](feature-roadmap.md) | Feature dependency graph (critical path highlighted) + the Phase 0–4 build order | n/a |

## Source of truth

Every name, field, FK, and dependency below is taken verbatim from
`docs/agent-architecture-plan.md` and `feature_list.json`. If those change, update the
diagrams to match. Two candidate diagrams were **deliberately left out** to avoid
low-value clutter: a `/knowledge/**` file tree (already a clean code block in the plan) and
a standalone Vanguard-Protocol / `EvalResult`-status state machine (these are simple enums
already visible in the ER and class diagrams).
