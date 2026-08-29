---
name: explainer-doc
description: Write a plain-English explainer document for a concept the operator wants to understand — a trading mechanic, an engine behaviour, a piece of Sierra Chart or DOM configuration — grounded in primary sources, with embedded Excalidraw diagrams and timestamped YouTube links back to the evidence. Use when asked to "explain X", "write up how X works", "document X in plain English", "I want to understand X", or to produce something in the shape of docs/jba-research/refreshing-explained.md.
---

# Explainer documents

The reference implementation is
[`docs/jba-research/refreshing-explained.md`](../../../docs/jba-research/refreshing-explained.md)
(585 lines, four diagrams, ~70 timestamped links). Read its first 140 lines before writing —
it is the shape, the voice, and the density you are matching.

An explainer is **not** a spec, a summary, or a set of notes. It is a document that takes one
concept the operator half-understands and makes it fully understood, in language a smart person
outside the domain would follow, while never asking them to take a claim on faith.

## The contract

1. **Layman's terms, no jargon smuggling.** Define the mechanism from first principles before
   naming it. The refreshing doc explains resting orders and market orders in two paragraphs
   before the word "refreshing" carries any weight. If a term must be used, translate it in a
   table up front (see the bid/offer → buy/sell table at the top of the reference doc).
2. **Every claim carries a receipt.** A quote from a transcript, a line from reference material,
   a file path, a code reference. Never an unsourced assertion about how something works. If you
   could not source it, say so explicitly (the reference doc has a "One known defect" section).
3. **Terminology follows the operator, not the source.** If the operator asked for buy/sell
   instead of bid/offer, your prose uses buy/sell and the quotes stay verbatim — with the
   translation table explaining the gap.
4. **Diagrams where a picture beats a paragraph** — see below for the bar.
5. **Timestamped links, always clickable.** `https://youtu.be/VIDEO_ID?t=SECONDS`.
6. **A findable index.** The reference doc ends with a "Where to see it" section: a table of
   every source video, a curated "start here — the six clearest clips" table, then a full
   per-video index of every mention with a one-line gloss on each. That index is often the most
   used part of the document.
7. **A one-paragraph summary at the very end**, written so it stands alone if someone reads
   nothing else.

## Workflow

### 1. Scope it with the operator

Confirm in one line: what concept, for what audience, from which sources. Do not ask more than
that unless genuinely ambiguous.

### 2. Harvest the sources before writing a word

For JBA / trading concepts, the primary sources are:

| Source | Path | What it is |
| --- | --- | --- |
| Market-replay transcripts | `docs/jba-research/replays/*.txt` | `[mm:ss]` auto-captions, header line carries the YouTube URL and title |
| Course reference material | `docs/jba-research/reference/` | OFL course text, `dom.txt` etc. |
| Prep-video notes | `docs/jba-research/jba-prep-video-notes.md` | |
| Transcripts index | `docs/jba-research/transcripts/`, `priority-videos.json` | |

Grep the transcripts for the concept and its synonyms, widely — "refresh", "refreshing",
"reload", "replenish", "step away". Pull ±10 lines of context around each hit so the quote can be
read in situ. Build the mention inventory **first**; the document's structure should fall out of
what the evidence actually supports, not out of an outline you wrote before looking.

**Do not cite `docs/jba-research/execution-process.md` or `execution-notes.md`** for Job
entry-process work — standing operator instruction (2026-08-27). Replays and reference material
only.

### 3. Convert timestamps to links

Transcript lines are `[mm:ss]`. The link is `https://youtu.be/<ID>?t=<total_seconds>`, ID from
the transcript filename (`2026-05-19_RaJRUnHR_Rg.txt` → `RaJRUnHR_Rg`) or its header line.
`[04:54]` → `?t=294`. Get the arithmetic right — a wrong timestamp is worse than no link,
because it silently costs the reader a minute of scrubbing. Compute them in a script, not by
hand, when there are more than a handful.

Link text convention: `[05-19 @02:17](https://youtu.be/RaJRUnHR_Rg?t=137)` — date, then time.

### 4. Draft the document

Skeleton in [`references/skeleton.md`](references/skeleton.md). Section 1 is always the concept
itself; later sections are the operational how-to (how to see it on your own screen), then the
timestamped index, then the summary.

Write the prose before the diagrams. The diagram's job is to compress something already written,
so you need the writing first to know what is worth compressing.

### 5. Add diagrams

**The bar:** a diagram earns its place when the idea is *spatial or temporal* and the prose has
to work hard to convey it — a sequence over time, a two-by-two of opposite readings, a
state machine, a decision fork. Four diagrams in 585 lines is the right density. Do not
illustrate a definition; a definition is a sentence.

The four in the reference doc, as calibration:
- `01-refreshing-mechanic` — a temporal sequence (resting → eaten → back at the same price)
- `02-two-readings` — a two-by-two (who is refreshing × which way you lean)
- `03-how-refreshing-ends` — a fork (dwindle-then-step-away = go; step-down-in-front = dead)
- `04-walkthrough-05-19` — a five-stage timeline of one real worked example

Build them with the `mcp-excalidraw-local` MCP server. **That server has sharp edges that will
silently corrupt other diagrams if you do not follow the procedure** — read
[`references/excalidraw-workflow.md`](references/excalidraw-workflow.md) before your first
`batch_create_elements` call, every time.

Commit both files per diagram: `NN-slug.png` (embedded) and `NN-slug.excalidraw` (editable
source), in a `diagrams/` directory beside the document. Embed with a descriptive alt text that
states the diagram's claim, not its title:

```markdown
![The mechanic of refreshing: orders resting at a price, eaten in one wave, and back at the same price a second later](./diagrams/01-refreshing-mechanic.png)
```

Note once, under the first diagram, that the `.excalidraw` sources are editable at
excalidraw.com.

### 6. Verify before handing it over

- Every YouTube link resolves to the moment claimed — spot-check the arithmetic on a sample
  against the transcript lines.
- Every quote is verbatim from the transcript, including the disfluencies. Do not tidy Job's
  speech.
- Every relative link (`./diagrams/…`, `./reference/…`, `./replays/…`) points at a file that
  exists: `grep -o '](\./[^)]*)' doc.md` and stat each one.
- Every `.png` embedded has its `.excalidraw` sibling committed.

## Voice

Short declarative sentences. Second person for the operator's actions ("you wait", "your
opponent is home"). Bold for the one load-bearing sentence in a section, not for emphasis
generally. Em-dashed asides are fine. No hedging on things the evidence supports; explicit
flagging of things it doesn't.

Sections carry their own headline claim as the first sentence. A reader skimming only the first
sentence of each section should come away with the argument.
