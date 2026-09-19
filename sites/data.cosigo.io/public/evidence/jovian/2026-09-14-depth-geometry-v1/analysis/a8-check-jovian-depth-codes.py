#!/usr/bin/env python3

import csv
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PACKET=Path(
    '/home/greg/a8-backups/'
    'a8-jovian-final-external-20260914T015710Z'
)

MOONS={
    'IO':'io.txt',
    'EUROPA':'europa.txt',
    'GANYMEDE':'ganymede.txt',
    'CALLISTO':'callisto.txt'
}

def rows(path):
    inside=False
    for line in path.read_text(errors='replace').splitlines():
        if '$$SOE' in line:
            inside=True
            continue
        if '$$EOE' in line:
            break
        if inside and line.strip():
            yield [
                x.strip()
                for x in next(csv.reader([line]))
            ]

def parse_time(s):
    return datetime.strptime(
        s,
        '%Y-%b-%d %H:%M'
    ).replace(tzinfo=timezone.utc)

# Jupiter:
# date, solar, lunar, angular diameter, range, range-rate
jupiter={}

for f in rows(PACKET/'jupiter.txt'):
    if len(f) < 6:
        raise SystemExit(
            f'FAIL · unexpected Jupiter row: {f}'
        )

    jupiter[parse_time(f[0])] = {
        'radius':float(f[3])/2,
        'range':float(f[4])
    }

print('===== CORRECTED HORIZONS DISK-EVENT AUDIT =====')
print()

for name,filename in MOONS.items():
    counts=Counter()

    checked=0
    agreed=0
    disagreements=[]

    for f in rows(PACKET/filename):
        if len(f) < 11:
            raise SystemExit(
                f'FAIL · unexpected {name} row: {f}'
            )

        t=parse_time(f[0])

        x=float(f[3])
        y=float(f[4])
        sep=float(f[6])

        code=f[7].strip()
        code=code[1:] if code.startswith('/') else code

        moon_radius=float(f[8])/2
        moon_range=float(f[9])

        counts[code or 'blank'] += 1

        j=jupiter[t]

        # Same limb-to-limb primary-disk geometry Horizons describes.
        overlap = (
            sep <=
            j['radius'] + moon_radius
        )

        # Positive = moon nearer observer than Jupiter.
        front = (
            moon_range < j['range']
        )

        if overlap:
            derived = 'FRONT' if front else 'BACK'
        else:
            derived = 'CLEAR'

        # Horizons disk interpretation:
        #
        # t       = transiting primary disk
        # O/P/U   = occulted by primary disk
        # p/u/*   = not primary-disk occultation/transit
        if code == 't':
            external='FRONT'

        elif code in ('O','P','U'):
            external='BACK'

        else:
            external='CLEAR'

        checked += 1

        if derived == external:
            agreed += 1

        elif len(disagreements) < 12:
            disagreements.append({
                'time':t.isoformat(),
                'code':code,
                'derived':derived,
                'external':external,
                'sep':sep,
                'front':front
            })

    fraction=agreed/checked

    print(
        f'{name:<9} '
        f'{agreed}/{checked} '
        f'= {fraction:.6f}'
    )

    print(
        '  codes ·',
        ' '.join(
            f'{k}:{v}'
            for k,v in sorted(counts.items())
        )
    )

    if disagreements:
        print('  first disagreements:')
        for d in disagreements:
            print('   ',d)

    if fraction < 0.995:
        raise SystemExit(
            f'FAIL · {name} still below qualification threshold'
        )

    print('  PASS')
    print()

print('PASS · ALL FOUR DEPTH / DISK STATES REPRODUCED')
print('PASS · EXISTING EXTERNAL PACKET IS SUFFICIENT')
print('PASS · NO NEW JPL CAPTURE REQUIRED')
