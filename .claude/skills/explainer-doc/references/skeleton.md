# Explainer document skeleton

Derived from `docs/jba-research/refreshing-explained.md`. Section count flexes; the order and
the job of each section do not.

---

## Front matter (no heading)

```markdown
# <Concept>, in plain English — with the receipts

Written <date> from <the sources, as relative links>. Every timestamp below is a real link into
a real video — click it and watch the thing happen.

**Terminology note.** <If the operator's vocabulary differs from the source's, the translation
table goes here, before anything else.>

| Source says | Means |
| --- | --- |
```

Purpose: tell the reader where this came from, and hand them the decoder ring before they need
it.

---

## 1. What <concept> actually is

The conceptual core. Sub-sections, in this order:

- **The setup** — the world before the concept applies. First principles, no jargon.
- **The event** — the concept itself, stated in one bolded sentence, then unpacked with a
  concrete numeric example ("Somebody has 200 to sell at 21587…").
- The source's own words: a blockquote from reference material, then a blockquote of the
  operator's/expert's spoken definition with a timestamped link.
- **[DIAGRAM — the mechanic]**
- **Why it matters** — the consequence. Why anyone should care.
- **The variants / the readings** — if the concept means opposite things in different contexts,
  this section is mandatory and gets a diagram. Getting this wrong is how a reader misapplies it.
- **[DIAGRAM — the two-by-two]**
- **What ends it** — the boundary conditions. When does the concept stop applying, and what does
  the failure look like versus the clean exit.
- **[DIAGRAM — the fork]**
- **The companion signal** — what corroborates it elsewhere on the screen / in the data.
- **A concrete N-second walkthrough** — one real worked example, numbered, every step a
  timestamped link, narrated so the reader can follow along on the video.
- **[DIAGRAM — the walkthrough as a timeline]**

---

## 2. Reading it on your own <screen / system>

The operational half: how the reader reproduces the observation themselves. This is
configuration, not concept.

- The columns / fields / settings that matter, and what each one is
- Order and layout
- Colours, with the traps ("this is the one that gets set wrong, because…")
- Settings, with values and the reasoning behind each value
- **The N-state read** — the actual procedure, as a small decision procedure
- **What it looks like when it fires**
- **One known defect** — what you could not verify, or where the setup is known to mislead.
  Never omit this section when there is something to put in it.

---

## 3. Where to see it — timestamped index

Three tables, in this order:

1. **Source index** — every video: date, title, link.
2. **Start here — the N clearest clips** — curated, ranked, each with a one-line reason why this
   clip. This is the table people actually use.
3. **Full index, by video** — one sub-section per source, a table of every mention:
   `| timestamp link | verbatim quote | one-line gloss on what it means |`.
   The gloss is the value-add; a bare quote index is a `grep` the reader could have run.

---

## 4. Supporting detail

Anything that had to be worked out but does not belong in the argument — attributions, derivations,
counts, provenance. The reference doc uses this for "Instrument attribution, for the record",
showing how each video's symbol was inferred from spoken prices.

---

## 5. The one-paragraph summary

One paragraph, standalone, no links required to make sense of it. Assume it is the only thing
that gets read. State the mechanism, what it means, how it is used, and what invalidates it.
