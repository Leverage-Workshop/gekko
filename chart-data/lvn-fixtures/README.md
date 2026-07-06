# LVN/HVN Fixture Set

Target: **8 fixtures** — 5 train / 3 holdout — for tuning LVN/HVN detection thresholds
(feat-033). Label each profile to its **actual structure**, not to a fixed count.

**HVNs — only the most prominent.** Mark the fat bars where a lot of volume transacted (the ones
you don't want to enter a trade at): the POC-class peak on a clean/trend profile (often just one),
and the dominant peak of each distribution on a multi-modal one (3–4). Skip minor local maxima.

**LVNs — shelf edges, not just troughs (feat-035).** An LVN is where price moves through quickly:
the **edge of a large distribution** — where volume drops off a cliff into a lower shelf, or the
**start of a low-volume area between two distributions**. These are *knees / gradient edges*, so an
LVN label can sit at a **moderate** volume level (the top of the drop), not only at the absolute
trough. Genuine deep troughs and long tails are LVNs too. A clean bell has one HVN and a couple of
tail LVNs; a multi-modal profile has more. **Do not pad labels to hit a target number.** Labels are
eyeballed from the chart, so a few points of offset is fine (the eval matches within ±10pt), but
don't drop a label onto a fat bar just to hit a count — that corrupts the ground truth (the defect
corrected under feat-014).

> `fixture-x.*` is a **scratch template** (export, then rename to the next real fixture).
> It does **not** count toward the 8.

## Coverage requirements

- All 5 profile-shape categories represented.
- Both LVN types present in **both** train and holdout (guards against silent overfitting):
  - **Taper-edge** LVNs — from trend/elongated legs
  - **Valley** LVNs — from double-distribution / composite profiles
- Each export must span enough price levels to exhibit clear structure (several distributions,
  gaps, and tails) — not to hit a specific label count.

## Export checklist

Export the real Sierra `Price,Volume` CSV per session — do **not** digitize from a chart image.

| # | Fixture | Shape category | Primary LVN type | Why / what to look for | Status |
|---|---------|----------------|------------------|------------------------|--------|
| 1 | `fixture-1` | Broad multi-modal single session | Valley | Wide single session, several bumps and dips across the value area — general baseline. | ✅ done |
| 2 | `fixture-2` | Double-distribution / composite (wide) | Valley | Very wide range with multiple humps; deep valleys between them are the valley-LVN source. | ✅ done |
| 3 | `fixture-3` | Trend / elongated (up leg) | Taper-edge | Single-direction leg: fat base, long thin taper upward. The taper edge is where taper-edge LVNs live. | ✅ done |
| 4 | `fixture-4` | Balanced bell / normal | Valley (shallow) + clean POC HVN | One clean symmetric peak tapering both sides. Easy high-confidence case with an obvious POC HVN. | ✅ done |
| 5 | `fixture-5` | Clean double-distribution (two humps, one deep valley) | Valley (deep) | Two distinct humps with one obvious gap between them — cleaner than fixture-2 so the valley type is unambiguous. | ✅ done |
| 6 | `fixture-6` | Multi-session composite | Valley | Several sessions merged; irregular, lumpy shape with multiple minor valleys — tests robustness on messy real data. | ✅ done |
| 7 | `fixture-7` | Thin / low-liquidity | Taper-edge (sparse) | Short session, low total volume, jagged bars. Stress-tests the detector against noise — confirm it still has enough ticks for a few labels. | ✅ done |
| 8 | `fixture-8` | Trend / elongated (down leg) or P/b single-tail | Taper-edge | Second taper-edge example, opposite direction (or a one-sided P/b tail) so taper-edge isn't represented by only one fixture. | ✅ done |

**Priority order:** 3 → 4 → 5 → 6 → 7 → 8
(taper-edge existence, clean bell, clean valley first; then composite, thin, second taper-edge).

## Train / holdout split

- **Train (5):** `fixture-1`, `fixture-2`, `fixture-3` (trend-up), `fixture-4` (bell), `fixture-5` (double-dist)
- **Holdout (3):** `fixture-6` (composite), `fixture-7` (thin), `fixture-8` (trend-down / P-shape)

Both types land on both sides: taper-edge in train (`fixture-3`) and holdout (`fixture-7`, `fixture-8`);
valley in train (`fixture-2`, `fixture-5`) and holdout (`fixture-6`).

## Per-fixture files

Each fixture needs three files:
- `fixture-N.vbp.md` — exported profile (Metadata, Summary, `Price,Volume` CSV)
- `fixture-N.labels.json` — `{ "lvn": [...prices], "hvn": [...prices] }`
- `fixture-N.image.png` — chart screenshot for reference

Label prices must snap to actual bin prices present in the profile's CSV.

## Manifest + loader

- `manifest.json` is the **authoritative** train/holdout designation (plus shape and primary
  LVN type) consumed by the feat-014 eval harness — do not rely on the prose split above.
- `lib/engine/loadLvnFixtures.ts` parses each fixture, joins its labels, and **validates** that
  every label is in range and on-bin. `loadLvnFixtures({ strict: true })` throws on any
  out-of-range / off-bin label. Covered by `loadLvnFixtures.test.ts`.
