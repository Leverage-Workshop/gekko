#!/usr/bin/env python3
"""
Fourth pass — stress-test the one result that survived so far (a drift-adjusted
continuation effect at h=16/34 whose bootstrap CI excluded zero).

Three attacks:
  1. ROBUSTNESS: mean vs median vs trimmed/winsorized mean. A mean-only effect
     at n=89 on fat-tailed 34-bar returns is usually a handful of observations.
  2. PLACEBO / LABEL PERMUTATION: randomly relabel which swings are "divergent",
     preserving the per-side count exactly. This controls for the swing
     conditioning AND the high/low mix (which matters: the tape drifted +2491
     pts, so an imbalanced mix manufactures a signed effect on its own).
  3. STRATIFIED PLACEBO: permute the delta label WITHIN the fresh-extreme and
     no-fresh strata separately, per side. This is the direct test of "does the
     DELTA add anything the price condition did not already give?".
Plus a per-side drift-adjusted rerun of the 2x2, since the raw 2x2 in
decompose.py pooled sides with different drift exposure.
"""
import os, sys, math, random, statistics
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swing_divergence_study import (
    load_bars, cumulative_delta, find_pivots, rolling_atr, divergence_barflow,
    signal_return, unconditional, summarize, SWING_PIVOT_STRENGTH,
    DELTA_TREND_EPSILON, HORIZONS,
)
from confirm import trading_day
from decompose import fresh_and_delta_flags

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(20260812)
W, EPS = 20, DELTA_TREND_EPSILON
ITERS = 20000


def trimmed_mean(vals, frac=0.10):
    v = sorted(vals)
    k = int(len(v) * frac)
    return statistics.fmean(v[k:len(v) - k]) if len(v) - 2 * k > 0 else float('nan')


def winsorized_mean(vals, frac=0.10):
    v = sorted(vals)
    k = int(len(v) * frac)
    if k == 0 or len(v) - 2 * k <= 0:
        return statistics.fmean(v)
    w = [v[k]] * k + v[k:len(v) - k] + [v[len(v) - k - 1]] * k
    return statistics.fmean(w)


def main():
    bars = load_bars(os.path.join(HERE, 'union.csv'))
    cum = cumulative_delta(bars)
    atr = rolling_atr(bars)
    med_atr = statistics.median([a for a in atr if a])
    highs, lows = find_pivots(bars, 'high'), find_pivots(bars, 'low')

    # classify every swing once
    classified = []   # (side, p, is_divergent, is_fresh, delta_failed)
    for side, piv in (('high', highs), ('low', lows)):
        for p in piv:
            d = divergence_barflow(bars, cum, p, side, W, EPS)
            f = fresh_and_delta_flags(bars, cum, p, side)
            if d is None or f is None:
                continue
            classified.append((side, p, bool(d), f[0], f[1]))
    ndh = sum(1 for s, _, d, _, _ in classified if d and s == 'high')
    ndl = sum(1 for s, _, d, _, _ in classified if d and s == 'low')
    print(f'classified swings: {len(classified)}   divergent: {ndh} highs + {ndl} lows'
          f' = {ndh+ndl}\n')

    for h in HORIZONS:
        um = {s: statistics.fmean(unconditional(bars, h, s)) for s in ('high', 'low')}
        # drift-adjusted return per event
        ev = []
        for side, p, d, fr, df in classified:
            c = p + SWING_PIVOT_STRENGTH
            v = signal_return(bars, c, h, side)
            if v is None:
                continue
            ev.append(dict(side=side, day=trading_day(bars[c].dt), adj=v - um[side],
                           div=d, fresh=fr, failed=df, raw=v))
        dv = [e['adj'] for e in ev if e['div']]
        if not dv:
            continue

        print('=' * 78)
        print(f'HORIZON h={h} bars ({h*30/60:.0f}h)   n divergent = {len(dv)}')
        print('=' * 78)
        # --- 1. robustness
        pos = sum(1 for x in dv if x > 0)
        print('1. ROBUSTNESS of the drift-adjusted "fade thesis" return, points')
        print(f'   mean {statistics.fmean(dv):>8.1f} | median {statistics.median(dv):>8.1f} '
              f'| 10% trimmed {trimmed_mean(dv):>8.1f} | 10% winsorized '
              f'{winsorized_mean(dv):>8.1f}')
        print(f'   in ATR: mean {statistics.fmean(dv)/med_atr:>5.2f} | median '
              f'{statistics.median(dv)/med_atr:>5.2f} | trimmed '
              f'{trimmed_mean(dv)/med_atr:>5.2f}')
        print(f'   share of events with a POSITIVE (fade-paid) adjusted return: '
              f'{100*pos/len(dv):.1f}%')
        worst = sorted(dv)[:3]
        print(f'   3 most extreme adverse observations: '
              f'{", ".join(f"{x:.0f}" for x in worst)} pts  '
              f'(mean without them: {statistics.fmean(sorted(dv)[3:]):.1f})')

        # --- 2. placebo, per-side counts preserved
        obs = statistics.fmean(dv)
        obs_med = statistics.median(dv)
        by_side = defaultdict(list)
        for e in ev:
            by_side[e['side']].append(e['adj'])
        want = {s: sum(1 for e in ev if e['div'] and e['side'] == s)
                for s in ('high', 'low')}
        hits = hits_med = 0
        for _ in range(ITERS):
            samp = []
            for s in ('high', 'low'):
                if want[s]:
                    samp += random.sample(by_side[s], want[s])
            m = statistics.fmean(samp)
            if abs(m) >= abs(obs) - 1e-9:
                hits += 1
            if abs(statistics.median(samp)) >= abs(obs_med) - 1e-9:
                hits_med += 1
        print('2. PLACEBO — random swings, per-side counts preserved '
              f'({ITERS} draws)')
        print(f'   observed mean {obs:>8.1f} pts  -> p = {(hits+1)/(ITERS+1):.4f}')
        print(f'   observed median {obs_med:>6.1f} pts  -> p = {(hits_med+1)/(ITERS+1):.4f}')

        # --- 3. stratified placebo: delta label permuted within fresh strata
        strata = defaultdict(list)
        for e in ev:
            strata[(e['side'], e['fresh'])].append(e)
        want2 = defaultdict(int)
        for e in ev:
            if e['failed']:
                want2[(e['side'], e['fresh'])] += 1
        obs_fail = statistics.fmean([e['adj'] for e in ev if e['failed']])
        obs_conf = statistics.fmean([e['adj'] for e in ev if not e['failed']])
        obs_diff = obs_fail - obs_conf
        hits3 = 0
        for _ in range(ITERS):
            f_vals, c_vals = [], []
            for k, pool in strata.items():
                vals = [e['adj'] for e in pool]
                random.shuffle(vals)
                nf = want2[k]
                f_vals += vals[:nf]
                c_vals += vals[nf:]
            if not f_vals or not c_vals:
                continue
            d = statistics.fmean(f_vals) - statistics.fmean(c_vals)
            if abs(d) >= abs(obs_diff) - 1e-9:
                hits3 += 1
        print('3. STRATIFIED PLACEBO — delta label permuted WITHIN (side x fresh)')
        print(f'   delta-failed mean {obs_fail:>8.1f} | delta-confirmed mean '
              f'{obs_conf:>8.1f} | diff {obs_diff:>8.1f} pts '
              f'({obs_diff/med_atr:+.2f} ATR)')
        print(f'   -> p = {(hits3+1)/(ITERS+1):.4f}')

        # --- per-side drift-adjusted 2x2
        print('4. DRIFT-ADJUSTED 2x2 (per-side adjustment, mean adj pts / n)')
        for fr in (True, False):
            row = []
            for df in (True, False):
                vals = [e['adj'] for e in ev if e['fresh'] == fr and e['failed'] == df]
                nh = sum(1 for e in ev if e['fresh'] == fr and e['failed'] == df
                         and e['side'] == 'high')
                row.append(f'{statistics.fmean(vals):>+8.1f} (n={len(vals):>3}, '
                           f'{nh} hi/{len(vals)-nh} lo)' if vals else '   n/a')
            print(f'   {"fresh" if fr else "no-fresh":>9}: '
                  f'delta-failed {row[0]}   delta-confirmed {row[1]}')
        print()

    # ---- how many independent days does the whole thing rest on?
    print('=' * 78)
    print('SAMPLE STRUCTURE')
    print('=' * 78)
    days = defaultdict(int)
    for side, p, d, _, _ in classified:
        if d:
            days[trading_day(bars[p + SWING_PIVOT_STRENGTH].dt)] += 1
    print(f'the {sum(days.values())} divergent events fall on {len(days)} distinct '
          f'trading days')
    print(f'max events on one day: {max(days.values())}; '
          f'days with >1 event: {sum(1 for v in days.values() if v > 1)}')
    print(f'total trading days in sample: '
          f'{len({trading_day(b.dt) for b in bars})}')
    print()


if __name__ == '__main__':
    main()
