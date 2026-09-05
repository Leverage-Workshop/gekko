#!/usr/bin/env node
// Score Dominator 2.0 prints from the hidden volume-bar (DND) chart exports, one file per setting.
//
// Usage (from the repo root):
//   node docs/jba-research/dominator-calibration/score-dnd.mjs
//
// Each file is a Sierra "Write Bar and Study Data To File" export of a DND chart over the full
// Globex session: volume bars with their start time, OHLCV, and one "Buy Aggression, Sell
// Aggression" pair. A print is a non-zero price. The study re-prints on consecutive bars while the
// anomaly holds, so consecutive same-side print bars are grouped into one EVENT. The scoring
// reference is the close of a bar taken at that bar's end (the next bar's start), which is the
// latest moment the print is certainly known. Windows are wall-clock minutes and never cross the
// 16:00-17:00 CST halt. Writes events.csv next to this script and prints the tables to stdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILES = {
  '7250v60': '7250 Volume 60 Min.txt',
  '7250v30': '7250 Volume 30 Min.txt',
  '6750v30': '6750 Volume 30 Min.txt',
  '5250v60': '5250 Volume 60 Min.txt',
  '4500v60': '4500 Volume 60 Min.txt',
};
const SETTINGS = Object.keys(FILES);
// Clock buckets, minutes from midnight CST. Globex runs 17:00 to 08:30 the next morning.
const BUCKETS = {
  day: (t) => t >= 510 && t < 840, // 08:30 .. 14:00, cash hours
  afternoon: (t) => t >= 840 && t < 960, // 14:00 .. 16:00
  asia: (t) => t >= 1020 || t < 120, // 17:00 .. 02:00
  europe: (t) => t >= 120 && t < 510, // 02:00 .. 08:30
};
const OPEN_END = 540; // 09:00
const HALT = [960, 1020]; // 16:00 .. 17:00: a bar that starts before it and whose successor starts after it spans the halt
const COINCIDE_MIN = 10;
const WINDOWS = [30, 60, 120];

const parseFile = (file) =>
  fs
    .readFileSync(path.join(DIR, 'data', file), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const c = line.split(',').map((s) => s.trim());
      const [y, m, d] = c[0].split('-').map(Number);
      const [hh, mm, ss] = c[1].split(':');
      const t = Number(hh) * 60 + Number(mm) + parseFloat(ss) / 60;
      const abs = Date.UTC(y, m - 1, d) / 60000 + t; // minutes, treating chart time as if UTC
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const trading = t >= HALT[1] ? new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) : date;
      return { date, trading, time: c[1].slice(0, 8), t, abs, o: +c[2], h: +c[3], l: +c[4], c: +c[5], v: +c[6], buy: +c[13], sell: +c[14] };
    });

const withEnds = (bars) =>
  bars.map((b, i) => {
    const n = bars[i + 1];
    if (!n) return { ...b, end: null, halt: true };
    const halt = b.t < HALT[0] && (n.t >= HALT[1] || n.abs - b.abs > HALT[1] - b.t);
    return { ...b, end: n.abs, halt };
  });

const eventsOf = (s, bars) => {
  const events = [];
  for (const side of ['buy', 'sell']) {
    let run = null;
    bars.forEach((b, i) => {
      const continues = run && run.last === i - 1 && !bars[run.last].halt;
      if (b[side] && continues) {
        run = { ...run, last: i, bars: run.bars + 1 };
      } else if (b[side]) {
        if (run) events.push(run);
        run = { s, side, first: i, last: i, bars: 1, date: b.date, trading: b.trading, time: b.time, t: b.t, abs: b.abs, px: b[side] };
      } else if (run) {
        events.push(run);
        run = null;
      }
    });
    if (run) events.push(run);
  }
  return events.sort((a, b) => a.first - b.first);
};

const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : NaN;
};
const pad = (v, n) => String(v).padStart(n);

const data = Object.fromEntries(SETTINGS.map((s) => [s, withEnds(parseFile(FILES[s]))]));
const events = Object.fromEntries(SETTINGS.map((s) => [s, eventsOf(s, data[s])]));
const sessions = [...new Set(data[SETTINGS[0]].map((b) => b.trading))].sort();
const inBucket = (name) => (e) => BUCKETS[name](e.t);

// --- events.csv --------------------------------------------------------------------------------
const clock = (abs) => {
  const m = ((abs % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
};
const csv = ['setting,side,date,trading_session,first_bar_start_cst,first_bar_end_cst,print_price,run_bars,first_bar_close,bucket'];
for (const s of SETTINGS) {
  for (const e of events[s]) {
    const bucket = Object.keys(BUCKETS).find((k) => BUCKETS[k](e.t)) ?? 'halt';
    const end = data[s][e.first].end;
    csv.push([s, e.side, e.date, e.trading, e.time, end === null ? '' : clock(end), e.px, e.bars, data[s][e.first].c, bucket].join(','));
  }
}
fs.writeFileSync(path.join(DIR, 'events.csv'), `${csv.join('\n')}\n`);

console.log(`${sessions.length} trading sessions ${sessions[0]}..${sessions.at(-1)}`);
console.log('bars per clock bucket per setting: ' + SETTINGS.map((s) => `${s} ${Object.keys(BUCKETS).map((k) => `${k}=${data[s].filter((b) => BUCKETS[k](b.t)).length}`).join(' ')}`).join(' | '));

// --- counts per bucket -----------------------------------------------------------------------------
console.log('\nevents per bucket, with buy/sell, per session, longest gap in sessions, sessions with none');
console.log('setting   bucket       n   buy sell  per-sess  gap  none');
for (const s of SETTINGS) {
  for (const k of Object.keys(BUCKETS)) {
    const r = events[s].filter(inBucket(k));
    const per = sessions.map((d) => r.filter((e) => e.trading === d).length);
    const gap = per.reduce(({ max, cur }, n) => (n ? { max, cur: 0 } : { max: Math.max(max, cur + 1), cur: cur + 1 }), { max: 0, cur: 0 }).max;
    const buy = r.filter((e) => e.side === 'buy').length;
    console.log(`${s.padEnd(8)}  ${k.padEnd(10)} ${pad(r.length, 4)} ${pad(buy, 5)} ${pad(r.length - buy, 4)}  ${pad((r.length / sessions.length).toFixed(2), 8)} ${pad(gap, 4)} ${pad(per.filter((n) => !n).length, 5)}`);
  }
}

// --- excursion and extension profile ---------------------------------------------------------------
const walk = (bars, i, W) => {
  const b = bars[i];
  if (b.end === null || b.halt) return null;
  const tEnd = b.end + W;
  const seen = [];
  for (let j = i + 1; j < bars.length; j++) {
    const x = bars[j];
    if (x.abs >= tEnd) return { ref: b.c, refEnd: b.end, seen };
    seen.push(x);
    if (x.halt) return null;
  }
  return null;
};
const excursion = (bars, i, side, W) => {
  const w = walk(bars, i, W);
  if (!w || !w.seen.length) return null;
  const dir = side === 'buy' ? 1 : -1;
  const mfe = Math.max(0, ...w.seen.map((x) => (dir === 1 ? x.h - w.ref : w.ref - x.l)));
  const mae = Math.max(0, ...w.seen.map((x) => (dir === 1 ? w.ref - x.l : x.h - w.ref)));
  return { mfe, mae, net: dir * (w.seen.at(-1).c - w.ref) };
};
const extensionProfile = (bars, i, side, W) => {
  const w = walk(bars, i, W);
  if (!w || !w.seen.length) return null;
  const dir = side === 'buy' ? 1 : -1;
  let ext = 0;
  let extAt = w.refEnd;
  let extIdx = -1;
  w.seen.forEach((x, k) => {
    const move = dir === 1 ? x.h - w.ref : w.ref - x.l;
    if (move > ext) { ext = move; extAt = x.abs; extIdx = k; }
  });
  const extreme = w.ref + dir * ext;
  const back = Math.max(0, ...w.seen.slice(extIdx + 1).map((x) => (dir === 1 ? extreme - x.l : x.h - extreme)));
  return { ext, minutes: extAt - w.refEnd, back };
};

const scoreLine = (label, items, W, bar = 'first') => {
  const xs = items.map((e) => excursion(data[e.s], bar === 'last' ? e.last : e.first, e.side, W)).filter(Boolean);
  if (!xs.length) return `${label.padEnd(20)} ${pad(W, 3)}    0`;
  const mfe = median(xs.map((x) => x.mfe));
  const mae = median(xs.map((x) => x.mae));
  const win = xs.filter((x) => x.net > 0).length;
  return `${label.padEnd(20)} ${pad(W, 3)} ${pad(xs.length, 4)}  ${pad(mfe.toFixed(1), 6)} ${pad(mae.toFixed(1), 6)} ${pad((mfe / mae).toFixed(2), 5)}  ${pad(win, 4)} ${pad(`${((100 * win) / xs.length).toFixed(0)}%`, 4)}`;
};
const profileLine = (label, items, W, bar = 'first') => {
  const xs = items.map((e) => extensionProfile(data[e.s], bar === 'last' ? e.last : e.first, e.side, W)).filter(Boolean);
  if (!xs.length) return `${label.padEnd(20)} ${pad(W, 3)}    0`;
  return `${label.padEnd(20)} ${pad(W, 3)} ${pad(xs.length, 4)}  ${pad(median(xs.map((x) => x.ext)).toFixed(1), 6)} ${pad(median(xs.map((x) => x.minutes)).toFixed(0), 6)} ${pad(median(xs.map((x) => x.back)).toFixed(1), 7)}  ${pad(xs.filter((x) => x.back >= x.ext).length, 8)} ${pad(`${((100 * xs.filter((x) => x.back >= x.ext).length) / xs.length).toFixed(0)}%`, 4)}`;
};
const SCORE_HDR = 'setting              min    n  medMFE medMAE ratio   win  win%';
const PROFILE_HDR = 'setting              min    n  medExt medMin medBack  roundtrip';

for (const k of Object.keys(BUCKETS)) {
  console.log(`\n=== ${k.toUpperCase()} ===`);
  console.log(`continuation from the first bar's close at its end\n${SCORE_HDR}`);
  for (const s of SETTINGS) for (const W of WINDOWS) console.log(scoreLine(s, events[s].filter(inBucket(k)), W));
  for (const s of SETTINGS) {
    const base = data[s].flatMap((b, i) => (BUCKETS[k](b.t) ? ['buy', 'sell'].map((side) => ({ s, first: i, last: i, side })) : []));
    console.log(scoreLine(`BASE ${s}`, base, 60));
  }
  console.log(`\nextension then reversal, 60 min: how far the push continues, when it peaks, how far it comes back, how often all the way\n${PROFILE_HDR}`);
  for (const s of SETTINGS) {
    const r = events[s].filter(inBucket(k));
    console.log(profileLine(`${s} first`, r, 60));
    console.log(profileLine(`${s} last`, r, 60, 'last'));
    const multi = r.filter((e) => e.bars > 1);
    console.log(profileLine(`${s} last 2+bars`, multi, 60, 'last'));
  }
}

// --- day-session splits ----------------------------------------------------------------------------
console.log(`\n=== DAY splits, 60 min, first-bar ref ===\n${SCORE_HDR}`);
for (const s of SETTINGS) {
  const r = events[s].filter(inBucket('day'));
  console.log(scoreLine(`${s} open<09:00`, r.filter((e) => e.t < OPEN_END), 60));
  console.log(scoreLine(`${s} rest`, r.filter((e) => e.t >= OPEN_END), 60));
  console.log(scoreLine(`${s} buy`, r.filter((e) => e.side === 'buy'), 60));
  console.log(scoreLine(`${s} sell`, r.filter((e) => e.side === 'sell'), 60));
  console.log(scoreLine(`${s} Jul`, r.filter((e) => e.trading < '2026-08-01'), 60));
  console.log(scoreLine(`${s} Aug+`, r.filter((e) => e.trading >= '2026-08-01'), 60));
}
console.log('\nrun lengths, day: 1 bar / 2 / 3+, median multi-bar run duration');
for (const s of SETTINGS) {
  const r = events[s].filter(inBucket('day'));
  const multi = r.filter((e) => e.bars > 1 && data[s][e.last].end !== null);
  console.log(`${s.padEnd(8)} ${pad(r.filter((e) => e.bars === 1).length, 4)} ${pad(r.filter((e) => e.bars === 2).length, 4)} ${pad(r.filter((e) => e.bars >= 3).length, 4)}   ${pad(median(multi.map((e) => data[s][e.last].end - e.abs)).toFixed(0), 4)} min`);
}

// --- agreement between settings, day and globex ------------------------------------------------------
const agrees = (e, other) => events[other].some((f) => f.side === e.side && Math.abs(f.abs - e.abs) <= COINCIDE_MIN);
for (const k of ['day', 'asia', 'europe']) {
  console.log(`\n=== ${k.toUpperCase()} agreement: events of A with a same-side event of B within ${COINCIDE_MIN} min ===`);
  console.log(`${''.padEnd(8)}${SETTINGS.map((s) => pad(s, 9)).join('')}   of`);
  for (const a of SETTINGS) {
    const r = events[a].filter(inBucket(k));
    console.log(`${a.padEnd(8)}${SETTINGS.map((b) => (a === b ? pad('-', 9) : pad(r.filter((e) => agrees(e, b)).length, 9))).join('')}  ${pad(r.length, 4)}`);
  }
  console.log(`by number of OTHER settings agreeing, 60 min\n${SCORE_HDR}`);
  for (const s of SETTINGS) {
    const others = SETTINGS.filter((x) => x !== s);
    const tagged = events[s].filter(inBucket(k)).map((e) => ({ e, n: others.filter((o) => agrees(e, o)).length }));
    console.log(scoreLine(`${s} solo`, tagged.filter((x) => x.n === 0).map((x) => x.e), 60));
    console.log(scoreLine(`${s} +1`, tagged.filter((x) => x.n === 1).map((x) => x.e), 60));
    console.log(scoreLine(`${s} +2..4`, tagged.filter((x) => x.n >= 2).map((x) => x.e), 60));
  }
}
