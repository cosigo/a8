#!/usr/bin/env python3

import json
import time
import urllib.request
from collections import deque
from fractions import Fraction

PRIMARY = "http://127.0.0.1:28788/snapshot"
GHOST   = "http://127.0.0.1:18027/api/shadow/ghost"
CORE    = "http://127.0.0.1:18020/api/core20/clock"
PRIMARY_ENV = "/etc/a8-core20/external-physical.env"

# Current Primary RAW → Core RAW relationship.
#
# DERIVED DISPLAY INPUT ONLY.
# This does NOT define the independent sealed physical
# Primary RAW / Ghost RAW carrier relationship.
PRIMARY_CORE = Fraction(
    696240371506508163006955635571019774400000000,
    2241158246297961225114074824516769512591423
)

# Sealed 1024-sample Primary RAW / Ghost RAW relationship.
#
# This is the physical carrier relationship.
# It remains independent of later Core rate changes.
SEALED_PG = Fraction(
    111927983568692,
    112357430762055
)

# Current derived Ghost RAW → Core RAW relationship.
#
# Never maintain a second hard-coded Core derivative here.
# Recompute it from the physical carrier seal × current
# Primary→Core relationship.
SEALED_GCORE = SEALED_PG * PRIMARY_CORE

# Reference envelope actually observed in the four independent
# qualification windows. This does NOT redefine the ruler.
REFERENCE_LOW  = Fraction("0.996107636620098")
REFERENCE_HIGH = Fraction("0.996242131551460")

WINDOW = 256

rows = deque(maxlen=WINDOW)

last_run = None
last_seq = None
last_ghost_raw = None
last_primary_epoch = None
accepted = 0


def configured_primary_epoch():
    key = "A8_CORE20_EXTERNAL_PHYSICAL_EPOCH="

    with open(
        PRIMARY_ENV,
        "r",
        encoding="ascii",
    ) as f:
        for line in f:
            line=line.strip()

            if line.startswith(key):
                epoch=line[len(key):]

                if not epoch.isdigit():
                    raise RuntimeError(
                        "PRIMARY_PHYSICAL_EPOCH_CONFIG_INVALID:"
                        + epoch
                    )

                return epoch

    raise RuntimeError(
        "PRIMARY_PHYSICAL_EPOCH_CONFIG_MISSING"
    )


def get(url):
    with urllib.request.urlopen(url, timeout=3) as r:
        return json.load(r)


def read_primary():
    d = get(PRIMARY)

    expected_epoch = configured_primary_epoch()
    actual_epoch = str(d["SOURCE_EPOCH"])

    if actual_epoch != expected_epoch:
        raise RuntimeError(
            "PRIMARY_PHYSICAL_EPOCH_MISMATCH:"
            f"EXPECTED_{expected_epoch}_GOT_{actual_epoch}"
        )

    if d["STATUS"] != "ACTIVE":
        raise RuntimeError(
            "PRIMARY_NOT_ACTIVE:"
            + str(d["STATUS"])
        )

    return int(d["RAW_COUNT"])


def read_ghost():
    d = get(GHOST)

    if d.get("ok") is not True:
        raise RuntimeError("GHOST_ENDPOINT_NOT_OK")

    g = d["ghost"]

    if g.get("linkStatus") != "RECEIVING":
        raise RuntimeError(
            "GHOST_LINK_NOT_RECEIVING:"
            + str(g.get("linkStatus"))
        )

    # Freshness gate only.
    # Receipt age is never used to calculate physical pace.
    age = float(g["receiptAgeSeconds"])

    if age > 0.50:
        raise RuntimeError(
            f"GHOST_TRANSPORT_STALE:{age}"
        )

    return {
        "run": g["runId"],
        "seq": int(g["sequence"]),
        "raw": int(g["rawCount"]),
    }


def read_core_health():
    """
    Optional downstream diagnostic only.

    Primary/Ghost physical qualification must remain valid when
    Core20 is intentionally offline or temporarily unavailable.
    Core health never defines, accepts or rejects the physical
    carrier relationship.
    """
    try:
        d = get(CORE)

        if d.get("ok") is not True:
            raise RuntimeError("CORE_ENDPOINT_NOT_OK")

        c = d["clock"]

        if c.get("status") != "CORE20_CLOCK_RUNNING":
            raise RuntimeError(
                "CORE_NOT_RUNNING:"
                + str(c.get("status"))
            )

        return {
            "available": True,
            "sourceEpoch": str(c["sourceEpoch"]),
            "raw": int(c["currentSelectedRawPulse"]),
            "dayCount": int(c["dayCount"]),
            "dayPhase17": int(c["dayPhase17"]),
        }

    except Exception as err:
        return {
            "available": False,
            "status": "CORE20_HEALTH_UNAVAILABLE",
            "diagnostic": repr(err),
        }


def fit(rows):
    # Same exact regression used for the qualification.
    #
    # Primary midpoint:
    #   (p_before + p_after) / 2
    #
    # fitted against Ghost RAW.

    xs = [r["g"] for r in rows]
    ys = [
        r["p_before"] + r["p_after"]
        for r in rows
    ]

    n = len(rows)

    sx  = sum(xs)
    sy  = sum(ys)
    sxx = sum(x*x for x in xs)
    sxy = sum(x*y for x, y in zip(xs, ys))

    return Fraction(
        n*sxy - sx*sy,
        2*(n*sxx - sx*sx)
    )


print(
    "A8 GHOST HOT STANDBY MONITOR START · "
    "AUTHORITY NONE · CORE WRITES NONE",
    flush=True
)

while True:

    try:
        p_before = read_primary()
        g = read_ghost()
        p_after = read_primary()

        current_primary_epoch = (
            configured_primary_epoch()
        )

        if last_primary_epoch is None:
            last_primary_epoch = (
                current_primary_epoch
            )

        elif (
            current_primary_epoch
            != last_primary_epoch
        ):
            print(
                "PRIMARY CARRIER EPOCH CHANGE · "
                f"{last_primary_epoch} → "
                f"{current_primary_epoch} · "
                "CLEAR QUALIFICATION WINDOW · "
                "NO RAW SPLICE",
                flush=True,
            )

            rows.clear()
            accepted = 0

            last_primary_epoch = (
                current_primary_epoch
            )

        if p_after < p_before:
            raise RuntimeError(
                "PRIMARY_RAW_REGRESSION"
            )

        if (
            last_run is not None
            and g["run"] != last_run
        ):
            print(
                "GHOST RECORDER RUN CHANGE · "
                f"{last_run} → {g['run']} · "
                "CLEAR QUALIFICATION WINDOW · "
                "NO RAW SPLICE",
                flush=True,
            )

            rows.clear()
            accepted = 0

            last_seq = None
            last_ghost_raw = None

        if last_ghost_raw is not None and g["raw"] < last_ghost_raw:
            raise RuntimeError(
                "GHOST_PHYSICAL_RAW_REGRESSION:"
                f"{g['raw']}<{last_ghost_raw}"
            )

        if last_run == g["run"] and last_seq is not None:
            if g["seq"] <= last_seq:
                time.sleep(0.05)
                continue

        last_run = g["run"]
        last_seq = g["seq"]
        last_ghost_raw = g["raw"]

        rows.append({
            "p_before": p_before,
            "p_after": p_after,
            "g": g["raw"],
        })

        accepted += 1

        if accepted % 64 == 0:
            print(
                "STANDBY OBSERVATIONS · "
                f"{accepted} accepted · "
                f"window {len(rows)}/{WINDOW} · "
                f"P={p_before}..{p_after} · "
                f"G={g['raw']}",
                flush=True
            )

        if len(rows) == WINDOW and accepted % 64 == 0:

            r = fit(list(rows))

            first = rows[0]
            last  = rows[-1]

            dg = last["g"] - first["g"]

            p_lo = (
                last["p_before"]
                - first["p_after"]
            )

            p_hi = (
                last["p_after"]
                - first["p_before"]
            )

            predicted = SEALED_PG * dg

            bracket_pass = (
                p_lo <= predicted <= p_hi
            )

            envelope_pass = (
                REFERENCE_LOW <= r <= REFERENCE_HIGH
            )

            ppm = float(
                (r / SEALED_PG - 1)
                * 1_000_000
            )

            core = read_core_health()

            report = {
                "status": (
                    "GHOST_STANDBY_TRACKING"
                    if bracket_pass
                    else "GHOST_STANDBY_CHECK"
                ),

                "authority": "NONE",
                "writesCore20": False,

                "physical": {
                    "primaryEpoch":
                        int(configured_primary_epoch()),
                    "ghostRun": last_run,
                    "ghostRaw": last_ghost_raw,
                },

                "window": {
                    "samples": WINDOW,
                    "ghostDeltaRaw": dg,
                    "primaryObservedLow": p_lo,
                    "primaryObservedHigh": p_hi,
                    "sealedPrediction": float(predicted),
                    "sealedPredictionInsideBracket": bracket_pass,
                },

                "rollingFit": {
                    "primaryPerGhostNumerator": r.numerator,
                    "primaryPerGhostDenominator": r.denominator,
                    "primaryPerGhost": float(r),
                    "differenceFromSealedPPM": ppm,
                    "insideQualificationReferenceEnvelope":
                        envelope_pass,
                },

                "sealedMapping": {
                    "primaryPerGhost":
                        float(SEALED_PG),
                    "ghostToCore":
                        float(SEALED_GCORE),
                },

                "coreHealth": core,
            }

            print(
                json.dumps(
                    report,
                    separators=(",", ":")
                ),
                flush=True
            )

    except RuntimeError as err:

        # A physical RAW regression is a real discontinuity.
        # Stop rather than silently papering across it.
        if str(err).startswith(
            "GHOST_PHYSICAL_RAW_REGRESSION"
        ):
            print(
                "STANDBY PHYSICAL DISCONTINUITY · "
                + str(err),
                flush=True
            )
            raise

        # Ordinary observation/network misses do not alter either
        # physical train and are simply rejected.
        print(
            "STANDBY OBSERVATION REJECTED · "
            + str(err),
            flush=True
        )

    except Exception as err:
        print(
            "STANDBY OBSERVATION REJECTED · "
            + repr(err),
            flush=True
        )

    time.sleep(0.05)
