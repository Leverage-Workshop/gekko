#!/usr/bin/env node
// Score Dominator 2.0 prints from a Sierra "Write Bar and Study Data To File" export.
//
// Usage (from the repo root):
//   node docs/jba-research/dominator-calibration/score-prints.mjs [data/9_5_26.txt]
//
// Expected export: 5-min RTH bars (08:30..13:55 CST), columns Date, Time, OHLC, Volume, ...,
// then one "Buy Aggression, Sell Aggression" pair per Dominator setting, highest volume first.
// A print is a non-zero price in one of those columns. Writes prints.csv next to this script and
// prints the summary tables to stdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = ['7250v60', '7250v30', '6750v30', '5250v60', '4500v60'];
const FIRST_PRINT_COL = 13; // 0-based index of the first Buy Aggression column
const MARKER_OFFSET = 5; // points the point-on-high/low marker sits beyond the bar extreme
const WINDOWS = [6, 12]; // bars after completion: 30 and 60 minutes

const input = path.resolve(process.argv[2] ?? path.join(DIR, 'data', '9_5_26.txt'));
const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const rows = lines.slice(1).map((line) => {
  const c = line.split(',').map((s) => s.trim());
  const [y, m, d] = c[0].split('-').map(Number);
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const prints = SETTINGS.map((s, i) => ({ s, buy: +c[FIRST_PRINT_COL + 2 * i], sell: +c[FIRST_PRINT_COL + 2 * i + 1] }));
  return { date, time: c[1].slice(0, 5), o: +c[2], h: +c[3], l: +c[4], c: +c[5], v: +c[6], prints };
});
const dates = [...new Set(rows.map((r) => r.date))];
const prints = rows.flatMap((r, idx) =>
  r.prints.flatMap((p) => [
    ...(p.buy ? [{ idx, date: r.date, time: r.time, s: p.s, side: 'buy', px: p.buy }] : []),
    ...(p.sell ? [{ idx, date: r.date, time: r.time, s: p.s, side: 'sell', px: p.sell }] : []),
  ]),
);
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  if (!b.length) return NaN;
  const mid = Math.floor(b.length / 2);
  return b.length % 2 ? b[mid] : (b[mid - 1] + b[mid]) / 2;
};
const pad = (v, n) => String(v).padStart(n);

// --- print list -------------------------------------------------------------------------------
const csv = ['date,time_cst,setting,side,print_price,bar_open,bar_high,bar_low,bar_close,bar_volume'];
for (const p of prints) {
  const r = rows[p.idx];
  csv.push([p.date, p.time, p.s, p.side, p.px, r.o, r.h, r.l, r.c, r.v].join(','));
}
fs.writeFileSync(path.join(DIR, 'prints.csv'), `${csv.join('\n')}\n`);

console.log(`${rows.length} bars, ${dates.length} sessions ${dates[0]}..${dates.at(-1)}, ${prints.length} prints`);

// --- counts -----------------------------------------------------------------------------------
console.log('\nsetting   total  buy sell  per-session  max-gap');
for (const s of SETTINGS) {
  const ps = prints.filter((p) => p.s === s);
  const per = dates.map((d) => ps.filter((p) => p.date === d).length);
  const gap = per.reduce(({ max, cur }, n) => (n ? { max, cur: 0 } : { max: Math.max(max, cur + 1), cur: cur + 1 }), { max: 0, cur: 0 }).max;
  const buy = ps.filter((p) => p.side === 'buy').length;
  console.log(`${s.padEnd(8)} ${pad(ps.length, 5)} ${pad(buy, 4)} ${pad(ps.length - buy, 4)}  ${pad((ps.length / dates.length).toFixed(2), 11)}  ${pad(gap, 7)}`);
}

// --- same-bar, same-side coincidence ----------------------------------------------------------
console.log('\nsame bar + same side coincidences');
console.log(`${''.padEnd(8)}${SETTINGS.map((s) => pad(s, 9)).join('')}`);
for (let i = 0; i < SETTINGS.length; i++) {
  const cells = SETTINGS.map((_, j) => {
    if (i === j) return pad('-', 9);
    const n = rows.filter((r) => (r.prints[i].buy && r.prints[j].buy) || (r.prints[i].sell && r.prints[j].sell)).length;
    return pad(n, 9);
  });
  console.log(`${SETTINGS[i].padEnd(8)}${cells.join('')}`);
}

// --- anchor test: does px ∓ offset equal the stamped bar's extreme, or a later bar's? ----------
const anchorOf = (p) => {
  const target = p.side === 'sell' ? p.px - MARKER_OFFSET : p.px + MARKER_OFFSET;
  const hits = [];
  for (let k = p.idx - 12; k <= p.idx + 12; k++) {
    if (k < 0 || k >= rows.length || rows[k].date !== p.date) continue;
    const ext = p.side === 'sell' ? rows[k].h : rows[k].l;
    if (Math.abs(ext - target) < 0.01) hits.push(k - p.idx);
  }
  if (!hits.length) return 'none';
  if (hits.includes(0)) return 'stamped';
  if (hits.every((o) => o > 0)) return 'later';
  if (hits.every((o) => o < 0)) return 'earlier';
  return 'mixed';
};
const anchors = prints.map((p) => ({ ...p, anchor: anchorOf(p) }));
const tally = {};
for (const a of anchors) tally[a.anchor] = (tally[a.anchor] ?? 0) + 1;
console.log(`\nprint price anchors to (px ∓ ${MARKER_OFFSET}): ${JSON.stringify(tally)}`);

// --- excursion after completion -----------------------------------------------------------------
// The stamped bar is where the hidden volume bar STARTED. Use the bar after the latest of the
// stamped bar and the anchor bar as the first bar an entry could have happened on.
const completionOf = (p) => {
  const target = p.side === 'sell' ? p.px - MARKER_OFFSET : p.px + MARKER_OFFSET;
  let k0 = p.idx;
  for (let k = p.idx; k <= p.idx + 12 && k < rows.length && rows[k].date === p.date; k++) {
    const ext = p.side === 'sell' ? rows[k].h : rows[k].l;
    if (Math.abs(ext - target) < 0.01) k0 = k;
  }
  return k0;
};
const excursion = (p, n) => {
  const dir = p.side === 'buy' ? 1 : -1;
  const k0 = completionOf(p);
  const ref = rows[k0].c;
  let mfe = 0;
  let mae = 0;
  let bars = 0;
  for (let k = k0 + 1; k <= k0 + n && k < rows.length && rows[k].date === p.date; k++) {
    bars++;
    mfe = Math.max(mfe, dir === 1 ? rows[k].h - ref : ref - rows[k].l);
    mae = Math.max(mae, dir === 1 ? ref - rows[k].l : rows[k].h - ref);
  }
  return { bars, mfe, mae, net: bars ? dir * (rows[k0 + bars].c - ref) : null };
};
console.log('\nexcursion from the close of the completion bar, full windows only (points)');
console.log('setting   side  min   n  medMFE medMAE ratio  net>0 net<=0');
const report = (label, side, ps) => {
  for (const n of WINDOWS) {
    const xs = ps.map((p) => excursion(p, n)).filter((e) => e.bars === n);
    if (!xs.length) continue;
    const mfe = median(xs.map((e) => e.mfe));
    const mae = median(xs.map((e) => e.mae));
    console.log(`${label.padEnd(8)} ${side.padEnd(5)} ${pad(n * 5, 3)} ${pad(xs.length, 3)}  ${pad(mfe.toFixed(1), 6)} ${pad(mae.toFixed(1), 6)} ${pad((mfe / mae).toFixed(2), 5)}  ${pad(xs.filter((e) => e.net > 0).length, 5)} ${pad(xs.filter((e) => e.net <= 0).length, 6)}`);
  }
};
for (const s of SETTINGS) for (const side of ['buy', 'sell', 'all']) report(s, side, prints.filter((p) => p.s === s && (side === 'all' || p.side === side)));
for (const side of ['buy', 'sell', 'all']) report('ALL', side, prints.filter((p) => side === 'all' || p.side === side));
const baseline = rows.flatMap((r, idx) => ['buy', 'sell'].map((side) => ({ idx, date: r.date, side, px: side === 'sell' ? r.h + MARKER_OFFSET : r.l - MARKER_OFFSET })));
report('BASE', 'all', baseline);
