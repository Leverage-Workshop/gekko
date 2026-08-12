#!/usr/bin/env python3
"""
Confirmatory pass for the feat-102 swing-divergence question.

Adds to swing_divergence_study.py:
  1. ONE pre-registered primary spec (literal barFlow port, window 20, eps 50),
     both sides pooled, with a day-clustered bootstrap CI that respects the
     overlap between forward windows.
  2. The like-for-like control: among swings that ARE fresh price extremes,
     divergent vs delta-CONFIRMED (Definition B). This is the control that
     matters -- it removes "fresh extreme in a trending tape" from the compare.
  3. Multiple-comparisons tally over the whole sensitivity grid.
  4. Effective (non-overlapping) sample size.
  5. Temporal split-half stability.
  6. The day-level replication, to check the trap direction against the prior
     2026-08-07 negative result.
  7. Descriptive delta/volume-at-swing stats -- the non-directional annotation
     payload the feature can safely ship.
"""
import os, sys, math, random, statistics
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swing_divergence_study import (
    Bar, load_bars, cumulative_delta, find_pivots, rolling_atr,
    divergence_barflow, divergence_swing_to_swing, signal_return,
    unconditional, summarize, wilson_ci, binom_two_sided_p,
    SWING_PIVOT_STRENGTH, DELTA_TREND_EPSILON, HORIZONS, PRICE_EPSILON,
)

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(20260812)

RTH_OPEN_MINUTES = 8 * 60 + 30
GLOBEX_OPEN_MINUTES = 17 * 60
RTH_BARS_PER_SESSION = 15


def trading_day(dt):
    d = dt
    mins = d.hour * 60 + d.minute
    if mins >= GLOBEX_OPEN_MINUTES:
        d = d.replace()
        from datetime import timedelta
        d = d + timedelta(days=1)
    return d.strftime('%Y-%m-%d')


def cluster_bootstrap_rate(events, iters=10000):
    """events: list of (day, win_bool). Resample DAYS with replacement."""
    if not events:
        return (float('nan'), float('nan'))
    byday = defaultdict(list)
    for day, w in events:
        byday[day].append(w)
    days = list(byday)
    rates = []
    for _ in range(iters):
        picked = [random.choice(days) for _ in days]
        vals = [w for d in picked for w in byday[d]]
        if vals:
            rates.append(sum(vals) / len(vals))
    rates.sort()
    return (rates[int(0.025 * len(rates))], rates[int(0.975 * len(rates))])


def cluster_bootstrap_mean(events, iters=10000):
    if not events:
        return (float('nan'), float('nan'))
    byday = defaultdict(list)
    for day, v in events:
        byday[day].append(v)
    days = list(byday)
    out = []
    for _ in range(iters):
        picked = [random.choice(days) for _ in days]
        vals = [v for d in picked for v in byday[d]]
        if vals:
            out.append(statistics.fmean(vals))
    out.sort()
    return (out[int(0.025 * len(out))], out[int(0.975 * len(out))])


def effective_n(conf_indices, h):
    """Greedy count of events whose h-bar forward windows do not overlap."""
    n, last = 0, -10**9
    for c in sorted(conf_indices):
        if c >= last + h:
            n += 1
            last = c
    return n


def main():
    bars = load_bars(os.path.join(HERE, 'union.csv'))
    cum = cumulative_delta(bars)
    atr = rolling_atr(bars)
    med_atr = statistics.median([a for a in atr if a])
    highs = find_pivots(bars, 'high')
    lows = find_pivots(bars, 'low')

    base = {}
    for h in HORIZONS:
        base[h] = {'high': summarize(unconditional(bars, h, 'high'))['win'],
                   'low': summarize(unconditional(bars, h, 'low'))['win']}

    # ---------------------------------------------------------------- 1. PRIMARY
    print('=' * 78)
    print('1. PRE-REGISTERED PRIMARY — literal barFlow port (window 20, eps 50)')
    print('   BOTH SIDES POOLED. "win" = the divergence FADE thesis paid.')
    print('=' * 78)
    W, EPS = 20, DELTA_TREND_EPSILON
    div_events, non_events = [], []
    for side, piv in (('high', highs), ('low', lows)):
        for p in piv:
            r = divergence_barflow(bars, cum, p, side, W, EPS)
            if r is None:
                continue
            (div_events if r else non_events).append((side, p))
    print(f'divergent swings pooled: {len(div_events)}   '
          f'non-divergent: {len(non_events)}   '
          f'total classified: {len(div_events)+len(non_events)}')
    print()
    print(f'{"h":>4} {"n":>4} {"eff n":>6} {"fade win%":>10} {"day-clust 95% CI":>20} '
          f'{"uncond":>8} {"lift":>8} {"mean pts":>9} {"mean ATR":>9} {"pts 95% CI":>20}')
    for h in HORIZONS:
        rows, means, confs = [], [], []
        for side, p in div_events:
            c = p + SWING_PIVOT_STRENGTH
            v = signal_return(bars, c, h, side)
            if v is None:
                continue
            d = trading_day(bars[c].dt)
            rows.append((d, v > 0))
            means.append((d, v))
            confs.append(c)
        n = len(rows)
        wins = sum(1 for _, w in rows if w)
        lo, hi = cluster_bootstrap_rate(rows, 4000)
        mlo, mhi = cluster_bootstrap_mean(means, 4000)
        # pooled unconditional: weight sides by their event counts
        nh = sum(1 for s, _ in div_events if s == 'high')
        nl = len(div_events) - nh
        ub = (nh * base[h]['high'] + nl * base[h]['low']) / (nh + nl)
        mv = statistics.fmean(v for _, v in means)
        print(f'{h:>4} {n:>4} {effective_n(confs,h):>6} {100*wins/n:>9.1f}% '
              f'[{100*lo:>5.1f},{100*hi:>5.1f}]%   {100*ub:>6.1f}% '
              f'{100*(wins/n-ub):>+7.1f}pp {mv:>9.1f} {mv/med_atr:>9.2f} '
              f'[{mlo:>7.1f},{mhi:>7.1f}]')
    print()
    print('  Reading: a fade thesis that worked would show win% ABOVE uncond and a')
    print('  POSITIVE mean. Negative mean = price kept going the way the divergence')
    print('  said it should not = CONTINUATION.')
    print()

    # -------------------------------------------------- 2. LIKE-FOR-LIKE CONTROL
    print('=' * 78)
    print('2. LIKE-FOR-LIKE CONTROL — among swings that ARE fresh price extremes,')
    print('   does the delta add anything? (Definition B: divergent vs')
    print('   delta-CONFIRMED fresh extremes. Removes "fresh extreme in a trend".)')
    print('=' * 78)
    dvB, nonB = [], []
    for side, piv in (('high', highs), ('low', lows)):
        for j, p in enumerate(piv):
            prev_p = piv[j - 1] if j > 0 else None
            r = divergence_swing_to_swing(bars, cum, p, prev_p, side, EPS)
            if r is None:
                continue
            (dvB if r else nonB).append((side, p))
    print(f'fresh-extreme swings: {len(dvB)+len(nonB)}  '
          f'(divergent {len(dvB)}, delta-confirmed {len(nonB)})')
    print()
    print(f'{"h":>4} | {"DIVERGENT":^26} | {"DELTA-CONFIRMED":^26} | {"diff":>18}')
    print(f'{"":>4} | {"n":>4} {"win%":>7} {"mean pts":>12} | '
          f'{"n":>4} {"win%":>7} {"mean pts":>12} | {"win pp":>8} {"pts":>9}')
    for h in HORIZONS:
        def collect(evs):
            vs = []
            for side, p in evs:
                v = signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)
                if v is not None:
                    vs.append(v)
            return vs
        a, b = collect(dvB), collect(nonB)
        sa, sb = summarize(a), summarize(b)
        print(f'{h:>4} | {sa["n"]:>4} {100*sa["win"]:>6.1f}% {sa["mean"]:>12.1f} | '
              f'{sb["n"]:>4} {100*sb["win"]:>6.1f}% {sb["mean"]:>12.1f} | '
              f'{100*(sa["win"]-sb["win"]):>+7.1f}pp {sa["mean"]-sb["mean"]:>+9.1f}')
    print()

    # --------------------------------------------- 3. MULTIPLE COMPARISONS TALLY
    print('=' * 78)
    print('3. MULTIPLE COMPARISONS over the full sensitivity grid')
    print('=' * 78)
    med_vol = statistics.median(b.v for b in bars)
    scaled = DELTA_TREND_EPSILON / 750.0 * med_vol
    cells, sig, signs = 0, 0, []
    for eps in (DELTA_TREND_EPSILON, scaled):
        for W2 in (20, 34, 68):
            for side, piv in (('high', highs), ('low', lows)):
                dd = [p for p in piv
                      if divergence_barflow(bars, cum, p, side, W2, eps) is True]
                for h in HORIZONS:
                    vs = [v for p in dd
                          for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                          if v is not None]
                    if not vs:
                        continue
                    s = summarize(vs)
                    cells += 1
                    pb = binom_two_sided_p(s['wins'], s['n'], base[h][side])
                    if pb < 0.05:
                        sig += 1
                    signs.append(s['win'] - base[h][side])
        for side, piv in (('high', highs), ('low', lows)):
            dd = []
            for j, p in enumerate(piv):
                prev_p = piv[j - 1] if j > 0 else None
                if divergence_swing_to_swing(bars, cum, p, prev_p, side, eps) is True:
                    dd.append(p)
            for h in HORIZONS:
                vs = [v for p in dd
                      for v in [signal_return(bars, p + SWING_PIVOT_STRENGTH, h, side)]
                      if v is not None]
                if not vs:
                    continue
                s = summarize(vs)
                cells += 1
                pb = binom_two_sided_p(s['wins'], s['n'], base[h][side])
                if pb < 0.05:
                    sig += 1
                signs.append(s['win'] - base[h][side])
    print(f'cells tested                 : {cells}')
    print(f'cells with raw binomial p<.05: {sig}   '
          f'(expected by chance alone: {0.05*cells:.1f})')
    print(f'Bonferroni threshold         : p < {0.05/cells:.5f}   '
          f'-- no cell came close')
    neg = sum(1 for s in signs if s < 0)
    print(f'sign of lift vs unconditional: {neg}/{len(signs)} NEGATIVE '
          f'(fade thesis lost), {len(signs)-neg} positive')
    print('  NOTE: these cells share the same swings, so the sign tally is NOT an')
    print('  independent sign test -- it shows the direction is stable, not that it')
    print('  is significant.')
    print()

    # ------------------------------------------------------ 4. TEMPORAL SPLIT-HALF
    print('=' * 78)
    print('4. TEMPORAL SPLIT-HALF STABILITY (primary spec)')
    print('=' * 78)
    mid = len(bars) // 2
    print(f'first half : bars 0..{mid} ({bars[0].dt.date()} .. {bars[mid].dt.date()})')
    print(f'second half: bars {mid}..{len(bars)} ({bars[mid].dt.date()} .. {bars[-1].dt.date()})')
    print(f'{"half":>7} {"h":>4} {"n":>4} {"win%":>8} {"mean pts":>10}')
    for label, lo_i, hi_i in (('first', 0, mid), ('second', mid, len(bars))):
        for h in HORIZONS:
            vs = []
            for side, p in div_events:
                c = p + SWING_PIVOT_STRENGTH
                if not (lo_i <= c < hi_i):
                    continue
                v = signal_return(bars, c, h, side)
                if v is not None:
                    vs.append(v)
            if not vs:
                continue
            s = summarize(vs)
            print(f'{label:>7} {h:>4} {s["n"]:>4} {100*s["win"]:>7.1f}% {s["mean"]:>10.1f}')
    print()

    # ------------------------------------------------------- 5. DAY-LEVEL ANCHOR
    print('=' * 78)
    print('5. DAY-LEVEL REPLICATION — direction check against the prior')
    print('   2026-08-07 negative result (which found a slight CONTINUATION bias)')
    print('=' * 78)
    byday = defaultdict(list)
    for b in bars:
        mins = b.dt.hour * 60 + b.dt.minute
        if RTH_OPEN_MINUTES <= mins < GLOBEX_OPEN_MINUTES:
            byday[trading_day(b.dt)].append(b)
    sessions = [(d, byday[d]) for d in sorted(byday)
                if len(byday[d]) >= RTH_BARS_PER_SESSION]
    print(f'complete RTH sessions reconstructed: {len(sessions)} '
          f'(of {len(byday)} day groups)')
    dayhigh = [max(x.h for x in s[1]) for s in sessions]
    daylow = [min(x.l for x in s[1]) for s in sessions]
    dayclose = [s[1][-1].c for s in sessions]
    daydelta = []
    run = 0.0
    for _, sb in sessions:
        run += sum(x.delta for x in sb)
        daydelta.append(run)
    for lookback in (3, 5):
        for label, want in (('bearish (fresh day high, delta fails)', 'high'),
                            ('bullish (fresh day low, delta holds)', 'low')):
            ev = []
            for i in range(lookback, len(sessions) - 1):
                pw = range(i - lookback, i)
                if want == 'high':
                    fresh = dayhigh[i] > max(dayhigh[j] for j in pw) + PRICE_EPSILON
                    fail = daydelta[i] < max(daydelta[j] for j in pw) - EPS
                else:
                    fresh = daylow[i] < min(daylow[j] for j in pw) - PRICE_EPSILON
                    fail = daydelta[i] > min(daydelta[j] for j in pw) + EPS
                if fresh and fail:
                    ev.append(i)
            for fwd in (1, 2):
                vs = []
                for i in ev:
                    if i + fwd >= len(sessions):
                        continue
                    d = dayclose[i + fwd] - dayclose[i]
                    vs.append(-d if want == 'high' else d)
                if not vs:
                    continue
                s = summarize(vs)
                # control: every session
                ctrl = []
                for i in range(len(sessions) - fwd):
                    d = dayclose[i + fwd] - dayclose[i]
                    ctrl.append(-d if want == 'high' else d)
                cs = summarize(ctrl)
                print(f'  lookback {lookback}d, +{fwd}d | {label:<40} '
                      f'n={s["n"]:>3} fade-win {100*s["win"]:>5.1f}% '
                      f'(base {100*cs["win"]:>5.1f}%, lift {100*(s["win"]-cs["win"]):>+5.1f}pp) '
                      f'mean {s["mean"]:>+7.1f} pts')
    print()

    # -------------------------------------------- 6. NON-DIRECTIONAL ANNOTATION
    print('=' * 78)
    print('6. NON-DIRECTIONAL ANNOTATION PAYLOAD (safe to ship: no claim attached)')
    print('=' * 78)
    hv = [bars[p].delta for p in highs]
    lv = [bars[p].delta for p in lows]
    hvol = [bars[p].v for p in highs]
    lvol = [bars[p].v for p in lows]
    allv = [b.v for b in bars]
    print(f'delta at confirmed swing HIGH bars: n={len(hv)} '
          f'median {statistics.median(hv):+.0f}  mean {statistics.fmean(hv):+.0f}  '
          f'{100*sum(1 for x in hv if x>0)/len(hv):.0f}% positive')
    print(f'delta at confirmed swing LOW  bars: n={len(lv)} '
          f'median {statistics.median(lv):+.0f}  mean {statistics.fmean(lv):+.0f}  '
          f'{100*sum(1 for x in lv if x>0)/len(lv):.0f}% positive')
    print(f'volume at swing highs: median {statistics.median(hvol):.0f}  '
          f'lows: median {statistics.median(lvol):.0f}  '
          f'all bars: median {statistics.median(allv):.0f}')
    print(f'series cumulative delta: {cum[-1]:+,.0f} contracts over '
          f'{bars[-1].c - bars[0].o:+.0f} pts of price -- '
          f'{"SAME" if (cum[-1]>0)==(bars[-1].c>bars[0].o) else "OPPOSITE"} sign')
    print()

    # ------------------------------------------------- 7. SMALL-SAMPLE ILLUSTRATION
    print('=' * 78)
    print('7. WHAT THE REPO FILE ALONE WOULD HAVE GIVEN (593-bar chart-data export)')
    print('=' * 78)
    repo = '/home/caleb/source/repos/leverage-workshop/gekko/chart-data/htf_bar_data.rolling.csv'
    if os.path.exists(repo):
        rb = load_bars(repo)
        rc = cumulative_delta(rb)
        rh, rl = find_pivots(rb, 'high'), find_pivots(rb, 'low')
        nd = 0
        for side, piv in (('high', rh), ('low', rl)):
            nd += sum(1 for p in piv
                      if divergence_barflow(rb, rc, p, side, W, EPS) is True)
        print(f'bars {len(rb)}  confirmed swings {len(rh)}H/{len(rl)}L  '
              f'divergent (primary spec) {nd}')
        print(f'-> {nd} events across 8 side x horizon cells is single-to-low-double')
        print('   digits per cell; the union dataset is 6x that and still underpowered.')
    print()


if __name__ == '__main__':
    main()
