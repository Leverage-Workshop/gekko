#!/usr/bin/env python3
"""
feat-102 empirical control: does SWING-LEVEL HTF cumulative-delta divergence beat
the unconditional base rate?

Definitions are ported from the codebase, not invented:
  lib/engine/htfStructure.ts  SWING_PIVOT_STRENGTH = 5, strict fractal pivot
  lib/engine/barFlow.ts       FRESH_FRACTION = 1/3, DELTA_TREND_EPSILON = 50,
                              PRICE_EPSILON = 0.25, and detectDivergence()'s
                              bearish/bullish/null logic
  lib/engine/parseHtfBars.ts  delta = AskVolume - BidVolume

CRITICAL: forward outcomes are measured from the CONFIRMATION bar (pivot index +
SWING_PIVOT_STRENGTH), never the pivot bar. A strength-5 fractal is not knowable
until 5 bars after the pivot; measuring from the pivot is lookahead bias.

Pure stdlib (no numpy/scipy in this environment).
"""
import csv, os, math, random, statistics, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- ported constants -------------------------------------------------------
SWING_PIVOT_STRENGTH = 5      # htfStructure.ts
ATR_PERIOD_BARS = 14          # htfStructure.ts (Wilder, 14 x 30-min)
FRESH_FRACTION = 1.0 / 3.0    # barFlow.ts
DELTA_TREND_EPSILON = 50      # barFlow.ts (contracts; calibrated on 750-vol bars)
PRICE_EPSILON = 0.25          # barFlow.ts / htfStructure.ts (one NQ tick)

HORIZONS = [4, 8, 16, 34]     # ~2h / 4h / 8h / ~1 trading day of 30-min bars
BARFLOW_WINDOWS = [20, 34, 68]  # literal barFlow window, ~1 day, ~2 days

random.seed(20260812)


# ---- data -------------------------------------------------------------------
class Bar:
    __slots__ = ('dt', 'o', 'h', 'l', 'c', 'v', 'bid', 'ask', 'delta')

    def __init__(self, row):
        self.dt = datetime.strptime(row[0].strip(), '%Y-%m-%d %H:%M:%S')
        self.o, self.h, self.l, self.c = (float(x) for x in row[1:5])
        self.v, self.bid, self.ask = (float(x) for x in row[5:8])
        self.delta = self.ask - self.bid


def load_bars(path, drop_last=True):
    with open(path) as fh:
        rdr = csv.reader(fh)
        head = next(rdr)
        assert head == ['DateTime', 'Open', 'High', 'Low', 'Close', 'Volume',
                        'BidVolume', 'AskVolume'], head
        bars = [Bar(r) for r in rdr if r and r[0].strip()]
    for i in range(1, len(bars)):
        assert bars[i].dt > bars[i - 1].dt, 'not chronological'
    if drop_last:
        bars = bars[:-1]   # newest export's last row is the in-progress bar
    return bars


# ---- engine analogues -------------------------------------------------------
def cumulative_delta(bars):
    out, run = [], 0.0
    for b in bars:
        run += b.delta
        out.append(run)
    return out


def find_pivots(bars, side, strength=SWING_PIVOT_STRENGTH):
    """Exact port of htfStructure.findPivots — STRICTLY exceeded on both sides."""
    pivots = []
    for i in range(strength, len(bars) - strength):
        v = bars[i].h if side == 'high' else bars[i].l
        ok = True
        for k in range(i - strength, i + strength + 1):
            if k == i:
                continue
            other = bars[k].h if side == 'high' else bars[k].l
            if (other >= v) if side == 'high' else (other <= v):
                ok = False
                break
        if ok:
            pivots.append(i)
    return pivots


def rolling_atr(bars, period=ATR_PERIOD_BARS):
    """Wilder ATR as of each bar index (trailing only — no lookahead)."""
    atr = [None] * len(bars)
    trs = []
    for i in range(1, len(bars)):
        pc = bars[i - 1].c
        trs.append(max(bars[i].h - bars[i].l, abs(bars[i].h - pc), abs(bars[i].l - pc)))
        if len(trs) == period:
            a = sum(trs) / period
            atr[i] = a
        elif len(trs) > period:
            a = (atr[i - 1] * (period - 1) + trs[-1]) / period
            atr[i] = a
    return atr


def divergence_barflow(bars, cum, p, side, window, eps):
    """
    barFlow.detectDivergence ported to a window of `window` bars ENDING at the
    pivot bar p. prior = first 2/3, fresh = last 1/3 (FRESH_FRACTION), fresh
    extreme located exactly as barFlow does (last occurrence). Returns True when
    the pivot carries the divergence for its side.
    """
    start = p - window + 1
    if start < 0:
        return None
    win = list(range(start, p + 1))
    n = len(win)
    fresh_start = max(1, n - max(1, int(n * FRESH_FRACTION)))
    prior = win[:fresh_start]
    fresh = win[fresh_start:]
    if not prior or not fresh:
        return None

    prior_high = max(bars[i].h for i in prior)
    prior_low = min(bars[i].l for i in prior)
    prior_max_cd = max(cum[i] for i in prior)
    prior_min_cd = min(cum[i] for i in prior)

    fh_idx = fresh[0]
    fl_idx = fresh[0]
    for i in fresh:
        if bars[i].h >= bars[fh_idx].h:
            fh_idx = i
        if bars[i].l <= bars[fl_idx].l:
            fl_idx = i

    bearish = (bars[fh_idx].h > prior_high + PRICE_EPSILON and
               cum[fh_idx] < prior_max_cd - eps)
    bullish = (bars[fl_idx].l < prior_low - PRICE_EPSILON and
               cum[fl_idx] > prior_min_cd + eps)
    if bearish == bullish:
        return False      # neither, or both (chop) — barFlow returns null
    got = 'bearish' if bearish else 'bullish'
    want = 'bearish' if side == 'high' else 'bullish'
    if got != want:
        return False
    # the divergence must be AT this pivot, not at some other bar in the window
    return (fh_idx == p) if side == 'high' else (fl_idx == p)


def divergence_swing_to_swing(bars, cum, p, prev_p, side, eps):
    """
    The literal 'swing-level' reading: this confirmed swing makes a fresh price
    extreme vs the PRIOR confirmed swing of the same side, but cumulative delta
    does not confirm it.
    """
    if prev_p is None:
        return None
    if side == 'high':
        fresh = bars[p].h > bars[prev_p].h + PRICE_EPSILON
        failed = cum[p] < cum[prev_p] - eps
    else:
        fresh = bars[p].l < bars[prev_p].l - PRICE_EPSILON
        failed = cum[p] > cum[prev_p] + eps
    if not fresh:
        return None       # not a fresh extreme — event is not applicable at all
    return bool(failed)


# ---- statistics (stdlib) ----------------------------------------------------
def binom_cdf(k, n, p):
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k + 1))


def binom_two_sided_p(k, n, p):
    """Exact two-sided binomial test (method of small p-values)."""
    if n == 0:
        return float('nan')
    obs = math.comb(n, k) * p ** k * (1 - p) ** (n - k)
    tot = 0.0
    for i in range(n + 1):
        pi = math.comb(n, i) * p ** i * (1 - p) ** (n - i)
        if pi <= obs * (1 + 1e-9):
            tot += pi
    return min(1.0, tot)


def wilson_ci(k, n, z=1.96):
    if n == 0:
        return (float('nan'), float('nan'))
    ph = k / n
    d = 1 + z * z / n
    c = ph + z * z / (2 * n)
    s = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))
    return ((c - s) / d, (c + s) / d)


def perm_mean_diff_p(a, b, iters=20000):
    """Two-sided permutation test on the difference of means."""
    if not a or not b:
        return float('nan')
    obs = abs(statistics.fmean(a) - statistics.fmean(b))
    pool = list(a) + list(b)
    na = len(a)
    hits = 0
    for _ in range(iters):
        random.shuffle(pool)
        d = abs(statistics.fmean(pool[:na]) - statistics.fmean(pool[na:]))
        if d >= obs - 1e-12:
            hits += 1
    return (hits + 1) / (iters + 1)


def min_detectable_lift(n, base, power=0.80, alpha=0.05):
    """Smallest absolute lift over `base` detectable at n (normal approx)."""
    if n <= 0:
        return float('nan')
    za, zb = 1.959964, 0.841621
    lo, hi = 0.0, 1.0 - base
    for _ in range(200):
        mid = (lo + hi) / 2
        p1 = base + mid
        se0 = math.sqrt(base * (1 - base) / n)
        se1 = math.sqrt(p1 * (1 - p1) / n) if 0 < p1 < 1 else 1e-9
        if mid >= (za * se0 + zb * se1):
            hi = mid
        else:
            lo = mid
    return hi


# ---- study ------------------------------------------------------------------
def signal_return(bars, c, h, side):
    """Points the DIVERGENCE THESIS earned: fade direction, from confirmation."""
    if c + h >= len(bars):
        return None
    fwd = bars[c + h].c - bars[c].c
    return -fwd if side == 'high' else fwd


def unconditional(bars, h, side):
    """Control: same signed 'fade' return taken at EVERY bar."""
    out = []
    for i in range(len(bars) - h):
        fwd = bars[i + h].c - bars[i].c
        out.append(-fwd if side == 'high' else fwd)
    return out


def summarize(vals):
    if not vals:
        return dict(n=0, win=float('nan'), mean=float('nan'), median=float('nan'))
    wins = sum(1 for v in vals if v > 0)
    return dict(n=len(vals), wins=wins, win=wins / len(vals),
                mean=statistics.fmean(vals), median=statistics.median(vals))


def fmt_pct(x):
    return 'n/a' if x != x else f'{100*x:5.1f}%'


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'union.csv')
    bars = load_bars(path)
    cum = cumulative_delta(bars)
    atr = rolling_atr(bars)

    med_vol = statistics.median(b.v for b in bars)
    med_absdelta = statistics.median(abs(b.delta) for b in bars)
    atr_vals = [a for a in atr if a]
    med_atr = statistics.median(atr_vals)

    print('=' * 78)
    print('DATASET')
    print('=' * 78)
    print(f'file            : {path}')
    print(f'bars            : {len(bars)}  (in-progress final bar dropped)')
    print(f'range           : {bars[0].dt} .. {bars[-1].dt}')
    days = len({b.dt.date() for b in bars})
    print(f'calendar days   : {days}')
    print(f'median bar vol  : {med_vol:.0f} contracts   median |delta|: {med_absdelta:.0f}')
    print(f'30-min Wilder ATR(14): median {med_atr:.1f} pts  '
          f'(p10 {statistics.quantiles(atr_vals, n=10)[0]:.1f} / '
          f'p90 {statistics.quantiles(atr_vals, n=10)[8]:.1f})')
    print(f'cumulative delta over whole series: {cum[-1]:+,.0f} contracts')
    print()

    highs = find_pivots(bars, 'high')
    lows = find_pivots(bars, 'low')
    print(f'confirmed swing highs: {len(highs)}   confirmed swing lows: {len(lows)}'
          f'   (SWING_PIVOT_STRENGTH={SWING_PIVOT_STRENGTH}, strict)')
    print()

    # epsilon variants: the literal ported constant, and one scaled to HTF bar size
    scaled_eps = DELTA_TREND_EPSILON / 750.0 * med_vol
    eps_variants = [('literal barFlow eps=50', DELTA_TREND_EPSILON),
                    (f'volume-scaled eps={scaled_eps:.0f}', scaled_eps)]

    # ---------- unconditional controls ----------
    print('=' * 78)
    print('CONTROL — UNCONDITIONAL BASE RATE (every bar in the series)')
    print('=' * 78)
    print(f'{"h":>4} {"n":>6} | {"P(down) [short side]":>22} | {"P(up) [long side]":>19} | '
          f'{"mean |move| pts":>15}')
    base = {}
    for h in HORIZONS:
        us = unconditional(bars, h, 'high')   # -fwd  -> win == price fell
        ul = unconditional(bars, h, 'low')    # +fwd  -> win == price rose
        ss, sl = summarize(us), summarize(ul)
        base[h] = {'high': ss, 'low': sl}
        movs = statistics.fmean(abs(bars[i + h].c - bars[i].c) for i in range(len(bars) - h))
        print(f'{h:>4} {ss["n"]:>6} | {fmt_pct(ss["win"]):>22} | {fmt_pct(sl["win"]):>19} | '
              f'{movs:>15.1f}')
    print()

    # ---------- control: all confirmed swings (pivot conditioning, no delta) ----------
    print('=' * 78)
    print('CONTROL — ALL CONFIRMED SWINGS (isolates pivot conditioning from delta)')
    print('=' * 78)
    swing_all = {}
    for side, piv in (('high', highs), ('low', lows)):
        for h in HORIZONS:
            vals = [v for p in piv
                    for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                    if v is not None]
            swing_all[(side, h)] = summarize(vals)
    print(f'{"side":>5} {"h":>4} {"n":>5} {"fade win%":>10} {"vs uncond":>10} '
          f'{"mean pts":>9} {"mean ATR":>9}')
    for side in ('high', 'low'):
        for h in HORIZONS:
            s = swing_all[(side, h)]
            d = s['win'] - base[h][side]['win']
            print(f'{side:>5} {h:>4} {s["n"]:>5} {fmt_pct(s["win"]):>10} '
                  f'{d*100:>+9.1f}pp {s["mean"]:>9.1f} {s["mean"]/med_atr:>9.2f}')
    print()

    # =====================================================================
    # DEFINITION A — barFlow window port
    # =====================================================================
    for eps_label, eps in eps_variants:
        for W in BARFLOW_WINDOWS:
            classify = {}
            for side, piv in (('high', highs), ('low', lows)):
                div, non = [], []
                for p in piv:
                    r = divergence_barflow(bars, cum, p, side, W, eps)
                    if r is None:
                        continue
                    (div if r else non).append(p)
                classify[side] = (div, non)
            nd = sum(len(classify[s][0]) for s in classify)
            print('=' * 78)
            print(f'DEFINITION A — barFlow window port | window={W} bars | {eps_label}')
            print('=' * 78)
            print(f'divergent swing highs: {len(classify["high"][0])} of '
                  f'{len(classify["high"][0])+len(classify["high"][1])}   |   '
                  f'divergent swing lows: {len(classify["low"][0])} of '
                  f'{len(classify["low"][0])+len(classify["low"][1])}')
            if nd == 0:
                print('  no divergent swings — nothing to test\n')
                continue
            report_cells(bars, atr, med_atr, classify, base, 'A', W, eps_label)

    # =====================================================================
    # DEFINITION B — swing-to-swing (the literal "swing-level divergence")
    # =====================================================================
    for eps_label, eps in eps_variants:
        classify = {}
        for side, piv in (('high', highs), ('low', lows)):
            div, non = [], []
            for j, p in enumerate(piv):
                prev_p = piv[j - 1] if j > 0 else None
                r = divergence_swing_to_swing(bars, cum, p, prev_p, side, eps)
                if r is None:
                    continue   # not a fresh extreme vs prior swing — not an event
                (div if r else non).append(p)
            classify[side] = (div, non)
        print('=' * 78)
        print(f'DEFINITION B — swing-to-swing fresh extreme | {eps_label}')
        print('=' * 78)
        print(f'fresh-extreme swing highs: '
              f'{len(classify["high"][0])+len(classify["high"][1])} '
              f'(of {len(highs)} confirmed) — divergent {len(classify["high"][0])}, '
              f'confirmed-by-delta {len(classify["high"][1])}')
        print(f'fresh-extreme swing lows : '
              f'{len(classify["low"][0])+len(classify["low"][1])} '
              f'(of {len(lows)} confirmed) — divergent {len(classify["low"][0])}, '
              f'confirmed-by-delta {len(classify["low"][1])}')
        report_cells(bars, atr, med_atr, classify, base, 'B', None, eps_label)

    # ---------- power ----------
    print('=' * 78)
    print('POWER — minimum detectable lift over the unconditional base rate')
    print('=' * 78)
    print(f'{"n":>5} {"base 50%":>10} {"base 55%":>10}')
    for n in (5, 10, 15, 20, 30, 50, 100, 200, 400):
        print(f'{n:>5} {min_detectable_lift(n,0.50)*100:>9.1f}pp '
              f'{min_detectable_lift(n,0.55)*100:>9.1f}pp')
    print()


def report_cells(bars, atr, med_atr, classify, base, tag, W, eps_label):
    print(f'{"side":>5} {"h":>4} | {"DIVERGENT":^34} | {"NON-DIV":^17} | '
          f'{"lift vs":>8} {"lift vs":>8} | {"perm":>6}')
    print(f'{"":>5} {"":>4} | {"n":>4} {"win%":>7} {"pts":>8} {"ATR":>6} {"95% CI":>13} | '
          f'{"n":>4} {"win%":>7} | {"uncond":>8} {"nondiv":>8} | {"p":>6}')
    for side in ('high', 'low'):
        div, non = classify[side]
        for h in HORIZONS:
            dv, dv_atr = [], []
            for p in div:
                c = p + SWING_PIVOT_STRENGTH
                v = signal_return(bars, c, h, side)
                if v is None:
                    continue
                dv.append(v)
                a = atr[c]
                if a:
                    dv_atr.append(v / a)
            nv = []
            for p in non:
                c = p + SWING_PIVOT_STRENGTH
                v = signal_return(bars, c, h, side)
                if v is not None:
                    nv.append(v)
            d, n_ = summarize(dv), summarize(nv)
            if d['n'] == 0:
                continue
            lo, hi = wilson_ci(d['wins'], d['n'])
            lift_u = d['win'] - base[h][side]['win']
            lift_n = d['win'] - n_['win'] if n_['n'] else float('nan')
            pperm = perm_mean_diff_p(dv, nv, iters=5000) if (dv and nv) else float('nan')
            pbin = binom_two_sided_p(d['wins'], d['n'], base[h][side]['win'])
            atr_mean = statistics.fmean(dv_atr) if dv_atr else float('nan')
            print(f'{side:>5} {h:>4} | {d["n"]:>4} {fmt_pct(d["win"]):>7} '
                  f'{d["mean"]:>8.1f} {atr_mean:>6.2f} '
                  f'[{100*lo:>4.0f},{100*hi:>4.0f}]% | '
                  f'{n_["n"]:>4} {fmt_pct(n_["win"]):>7} | '
                  f'{lift_u*100:>+7.1f}pp {lift_n*100:>+7.1f}pp | {pperm:>6.3f}'
                  f'  (binom p={pbin:.3f})')
    print()


if __name__ == '__main__':
    main()
