#!/usr/bin/env node
// Pull Dominator 2.0 print positions out of single-colour chart screenshots.
//
// Usage (from the repo root, so `sharp` resolves from node_modules):
//   node docs/jba-research/dominator-calibration/extract-prints.mjs > docs/jba-research/dominator-calibration/prints.csv
//
// One screenshot per setting, each with every other setting hidden, same chart / same zoom.
// Edit SETTINGS, AXIS and SESSIONS below whenever the screenshots change: the price axis and the
// session boundaries are read off the chart by hand (the x-axis is volume bars, so x is NOT
// linear in time — no time-of-day is derived here; that comes from a Sierra export later).
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = [
  { key: 'white',   label: '7250v 60min', file: '2026-09-05-white-7250v-60min.png',   test: (r, g, b) => r > 235 && g > 235 && b > 235 },
  { key: 'magenta', label: '7250v 30min', file: '2026-09-05-magenta-7250v-30min.png', test: (r, g, b) => r > 200 && b > 200 && g < 90 },
  { key: 'cyan',    label: '6750v 30min', file: '2026-09-05-cyan-6750v-30min.png',    test: (r, g, b) => g > 200 && b > 200 && r < 90 },
  { key: 'yellow',  label: '5250v 60min', file: '2026-09-05-yellow-5250v-60min.png',  test: (r, g, b) => r > 200 && g > 200 && b < 90 },
  { key: 'red',     label: '4500v 60min', file: '2026-09-05-red-4500v-60min.png',     test: (r, g, b) => r > 200 && g < 110 && b < 110 },
];
// Two price-axis labels read off the screenshot: [pixel y, price].
const AXIS = { top: [15, 29820], bottom: [1197, 28920] };
// x pixel where each session's bars start (the date label on the x-axis). ±5 px.
const SESSIONS = [
  ['2026-08-20', 0], ['2026-08-21', 88], ['2026-08-22', 250], ['2026-08-25', 412], ['2026-08-26', 575],
  ['2026-08-27', 738], ['2026-08-28', 900], ['2026-08-31', 1063], ['2026-09-01', 1218], ['2026-09-02', 1388],
  ['2026-09-03', 1551], ['2026-09-04', 1713], ['2026-09-05', 1877],
];
const MIN_BLOB = 6;   // pixels; smaller is anti-aliasing noise
const MAX_BLOB = 500; // larger is chart furniture (scrollbar, price box)
const RIGHT_MARGIN = 60; // px of price scale to ignore
const BOTTOM_MARGIN = 30; // px of time scale to ignore

const pxPerPt = (AXIS.bottom[0] - AXIS.top[0]) / (AXIS.top[1] - AXIS.bottom[1]);
const priceAt = (y) => Math.round((AXIS.top[1] - (y - AXIS.top[0]) / pxPerPt) / 5) * 5;
const dateAt = (x) => SESSIONS.reduce((d, [s, x0]) => (x >= x0 ? s : d), SESSIONS[0][0]);

const blobsOf = (hit, width, height) => {
  const seen = new Uint8Array(width * height);
  const blobs = [];
  for (let k = 0; k < width * height; k++) {
    if (!hit[k] || seen[k]) continue;
    const stack = [k];
    seen[k] = 1;
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const c = stack.pop();
      const cy = Math.floor(c / width), cx = c % width;
      n++; sx += cx; sy += cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nk = ny * width + nx;
        if (hit[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
      }
    }
    if (n >= MIN_BLOB && n < MAX_BLOB) blobs.push({ x: Math.round(sx / n), y: Math.round(sy / n), px: n });
  }
  return blobs;
};

const main = async () => {
  const rows = [];
  for (const s of SETTINGS) {
    const { data, info } = await sharp(path.join(DIR, s.file)).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const hit = new Uint8Array(width * height);
    for (let y = 0; y < height - BOTTOM_MARGIN; y++) {
      for (let x = 0; x < width - RIGHT_MARGIN; x++) {
        const i = (y * width + x) * channels;
        if (s.test(data[i], data[i + 1], data[i + 2])) hit[y * width + x] = 1;
      }
    }
    for (const b of blobsOf(hit, width, height)) {
      rows.push({ setting: s.key, label: s.label, date: dateAt(b.x), price: priceAt(b.y), x: b.x, y: b.y });
    }
  }
  rows.sort((a, b) => a.x - b.x || a.y - b.y);
  process.stdout.write('setting,label,date,price,x,y\n');
  for (const r of rows) process.stdout.write(`${r.setting},${r.label},${r.date},${r.price},${r.x},${r.y}\n`);
};

main().catch((err) => { process.stderr.write(`extract-prints failed: ${err.message}\n`); process.exit(1); });
