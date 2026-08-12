#!/usr/bin/env python3
"""
Fifth and final pass. Two weaknesses remain in stress.py:

  (a) the placebo sampled EVENTS independently, but the 89 divergent events fall
      on only 55 trading days (up to 4 on one day). Independent-event sampling
      understates the true variance -> overstated significance. Fixed here with a
      DAY-BLOCKED placebo.
  (b) raw points mix regimes. An ATR-normalized version removes the possibility
      that divergent swings simply cluster in high-volatility stretches.

Also applies Holm-Bonferroni across the 4 horizons, which is the minimum honest
correction given all four were tested.
"""
import os, sys, math, random, statistics
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swing_divergence_study import (
    load_bars, cumulative_delta, find_pivots, rolling_atr, divergence_barflow,
    signal_return, unconditional, SWING_PIVOT_STRENGTH, DELTA_TREND_EPSILON,
    HORIZONS,
)
from confirm import trading_day
from decompose import fresh_and_delta_flags

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(20260812)
W, EPS = 20, DELTA_TREND_EPSILON
ITERS = 20000


def day_blocked_placebo(all_ev, want_by_side, obs, key, iters=ITERS):
    """
    Resample whole DAYS (with replacement) until the per-side event count is
    reached, so within-day clustering is preserved. Two-sided p on |mean|.
    """
    byday_side = defaultdict(lambda: defaultdict(list))
    for e in all_ev:
        byday_side[e['side']][e['day']].append(e[key])
    hits = 0
    for _ in range(iters):
        samp = []
        for side, need in want_by_side.items():
            if not need:
                continue
            pool_days = list(byday_side[side])
            got = []
            while len(got) < need:
                d = random.choice(pool_days)
                got += byday_side[side][d]
            samp += got[:need]
        if abs(statistics.fmean(samp)) >= abs(obs) - 1e-12:
            hits += 1
    return (hits + 1) / (iters + 1)


def stratified_day_placebo(ev, obs_diff, iters=ITERS):
    """
    Permute the DELTA-FAILED label within each (side x fresh-extreme) stratum,
    drawing whole days at a time so clustering survives the permutation.
    """
    strata = defaultdict(lambda: defaultdict(list))
    need = defaultdict(int)
    for e in ev:
        strata[(e['side'], e['fresh'])][e['day']].append(e['adj_atr'])
        if e['failed']:
            need[(e['side'], e['fresh'])] += 1
    hits = 0
    for _ in range(iters):
        fv, cv = [], []
        for k, byday in strata.items():
            days = list(byday)
            random.shuffle(days)
            flat = [v for d in days for v in byday[d]]
            n = need[k]
            fv += flat[:n]
            cv += flat[n:]
        if not fv or not cv:
            continue
        if abs(statistics.fmean(fv) - statistics.fmean(cv)) >= abs(obs_diff) - 1e-12:
            hits += 1
    return (hits + 1) / (iters + 1)


def holm(pvals):
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    m = len(pvals)
    adj = [0.0] * m
    prev = 0.0
    for rank, i in enumerate(order):
        a = min(1.0, (m - rank) * pvals[i])
        prev = max(prev, a)
        adj[i] = prev
    return adj


def main():
    bars = load_bars(os.path.join(HERE, 'union.csv'))
    cum = cumulative_delta(bars)
    atr = rolling_atr(bars)
    highs, lows = find_pivots(bars, 'high'), find_pivots(bars, 'low')

    classified = []
    for side, piv in (('high', highs), ('low', lows)):
        for p in piv:
            d = divergence_barflow(bars, cum, p, side, W, EPS)
            f = fresh_and_delta_flags(bars, cum, p, side)
            if d is None or f is None:
                continue
            classified.append((side, p, bool(d), f[0], f[1]))

    raw_p, atr_p, strat_p = [], [], []
    print('=' * 78)
    print('DAY-BLOCKED PLACEBO (preserves within-day clustering) + ATR NORMALIZATION')
    print('=' * 78)
    print(f'{"h":>4} {"n":>4} {"days":>5} | {"mean pts":>9} {"p(day-blk)":>11} | '
          f'{"mean ATRs":>10} {"p(ATR)":>8} | {"delta-only":>11} {"p":>7}')
    for h in HORIZONS:
        um = {s: statistics.fmean(unconditional(bars, h, s)) for s in ('high', 'low')}
        um_atr = {}
        for s in ('high', 'low'):
            vals = []
            for i in range(len(bars) - h):
                a = atr[i]
                if not a:
                    continue
                fwd = bars[i + h].c - bars[i].c
                vals.append((-fwd if s == 'high' else fwd) / a)
            um_atr[s] = statistics.fmean(vals)

        ev = []
        for side, p, d, fr, df in classified:
            c = p + SWING_PIVOT_STRENGTH
            v = signal_return(bars, c, h, side)
            a = atr[c]
            if v is None or not a:
                continue
            ev.append(dict(side=side, day=trading_day(bars[c].dt), div=d,
                           fresh=fr, failed=df,
                           adj=v - um[side], adj_atr=v / a - um_atr[side]))
        dv = [e for e in ev if e['div']]
        want = {s: sum(1 for e in dv if e['side'] == s) for s in ('high', 'low')}
        ndays = len({e['day'] for e in dv})

        obs = statistics.fmean(e['adj'] for e in dv)
        obs_atr = statistics.fmean(e['adj_atr'] for e in dv)
        p1 = day_blocked_placebo(ev, want, obs, 'adj')
        p2 = day_blocked_placebo(ev, want, obs_atr, 'adj_atr')

        of = statistics.fmean(e['adj_atr'] for e in ev if e['failed'])
        oc = statistics.fmean(e['adj_atr'] for e in ev if not e['failed'])
        od = of - oc
        p3 = stratified_day_placebo(ev, od)

        raw_p.append(p1); atr_p.append(p2); strat_p.append(p3)
        print(f'{h:>4} {len(dv):>4} {ndays:>5} | {obs:>9.1f} {p1:>11.4f} | '
              f'{obs_atr:>10.2f} {p2:>8.4f} | {od:>+10.2f}A {p3:>7.4f}')

    print()
    print('HOLM-BONFERRONI across the 4 horizons (all four were tested):')
    print(f'{"h":>4} {"p pts":>8} {"holm":>8} | {"p ATR":>8} {"holm":>8} | '
          f'{"p delta-only":>13} {"holm":>8}')
    h1, h2, h3 = holm(raw_p), holm(atr_p), holm(strat_p)
    for i, h in enumerate(HORIZONS):
        print(f'{h:>4} {raw_p[i]:>8.4f} {h1[i]:>8.4f} | {atr_p[i]:>8.4f} '
              f'{h2[i]:>8.4f} | {strat_p[i]:>13.4f} {h3[i]:>8.4f}')
    print()
    print('  "delta-only" is the test that decides the feature: does the')
    print('  cumulative-delta condition add anything once "price made a fresh')
    print('  extreme at this swing" is held fixed? Units are ATR multiples.')
    print()

    print('=' * 78)
    print('SPECIFICATION-SEARCH ACCOUNTING')
    print('=' * 78)
    print('  divergence definitions tried : 2 (barFlow window port, swing-to-swing)')
    print('  windows tried                : 3 (20 / 34 / 68 bars)')
    print('  delta epsilons tried         : 2 (literal 50, volume-scaled 324)')
    print('  swing sides                  : 2      horizons: 4')
    print('  -> 64 side x horizon cells in the grid. The "primary" spec was named')
    print('     AFTER the grid had been run. Every p-value above must be read')
    print('     against that, not as a clean pre-registered single test.')
    print()


if __name__ == '__main__':
    main()
