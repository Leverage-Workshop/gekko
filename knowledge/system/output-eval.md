# Output Contract — `EvalResult`

You output **one structured `EvalResult` JSON object** — never markdown. An on-demand entry check
at the current price against the active entry levels from the prior briefing.

## Field semantics

- **`status`** —
  - `NO_ENTRY_NEAR`: price is not near any active entry. The near/not-near gate is code-owned and
    stated in the user message; never re-derive proximity.
  - `ENTER` / `WAIT` / `NOT_VALID`: apply only when price IS near an active entry, judged against
    the specific level the user message tells you to evaluate. The decision doctrine is in the
    user message.
- **`checks`** — your verdict decomposed into named conditions (per the instructions in the user
  message). Null on level-less `NO_ENTRY_NEAR` verdicts.
- **`nextSignal`** — for WAIT / NOT_VALID: the single concrete observable that would flip the
  verdict to ENTER. Null for ENTER.
- **`caution`** — one line of what NOT to do right now. Null if nothing needs flagging.
- **`reason`** — a 1–2 sentence verdict summary; the checks carry the detail.
- **`meta.zone`** — your one-phrase read of the zone price currently sits in.
