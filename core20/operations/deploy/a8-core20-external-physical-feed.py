#!/usr/bin/env python3

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request


PHYSICAL = \
    "http://127.0.0.1:28788/snapshot"

JOVIAN = os.environ.get(
    "A8_CORE20_JOVIAN_DRIVER_URL",
    "http://127.0.0.1:18028/state",
)

CORE = \
    "http://127.0.0.1:18020" \
    "/api/core20/external-physical/sample"

EXPECTED_EPOCH = str(
    os.environ[
        "A8_CORE20_EXTERNAL_PHYSICAL_EPOCH"
    ]
)

PHYSICAL_ANCHOR = int(
    os.environ[
        "A8_CORE20_EXTERNAL_PHYSICAL_ANCHOR"
    ]
)

EXPECTED_RULER = str(
    os.environ[
        "A8_CORE20_JOVIAN_BOOTSTRAP_RULER"
    ]
)


def read_json(url, timeout=3):
    with urllib.request.urlopen(
        url,
        timeout=timeout,
    ) as r:
        return json.load(r)


def read_physical():
    p=read_json(
        PHYSICAL,
        timeout=3,
    )

    epoch=str(
        p.get("SOURCE_EPOCH")
    )

    if epoch != EXPECTED_EPOCH:
        raise RuntimeError(
            "HARD_EPOCH_BREAK:"
            f"EXPECTED_{EXPECTED_EPOCH}"
            f"_GOT_{epoch}"
        )

    if p.get("STATUS") != "ACTIVE":
        raise RuntimeError(
            "PHYSICAL_SOURCE_NOT_ACTIVE"
        )

    raw=int(
        p["RAW_COUNT"]
    )

    if raw < PHYSICAL_ANCHOR:
        raise RuntimeError(
            "PHYSICAL_RAW_BEHIND_"
            "EPOCH7_HANDOFF_ANCHOR"
        )

    return p,raw


def inspect_jovian(
    physical_raw,
    previous_raw,
    previous_phase,
):
    j=read_json(
        JOVIAN,
        timeout=3,
    )

    if j.get("ok") is not True:
        raise RuntimeError(
            "JOVIAN_DRIVER_NOT_OK"
        )

    if (
        j.get("status")
        != "JOVIAN_PERIOD_LIVE"
    ):
        raise RuntimeError(
            "JOVIAN_PERIOD_NOT_LIVE"
        )

    jp=j.get("physical") or {}

    if (
        str(jp.get("sourceEpoch"))
        != EXPECTED_EPOCH
    ):
        raise RuntimeError(
            "JOVIAN_OBSERVER_EPOCH_MISMATCH"
        )

    jr=int(
        jp["currentRaw"]
    )

    # Observer may lag the direct physical
    # carrier slightly due polling.
    if abs(
        physical_raw-jr
    ) > 1000:
        raise RuntimeError(
            "JOVIAN_OBSERVER_RAW_TOO_FAR_"
            "FROM_PHYSICAL_CARRIER"
        )

    resonance=(
        j.get("resonance") or {}
    )

    if (
        str(
            resonance.get(
                "normalizedRulerRaw"
            )
        )
        != EXPECTED_RULER
    ):
        raise RuntimeError(
            "JOVIAN_BOOTSTRAP_RULER_CHANGED"
        )

    safety=(
        j.get("safety") or {}
    )

    for key in (
        "writesCore20",
        "writesArduino",
        "usesUTCForProgression",
        "usesHostTimeForProgression",
        "hostSchedulerAffectsPhase",
        "crossEpochRawContinuity",
    ):
        if safety.get(key) is True:
            raise RuntimeError(
                "JOVIAN_SAFETY_VIOLATION:"
                + key
            )

    lanes=j["lanes"]

    phase=(
        str(
            lanes["io"]["phaseQ32"]
        ),
        str(
            lanes["europa"]["phaseQ32"]
        ),
        str(
            lanes["ganymede"]["phaseQ32"]
        ),
    )

    if (
        previous_raw is not None
        and jr < previous_raw
    ):
        raise RuntimeError(
            "JOVIAN_OBSERVER_RAW_REGRESSION"
        )

    if (
        previous_raw is not None
        and jr > previous_raw
        and phase == previous_phase
    ):
        raise RuntimeError(
            "JOVIAN_RAW_MOVED_BUT_PHASE_FROZE"
        )

    return j,jr,phase


def send_physical(p):
    body=json.dumps(
        {
            "SOURCE_EPOCH":
                int(
                    p["SOURCE_EPOCH"]
                ),

            "RAW_COUNT":
                int(
                    p["RAW_COUNT"]
                ),

            "REPORT_SEQUENCE":
                p.get(
                    "REPORT_SEQUENCE"
                ),

            "STATUS":
                p["STATUS"],
        },
        separators=(",",":"),
    ).encode("utf-8")

    req=urllib.request.Request(
        CORE,
        data=body,
        method="POST",
        headers={
            "Content-Type":
                "application/json",

            "X-A8-External-Physical":
                "1",
        },
    )

    with urllib.request.urlopen(
        req,
        timeout=30,
    ) as r:
        reply=json.load(r)

    if reply.get("ok") is not True:
        raise RuntimeError(
            "CORE_REJECTED_PHYSICAL_SAMPLE"
        )

    return reply


def hard_stop_core(reason):
    print(
        "A8 HARD CONTINUITY FAILURE ·",
        reason,
        flush=True,
    )

    print(
        "CORE20 · STOPPING · "
        "NO CONTINUITY INFERENCE",
        flush=True,
    )

    subprocess.run(
        [
            "systemctl",
            "stop",
            "a8-core20.service",
        ],
        check=False,
    )


def initial_live_proof():
    p1,r1=read_physical()

    j1,jr1,q1=inspect_jovian(
        r1,
        None,
        None,
    )

    time.sleep(1)

    p2,r2=read_physical()

    j2,jr2,q2=inspect_jovian(
        r2,
        jr1,
        q1,
    )

    if r2 <= r1:
        raise RuntimeError(
            "PHYSICAL_CARRIER_NOT_ADVANCING"
        )

    if jr2 <= jr1:
        raise RuntimeError(
            "JOVIAN_OBSERVER_NOT_ADVANCING"
        )

    if q2 == q1:
        raise RuntimeError(
            "JOVIAN_PHASE_NOT_ADVANCING"
        )

    return p2,r2,j2,jr2,q2


if "--probe" in sys.argv:
    p,raw,j,jraw,phase = \
        initial_live_proof()

    print(
        json.dumps(
            {
                "ok": True,
                "mode":
                    "PROBE_ONLY_NO_CORE_WRITE",
                "sourceEpoch":
                    EXPECTED_EPOCH,
                "physicalRaw":
                    raw,
                "jovianRaw":
                    jraw,
                "jovianPhaseQ32":
                    phase,
                "observerLossPolicy":
                    "ARDUINO_HOLDOVER",
                "physicalTransportLossPolicy":
                    "FREEZE_AND_SAME_EPOCH_CATCHUP",
                "epochBreakPolicy":
                    "FAIL_CLOSED",
            },
            indent=2,
        )
    )

    raise SystemExit(0)


print(
    "A8-JOVIAN-HOLDOVER-FEED · START · "
    f"EPOCH {EXPECTED_EPOCH}",
    flush=True,
)

print(
    "PERIOD AUTHORITY · JUPITER",
    flush=True,
)

print(
    "PHYSICAL CARRIER · ARDUINO A→B",
    flush=True,
)

print(
    "JOVIAN OBSERVER LOSS · "
    "HOLD LAST RULER / KEEP CARRIER MOVING",
    flush=True,
)

print(
    "PHYSICAL TRANSPORT LOSS · "
    "FREEZE / SAME-EPOCH CATCHUP",
    flush=True,
)


# Start requires proof that the Jovian
# machine is actually alive now.
try:
    p,last_physical,j,last_jovian,last_phase = \
        initial_live_proof()
except Exception as exc:
    print(
        "START REFUSED ·",
        exc,
        flush=True,
    )
    raise SystemExit(43)


last_sent=None
observer_mode="JOVIAN_LIVE"


while True:

    # ------------------------------------------------
    # PHYSICAL CARRIER
    #
    # Network loss is NOT a reason to invent pace
    # and NOT a reason to kill Core.
    #
    # Core simply receives no new target.
    # If the same epoch returns, current RAW catches
    # Core up deterministically.
    # ------------------------------------------------
    try:
        p,raw=read_physical()

    except (
        urllib.error.URLError,
        TimeoutError,
    ) as exc:

        print(
            "PHYSICAL TRANSPORT HOLD ·",
            exc,
            flush=True,
        )

        time.sleep(1)
        continue

    except Exception as exc:
        # Epoch break / source invalidity is a true
        # continuity boundary.
        hard_stop_core(
            str(exc)
        )

        raise SystemExit(43)


    if raw < last_physical:
        hard_stop_core(
            "PHYSICAL RAW REGRESSION · "
            f"{raw} < {last_physical}"
        )

        raise SystemExit(43)

    last_physical=raw


    # ------------------------------------------------
    # JOVIAN OBSERVER
    #
    # Losing software visibility of Jupiter does not
    # mean Jupiter stopped existing.
    #
    # We keep the already-settled ruler and continue
    # on the physical carrier.
    # ------------------------------------------------
    try:
        j,jraw,phase=inspect_jovian(
            raw,
            last_jovian,
            last_phase,
        )

        if observer_mode != "JOVIAN_LIVE":
            print(
                "JOVIAN REACQUIRED · "
                "BOUNDED RATE-ONLY DISCIPLINE MAY RESUME",
                flush=True,
            )

        observer_mode="JOVIAN_LIVE"

        last_jovian=jraw
        last_phase=phase

    except Exception as exc:

        if observer_mode != "JOVIAN_HOLDOVER":
            print(
                "JOVIAN OBSERVER HOLDOVER ·",
                exc,
                flush=True,
            )

            print(
                "CORE CONTINUES · "
                "LAST SETTLED JOVIAN RULER RETAINED",
                flush=True,
            )

        observer_mode="JOVIAN_HOLDOVER"


    # ------------------------------------------------
    # CORE FEED
    #
    # Actual physical RAW only.
    # No host-time derived progression.
    # ------------------------------------------------
    if (
        last_sent is None
        or raw > last_sent
    ):
        try:
            reply=send_physical(
                p
            )

            c=(
                reply.get("clock")
                or {}
            )

            if last_sent is None:
                print(
                    "CORE FEED LOCKED · "
                    f"RAW={raw} · "
                    f"CORE={c.get('currentSelectedRawPulse')} · "
                    f"PHASE17={c.get('dayPhase17')} · "
                    f"JOVIAN_MODE={observer_mode}",
                    flush=True,
                )

            last_sent=raw

        except (
            urllib.error.URLError,
            TimeoutError,
        ) as exc:

            print(
                "CORE TRANSPORT HOLD ·",
                exc,
                flush=True,
            )

        except Exception as exc:

            hard_stop_core(
                "CORE FEED SEMANTIC ERROR · "
                + str(exc)
            )

            raise SystemExit(43)

    time.sleep(0.25)
