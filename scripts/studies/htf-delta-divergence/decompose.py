#!/usr/bin/env python3
"""
Third pass — three things the first two passes left open.

A. The mean-points effect must be tested against the UNCONDITIONAL MEAN MOVE,
   not against zero. The tape drifted +2491 pts over the sample, so a "fade"
   return of -87 pts is partly just drift. Bootstraps the DIFFERENCE.

B. 2x2 decomposition: (fresh price extreme? yes/no) x (delta confirmed? yes/no).
   The primary spec's divergent group is fresh-extreme by construction, so the
   Definition-A div-vs-nondiv contrast confounds the two. This separates them.

C. Is multi-day cumulative delta itself a safe narrative fact? Correlation and
   sign-agreement between cumulative delta and price at several scales.
"""
import os, sys, math, random, statistics
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swing_divergence_study import (
    load_bars, cumulative_delta, find_pivots, rolling_atr, divergence_barflow,
    signal_return, unconditional, summarize, SWING_PIVOT_STRENGTH,
    DELTA_TREND_EPSILON, HORIZONS, PRICE_EPSILON, FRESH_FRACTION,
)
from confirm import trading_day

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(20260812)
W, EPS = 20, DELTA_TREND_EPSILON


def fresh_and_delta_flags(bars, cum, p, side, window=W, eps=EPS):
    """Split barFlow's test into its two independent halves at this pivot."""
    start = p - window + 1
    if start < 0:
        return None
    win = list(range(start, p + 1))
    n = len(win)
    fresh_start = max(1, n - max(1, int(n * FRESH_FRACTION)))
    prior = win[:fresh_start]
    if not prior:
        return None
    if side == 'high':
        is_fresh = bars[p].h > max(bars[i].h for i in prior) + PRICE_EPSILON
        delta_failed = cum[p] < max(cum[i] for i in prior) - eps
    else:
        is_fresh = bars[p].l < min(bars[i].l for i in prior) - PRICE_EPSILON
        delta_failed = cum[p] > min(cum[i] for i in prior) + eps
    return is_fresh, delta_failed


def cluster_boot_diff(ev_a, uncond_by_side, iters=6000):
    """
    ev_a: list of (day, side, value). Bootstrap the mean of (value - the
    unconditional mean for that side), resampling DAYS with replacement.
    """
    if not ev_a:
        return (float('nan'),) * 3
    adj = [(d, v - uncond_by_side[s]) for d, s, v in ev_a]
    byday = defaultdict(list)
    for d, v in adj:
        byday[d].append(v)
    days = list(byday)
    out = []
    for _ in range(iters):
        picked = [random.choice(days) for _ in days]
        vals = [v for dd in picked for v in byday[dd]]
        if vals:
            out.append(statistics.fmean(vals))
    out.sort()
    return (statistics.fmean(v for _, v in adj),
            out[int(0.025 * len(out))], out[int(0.975 * len(out))])


def pearson(xs, ys):
    n = len(xs)
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return num / (dx * dy) if dx and dy else float('nan')


def main():
    bars = load_bars(os.path.join(HERE, 'union.csv'))
    cum = cumulative_delta(bars)
    atr = rolling_atr(bars)
    med_atr = statistics.median([a for a in atr if a])
    highs, lows = find_pivots(bars, 'high'), find_pivots(bars, 'low')

    # ------------------------------------------------------------------ A
    print('=' * 78)
    print('A. EFFECT SIZE vs THE UNCONDITIONAL MEAN MOVE (not vs zero)')
    print('=' * 78)
    div = []
    for side, piv in (('high', highs), ('low', lows)):
        for p in piv:
            if divergence_barflow(bars, cum, p, side, W, EPS) is True:
                div.append((side, p))
    print(f'{"h":>4} {"n":>4} {"div mean":>9} {"uncond mean":>12} {"DIFF":>9} '
          f'{"95% CI (day-clustered)":>26} {"DIFF in ATR":>12}')
    for h in HORIZONS:
        um = {s: statistics.fmean(unconditional(bars, h, s)) for s in ('high', 'low')}
        ev = []
        for side, p in div:
            c = p + SWING_PIVOT_STRENGTH
            v = signal_return(bars, c, h, side)
            if v is not None:
                ev.append((trading_day(bars[c].dt), side, v))
        raw = statistics.fmean(v for _, _, v in ev)
        nh = sum(1 for _, s, _ in ev if s == 'high')
        nl = len(ev) - nh
        um_pooled = (nh * um['high'] + nl * um['low']) / len(ev)
        d, lo, hi = cluster_boot_diff(ev, um)
        star = '  <-- CI excludes 0' if (lo > 0) == (hi > 0) else ''
        print(f'{h:>4} {len(ev):>4} {raw:>9.1f} {um_pooled:>12.1f} {d:>9.1f} '
              f'[{lo:>9.1f},{hi:>9.1f}] {d/med_atr:>12.2f}{star}')
    print()
    print('  The unconditional mean is not zero: the sample tape rose '
          f'{bars[-1].c - bars[0].o:+.0f} pts,')
    print('  so a raw negative "fade return" is partly drift. DIFF removes it.')
    print()

    # ------------------------------------------------------------------ B
    print('=' * 78)
    print('B. 2x2 DECOMPOSITION — is it the FRESH EXTREME or the DELTA?')
    print('   (window 20, eps 50; cells pooled across both swing sides)')
    print('=' * 78)
    groups = {('fresh', 'delta-failed'): [], ('fresh', 'delta-confirmed'): [],
              ('no-fresh', 'delta-failed'): [], ('no-fresh', 'delta-confirmed'): []}
    for side, piv in (('high', highs), ('low', lows)):
        for p in piv:
            f = fresh_and_delta_flags(bars, cum, p, side)
            if f is None:
                continue
            is_fresh, failed = f
            k = ('fresh' if is_fresh else 'no-fresh',
                 'delta-failed' if failed else 'delta-confirmed')
            groups[k].append((side, p))
    for k, v in groups.items():
        print(f'  {k[0]:>8} / {k[1]:<16} n = {len(v)}')
    print()
    print(f'{"fresh?":>9} {"delta":>16} | ' +
          ' | '.join(f'h={h:<2} win% / mean pts' for h in HORIZONS))
    for k in [('fresh', 'delta-failed'), ('fresh', 'delta-confirmed'),
              ('no-fresh', 'delta-failed'), ('no-fresh', 'delta-confirmed')]:
        cells = []
        for h in HORIZONS:
            vs = [v for side, p in groups[k]
                  for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                  if v is not None]
            if not vs:
                cells.append('      n/a      ')
                continue
            s = summarize(vs)
            cells.append(f'n={s["n"]:>3} {100*s["win"]:>4.0f}% {s["mean"]:>+7.0f}')
        print(f'{k[0]:>9} {k[1]:>16} | ' + ' | '.join(cells))
    print()
    print('  Read DOWN the two "fresh" rows: that is the delta effect holding the')
    print('  price condition fixed. Read the fresh vs no-fresh gap: that is the')
    print('  price-condition effect holding the delta fixed.')
    print()
    # explicit deltas
    print('  Incremental effect of the DELTA, holding "fresh extreme" fixed:')
    for h in HORIZONS:
        def m(k):
            vs = [v for side, p in groups[k]
                  for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                  if v is not None]
            return summarize(vs)
        a, b = m(('fresh', 'delta-failed')), m(('fresh', 'delta-confirmed'))
        c, d = m(('no-fresh', 'delta-failed')), m(('no-fresh', 'delta-confirmed'))
        print(f'    h={h:<3} fresh:    {100*(a["win"]-b["win"]):>+6.1f}pp  '
              f'{a["mean"]-b["mean"]:>+7.1f} pts   |   '
              f'no-fresh: {100*(c["win"]-d["win"]):>+6.1f}pp  '
              f'{c["mean"]-d["mean"]:>+7.1f} pts')
    print()
    print('  Incremental effect of the FRESH EXTREME, holding delta fixed:')
    for h in HORIZONS:
        def m(k):
            vs = [v for side, p in groups[k]
                  for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                  if v is not None]
            return summarize(vs)
        a, c = m(('fresh', 'delta-failed')), m(('no-fresh', 'delta-failed'))
        b, d = m(('fresh', 'delta-confirmed')), m(('no-fresh', 'delta-confirmed'))
        print(f'    h={h:<3} delta-failed:    {100*(a["win"]-c["win"]):>+6.1f}pp  '
              f'{a["mean"]-c["mean"]:>+7.1f} pts   |   '
              f'delta-confirmed: {100*(b["win"]-d["win"]):>+6.1f}pp  '
              f'{b["mean"]-d["mean"]:>+7.1f} pts')
    print()

    # ------------------------------------------------------------------ C
    print('=' * 78)
    print('C. IS MULTI-DAY CUMULATIVE DELTA ITSELF A SAFE NARRATIVE FACT?')
    print('=' * 78)
    print(f'series price   : {bars[0].o:.2f} -> {bars[-1].c:.2f}  '
          f'({bars[-1].c - bars[0].o:+.0f} pts)')
    print(f'series cum delta: 0 -> {cum[-1]:+,.0f} contracts')
    print(f'-> over {len(bars)} bars / 94 calendar days, price rose strongly while')
    print('   cumulative delta FELL. The two disagree in sign over the whole window.')
    print()
    print(f'{"window":>8} {"n":>6} {"corr(dPrice,dCumDelta)":>24} {"sign agreement":>16}')
    for k in (1, 2, 4, 8, 16, 34, 68, 136):
        dp = [bars[i + k].c - bars[i].c for i in range(len(bars) - k)]
        dd = [cum[i + k] - cum[i] for i in range(len(bars) - k)]
        r = pearson(dp, dd)
        agree = sum(1 for a, b in zip(dp, dd) if (a > 0) == (b > 0)) / len(dp)
        print(f'{k:>8} {len(dp):>6} {r:>24.3f} {100*agree:>15.1f}%')
    print()
    print('  Per-bar delta tracks the same bar\'s price move (contemporaneous, and')
    print('  near-tautological). At multi-day scale the relationship decays; the')
    print('  LEVEL of a multi-day cumulative delta carries an arbitrary starting')
    print('  point and drifted OPPOSITE to price across this sample.')
    print()
    # how often would a naive "cum delta is negative -> bearish" read be wrong?
    daily = defaultdict(float)
    dayclose = {}
    for b in bars:
        d = trading_day(b.dt)
        daily[d] += b.delta
        dayclose[d] = b.c
    days = sorted(daily)
    runsum, series = 0.0, []
    for d in days:
        runsum += daily[d]
        series.append((d, runsum, dayclose[d]))
    wrongsign = sum(1 for _, cd, _ in series if (cd > 0) != (series[-1][2] > series[0][2]))
    print(f'  Across {len(series)} trading days, the running multi-day cumulative')
    print(f'  delta had the OPPOSITE sign to the sample\'s realised price direction')
    print(f'  on {wrongsign} of them ({100*wrongsign/len(series):.0f}%).')
    print()


if __name__ == '__main__':
    main()
