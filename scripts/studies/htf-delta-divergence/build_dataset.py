#!/usr/bin/env python3
"""Union the HTF 30-min exports from several bundles into one chronological series.

Validates that overlapping bars agree between exports before merging; any
disagreement is reported and the NEWEST bundle's row wins (the exporter may have
revised a bar). Writes union.csv with the same header as the live export.
"""
import csv, os, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
HEADER = ['DateTime', 'Open', 'High', 'Low', 'Close', 'Volume', 'BidVolume', 'AskVolume']

# oldest-received first so newer bundles overwrite on conflict
SOURCES = [
    ('0fdd60d9-994e-400c-8af2-55293d506b0f', 'bundle received 2026-07-25T23:51Z'),
    ('1c15934a-4a19-46ce-a43a-96f4918ba05a', 'bundle received 2026-08-06T18:33Z'),
    ('ef221fc6-e9c1-45e4-b5d8-63e1993a34a9', 'bundle received 2026-08-12T18:31Z'),
]


def load(path):
    with open(path) as fh:
        rdr = csv.reader(fh)
        head = next(rdr)
        assert head == HEADER, (path, head)
        return [r for r in rdr if r and r[0].strip()]


def main():
    merged = {}
    conflicts = 0
    conflict_samples = []
    for bid, label in SOURCES:
        rows = load(os.path.join(DATA, bid + '.csv'))
        print(f'{bid}  {label}: {len(rows)} bars  {rows[0][0]} .. {rows[-1][0]}')
        for r in rows:
            k = r[0].strip()
            if k in merged and merged[k][1:] != r[1:]:
                conflicts += 1
                if len(conflict_samples) < 5:
                    conflict_samples.append((k, merged[k], r))
            merged[k] = r

    keys = sorted(merged)
    print(f'\nunion: {len(keys)} bars  {keys[0]} .. {keys[-1]}')
    print(f'overlap conflicts (differing OHLCV for same timestamp): {conflicts}')
    for c in conflict_samples:
        print('  ', c)

    out = os.path.join(HERE, 'union.csv')
    with open(out, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(HEADER)
        for k in keys:
            w.writerow(merged[k])
    print('wrote', out)

    # also report the repo file's range for the record
    repo = '/home/caleb/source/repos/leverage-workshop/gekko/chart-data/htf_bar_data.rolling.csv'
    if os.path.exists(repo):
        rows = load(repo)
        print(f'\nrepo chart-data file: {len(rows)} bars  {rows[0][0]} .. {rows[-1][0]}')
        inside = sum(1 for r in rows if r[0].strip() in merged)
        agree = sum(1 for r in rows if merged.get(r[0].strip(), [None]*8)[1:] == r[1:])
        print(f'  of those, {inside} timestamps present in the union, {agree} identical rows')


if __name__ == '__main__':
    main()
